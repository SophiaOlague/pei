import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from mineria_datos.data import generator  # noqa: E402
from mineria_datos.data.prepare import (  # noqa: E402
    ALT_TARGET,
    DEFAULT_CONFIG,
    FORBIDDEN_X,
    TARGET,
    TIME_COL,
    load_config,
    load_eligible,
    make_preprocessor,
    prepare,
    split_chronologically,
    validate_temporal_history,
)
from mineria_datos.data.temporal_audit import audit_prior_feature_timing  # noqa: E402


class PrepareDatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # The dataset is regenerated from config/generation_v2.json into a temporary folder, so the tests never
        # depend on (or overwrite) whatever generated CSVs happen to be in data/.
        cls._tmp = tempfile.TemporaryDirectory()
        output = Path(cls._tmp.name)
        rows, audits = generator.generate(generator.load_config(generator.DEFAULT_CONFIG))
        cls.features_path = output / "appointments_synthetic.csv"
        cls.audit_path = output / "appointments_synthetic_audit.csv"
        generator.write_csv(cls.features_path, generator.FEATURE_FIELDS, rows)
        generator.write_csv(cls.audit_path, generator.AUDIT_FIELDS, audits)
        cls.config = load_config(DEFAULT_CONFIG)
        cls.data = load_eligible(cls.features_path, cls.audit_path)
        cls.splits, cls.processor, cls.result = prepare(cls.features_path, cls.audit_path, cls.config)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_eligible_count_and_label_distribution(self):
        self.assertEqual(len(self.data), 8776)
        self.assertEqual(self.data[TARGET].value_counts().to_dict(), {0: 6976, 1: 1800})
        self.assertEqual(self.data["final_outcome"].value_counts().to_dict(), {
            "attended": 6550, "patient_no_show": 1800, "doctor_no_show": 406, "both_no_show": 20,
        })

    def test_only_label_eligible_selects_population(self):
        self.assertTrue((self.data["label_eligible"] == 1).all())
        self.assertFalse(self.data["final_outcome"].isin(["canceled", "rescheduled"]).any())

    def test_identifiers_target_and_post_outcomes_are_not_predictors(self):
        source_columns = set(self.result["summary"]["x_source_columns"])
        transformed_columns = set(self.result["summary"]["transformed_columns"])
        self.assertFalse(source_columns & FORBIDDEN_X)
        self.assertFalse(transformed_columns & FORBIDDEN_X)
        for forbidden in ["appointment_id", "patient_id", "doctor_id", "final_outcome", "label_eligible", "patient_joined", "doctor_joined", TARGET]:
            self.assertNotIn(forbidden, source_columns)

    def test_chronological_splits_have_strict_order_and_expected_sizes(self):
        split = self.splits
        self.assertEqual([len(split[name]) for name in ("train", "validation", "test")], [6143, 1316, 1317])
        self.assertLess(split["train"][TIME_COL].max(), split["validation"][TIME_COL].min())
        self.assertLess(split["validation"][TIME_COL].max(), split["test"][TIME_COL].min())
        self.assertEqual(sum(map(len, split.values())), len(self.data))

    def test_no_duplicate_appointments(self):
        self.assertFalse(self.data["appointment_id"].duplicated().any())
        all_ids = [value for frame in self.splits.values() for value in frame["appointment_id"]]
        self.assertEqual(len(all_ids), len(set(all_ids)))

    def test_label_matches_simulated_outcome(self):
        expected = self.data["final_outcome"].eq("patient_no_show").astype(int)
        np.testing.assert_array_equal(self.data[TARGET].to_numpy(), expected.to_numpy())
        any_absent = self.data["final_outcome"].isin(["patient_no_show", "both_no_show"]).astype(int)
        np.testing.assert_array_equal(self.data[ALT_TARGET].to_numpy(), any_absent.to_numpy())

    def test_preprocessing_is_reproducible_and_fit_on_train_only(self):
        columns = self.result["summary"]["x_source_columns"]
        train = self.splits["train"]
        first, _, _ = make_preprocessor(train, self.config)
        second, _, _ = make_preprocessor(train, self.config)
        first.fit(train[columns])
        second.fit(train[columns])
        np.testing.assert_allclose(first.transform(train[columns]), second.transform(train[columns]))
        onehot = first.named_transformers_["categorical"].named_steps["onehot"]
        for name, categories in zip(self.result["summary"]["categorical_columns"], onehot.categories_):
            self.assertEqual(set(categories), set(train[name].unique()))

    def test_default_config_is_loaded_from_expected_location(self):
        self.assertEqual(DEFAULT_CONFIG.name, "preparation_v2.json")

    def test_both_objective_definitions_remain_comparable(self):
        any_absence = self.data["final_outcome"].isin(["patient_no_show", "both_no_show"]).astype(int)
        self.assertEqual(int(any_absence.sum()), 1820)
        self.assertEqual(int(self.data[TARGET].sum()), 1800)
        self.assertEqual(float(any_absence.mean()), 1820 / 8776)
        self.assertEqual(ALT_TARGET, "y_patient_absent_any")
        self.assertIn(ALT_TARGET, self.splits["train"].columns)
        self.assertIn(TARGET, self.splits["train"].columns)

    def test_history_timing_audit_reconstructs_asof_features_and_excludes_unavailable_outcomes(self):
        result = audit_prior_feature_timing(self.features_path, self.audit_path)
        self.assertEqual(result["rows"], 10000)
        self.assertGreater(result["rows_with_prior_history"], 0)
        self.assertGreater(result["prior_outcomes_unavailable_at_prediction_excluded"], 0)
        self.assertEqual(result["outcome_contributions_available_at_or_after_prediction"], 0)
        self.assertEqual(result["simultaneous_events_used_as_prior"], 0)

    def test_pipeline_rejects_history_that_includes_unavailable_outcomes(self):
        corrupted = self.data.copy()
        index = corrupted.index[corrupted["prior_patient_no_show_count"] > 0][0]
        corrupted.loc[index, "prior_patient_no_show_count"] += 1
        with self.assertRaisesRegex(ValueError, "Historial as-of"):
            validate_temporal_history(corrupted)

    def test_processing_is_reproducible_and_versions_do_not_touch_phase_25_inputs(self):
        again_splits, _, again_result = prepare(self.features_path, self.audit_path, self.config)
        for name in self.result["transformed"]:
            np.testing.assert_array_equal(self.result["transformed"][name].to_numpy(), again_result["transformed"][name].to_numpy())
            np.testing.assert_array_equal(self.splits[name][[ALT_TARGET, TARGET]].to_numpy(),
                                          again_splits[name][[ALT_TARGET, TARGET]].to_numpy())
        self.assertEqual(self.result["summary"]["dataset_version"], "v2")


if __name__ == "__main__":
    unittest.main()
