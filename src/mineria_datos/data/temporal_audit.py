"""Independent timing reconstruction for versioned synthetic appointment histories."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .generator import DEFAULT_CONFIG, load_config
from .prepare import DEFAULT_AUDIT, DEFAULT_FEATURES, ID_COL


def audit_prior_feature_timing(features_path: Path = DEFAULT_FEATURES, audit_path: Path = DEFAULT_AUDIT) -> dict[str, int | str]:
    features = pd.read_csv(features_path)
    audit = pd.read_csv(audit_path)
    data = features.merge(audit, on=ID_COL, validate="one_to_one")
    for column in ("scheduled_at", "created_at", "outcome_available_at"):
        data[column] = pd.to_datetime(data[column], utc=True, errors="raise")
    data = data.sort_values(["scheduled_at", ID_COL], kind="mergesort")
    prior: dict[str, list[tuple[pd.Series, pd.Series]]] = {}
    reservations_by_patient = {patient: group[[ID_COL, "created_at"]].to_dict("records")
                              for patient, group in data.groupby("patient_id", sort=False)}
    unavailable_prior_outcome_candidates = 0
    simultaneous_events_encountered = 0
    simultaneous_events_used = 0
    overlap_pairs = 0
    rows_with_overlap = 0
    rows_with_booking_history = 0
    feature_contributions = {"prior_attended_rate": 0, "prior_patient_no_show_count": 0,
                              "prior_cancel_count": 0, "prior_reschedule_count": 0}
    history_contributions = 0
    for _, current in data.iterrows():
        patient_history = prior.setdefault(current["patient_id"], [])
        preceding = [(f, a) for f, a in patient_history
                     if current["scheduled_at"] - pd.Timedelta(days=90) <= f["scheduled_at"] <= current["scheduled_at"]]
        simultaneous_events_encountered += sum(f["scheduled_at"] == current["scheduled_at"] for f, _ in preceding)
        prior_started = [(f, a) for f, a in preceding if f["scheduled_at"] < current["scheduled_at"]]
        outcome_candidates = prior_started
        unavailable_prior_outcome_candidates += sum(
            a["outcome_available_at"] >= current["scheduled_at"] for _, a in prior_started)
        # The start must be strictly earlier, and an outcome must be available strictly before prediction_at.
        eligible_outcomes = [(f, a) for f, a in preceding
                             if f["scheduled_at"] < current["scheduled_at"]
                             and a["outcome_available_at"] < current["scheduled_at"]]
        all_prior_scheduled = [(f, a) for f, a in preceding
                               if f["scheduled_at"] < current["scheduled_at"] and f["created_at"] < current["scheduled_at"]]
        simultaneous_events_used += sum(f["scheduled_at"] == current["scheduled_at"] for f, _ in all_prior_scheduled)
        booking_count = sum(current["scheduled_at"] - pd.Timedelta(days=90) <= booking["created_at"] < current["scheduled_at"]
                            and booking[ID_COL] != current[ID_COL]
                            for booking in reservations_by_patient[current["patient_id"]])
        if int(current["prior_appointments_90d"]) != booking_count:
            raise ValueError(f"prior_appointments_90d no coincide con reservas existentes para {current[ID_COL]}")
        rows_with_booking_history += bool(booking_count)
        clinical = [(f, a) for f, a in eligible_outcomes
                    if a["final_outcome"] in {"attended", "patient_no_show", "doctor_no_show", "both_no_show"}]
        attended = sum(a["patient_joined"] == 1 for _, a in clinical)
        expected = {
            "prior_attended_rate": round(attended / len(clinical), 6) if clinical else 0.0,
            "prior_patient_no_show_count": sum(a["final_outcome"] == "patient_no_show" for _, a in eligible_outcomes),
            "prior_cancel_count": sum(a["final_outcome"] == "canceled" for _, a in eligible_outcomes),
            "prior_reschedule_count": sum(a["final_outcome"] == "rescheduled" for _, a in eligible_outcomes),
        }
        for field, value in expected.items():
            if current[field] != value:
                raise ValueError(f"{field} no coincide con reconstrucción independiente para {current[ID_COL]}")
        history_contributions += len(eligible_outcomes)
        close = [(f, a) for f, a in outcome_candidates
                 if current["scheduled_at"] - f["scheduled_at"] < pd.Timedelta(minutes=30)]
        if close:
            rows_with_overlap += 1
            overlap_pairs += len(close)
            feature_contributions["prior_attended_rate"] += sum(a["final_outcome"] in {"attended", "patient_no_show", "doctor_no_show", "both_no_show"} for _, a in close)
            feature_contributions["prior_patient_no_show_count"] += sum(a["final_outcome"] == "patient_no_show" for _, a in close)
            feature_contributions["prior_cancel_count"] += sum(a["final_outcome"] == "canceled" for _, a in close)
            feature_contributions["prior_reschedule_count"] += sum(a["final_outcome"] == "rescheduled" for _, a in close)
        patient_history.append((current, current))
    return {
        "dataset_version": load_config(DEFAULT_CONFIG)["dataset_version"],
        "rows": len(data),
        "rows_with_prior_history": int(rows_with_booking_history),
        "history_outcome_contributions_used": history_contributions,
        "prior_outcomes_unavailable_at_prediction_excluded": int(unavailable_prior_outcome_candidates),
        "outcome_contributions_available_at_or_after_prediction": 0,
        "rows_with_prior_start_within_30_minutes": rows_with_overlap,
        "prior_start_pairs_within_30_minutes": overlap_pairs,
        "overlap_sensitive_feature_contributions": feature_contributions,
        "simultaneous_events_encountered": simultaneous_events_encountered,
        "simultaneous_events_used_as_prior": simultaneous_events_used,
    }
