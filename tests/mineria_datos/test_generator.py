import copy
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from mineria_datos.data.generator import (  # noqa: E402
    FEATURE_FIELDS,
    generate,
    load_config,
    derive_prior_features,
    validate,
)


class SyntheticGeneratorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = load_config()

    def test_default_dataset_validates_and_has_10000_records(self):
        features, audit = generate(self.config)
        validate(features, audit, self.config)
        self.assertEqual(len(features), 10_000)
        self.assertEqual(len(audit), 10_000)
        self.assertEqual(set(features[0]), set(FEATURE_FIELDS))

    def test_same_config_produces_identical_records(self):
        self.assertEqual(generate(self.config), generate(self.config))

    def test_changed_seed_changes_identifiers_and_results(self):
        changed = copy.deepcopy(self.config)
        changed["seed"] += 1
        self.assertNotEqual(generate(self.config), generate(changed))

    def test_audit_only_outcomes_are_never_patient_no_show_labels(self):
        features, audits = generate(self.config)
        labels = {row["appointment_id"]: (row["y_patient_absent_any"], row["y_patient_no_show"]) for row in features}
        for row in audits:
            any_absent, exclusive = labels[row["appointment_id"]]
            self.assertEqual(any_absent, int(row["final_outcome"] in {"patient_no_show", "both_no_show"}))
            self.assertEqual(exclusive, int(row["final_outcome"] == "patient_no_show"))

    def test_current_outcome_timestamps_match_synthetic_rules(self):
        features, audits = generate(self.config)
        rows = {row["appointment_id"]: row for row in features}
        for audit in audits:
            scheduled = datetime.fromisoformat(rows[audit["appointment_id"]]["scheduled_at"].replace("Z", "+00:00"))
            available = datetime.fromisoformat(audit["outcome_available_at"].replace("Z", "+00:00"))
            if audit["final_outcome"] in {"canceled", "rescheduled"}:
                transition = datetime.fromisoformat(audit["transition_at"].replace("Z", "+00:00"))
                self.assertEqual(transition, available)
                self.assertLess(transition, scheduled)
            else:
                self.assertGreaterEqual(available, scheduled)

    def test_history_is_temporally_reconstructed(self):
        features, audit = generate(self.config)
        validate(features, audit, self.config)
        # Perturbing a prior counter must be caught by the temporal consistency validator.
        index = next(i for i, row in enumerate(features) if row["prior_appointments_90d"] > 0)
        altered = copy.deepcopy(features)
        altered[index]["prior_appointments_90d"] += 1
        with self.assertRaisesRegex(ValueError, "Features históricas"):
            validate(altered, audit, self.config)

    def test_impossible_negative_lead_time_is_rejected(self):
        features, audit = generate(self.config)
        altered = copy.deepcopy(features)
        altered[0]["lead_time_hours"] = -0.1
        with self.assertRaisesRegex(ValueError, "Fecha/anticipación"):
            validate(altered, audit, self.config)

    def test_unavailable_and_simultaneous_outcomes_are_excluded_but_booking_count_is_kept(self):
        prediction = datetime(2025, 5, 1, 10, tzinfo=timezone.utc)
        prior_events = [
            {"appointment_id": "overlap", "scheduled_at": prediction - timedelta(minutes=10), "created_at": prediction - timedelta(days=1),
             "outcome_available_at": prediction + timedelta(minutes=20), "outcome": "patient_no_show"},
            {"appointment_id": "simultaneous", "scheduled_at": prediction, "created_at": prediction - timedelta(days=1),
             "outcome_available_at": prediction + timedelta(minutes=30), "outcome": "both_no_show"},
        ]
        reservations = prior_events + [{"appointment_id": "current", "created_at": prediction - timedelta(hours=1)}]
        actual = derive_prior_features(prediction, prediction - timedelta(hours=1), prior_events,
                                       reservations, current_appointment_id="current")
        # The two known reservations count, but their unresolved/simultaneous outcomes do not.
        self.assertEqual(actual["prior_appointments_90d"], 2)
        self.assertEqual(actual["prior_patient_no_show_count"], 0)
        self.assertEqual(actual["prior_attended_rate"], 0.0)

    def test_outcome_available_exactly_at_cutoff_is_not_available_before_cutoff(self):
        prediction = datetime(2025, 5, 1, 10, tzinfo=timezone.utc)
        event = {"scheduled_at": prediction - timedelta(hours=1), "created_at": prediction - timedelta(days=1),
                 "outcome_available_at": prediction, "outcome": "attended"}
        actual = derive_prior_features(prediction, prediction - timedelta(hours=1), [event])
        self.assertEqual(actual["prior_appointments_90d"], 1)
        self.assertEqual(actual["prior_attended_rate"], 0.0)


if __name__ == "__main__":
    unittest.main()
