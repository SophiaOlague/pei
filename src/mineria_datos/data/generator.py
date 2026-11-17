"""Versioned, reproducible generator of fully synthetic medical appointments (stdlib only)."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import random
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CONFIG = ROOT / "config" / "generation_v2.json"
FEATURE_FIELDS = [
    "appointment_id", "patient_id", "doctor_id", "specialty_code", "created_at", "scheduled_at",
    "lead_time_hours", "appointment_type", "weekday", "hour", "month", "prior_appointments_90d",
    "prior_attended_rate", "prior_patient_no_show_count", "prior_cancel_count", "prior_reschedule_count",
    "y_patient_absent_any", "y_patient_no_show",
]
AUDIT_FIELDS = [
    "appointment_id", "final_outcome", "label_eligible", "patient_joined", "doctor_joined",
    "started_at", "ended_at", "outcome_available_at", "transition_at",
]
OUTCOMES = ("attended", "patient_no_show", "doctor_no_show", "both_no_show", "canceled", "rescheduled")
RESOLVED_CLINICAL = {"attended", "patient_no_show", "doctor_no_show", "both_no_show"}


def load_config(path: Path = DEFAULT_CONFIG) -> dict[str, Any]:
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def _uuid(rng: random.Random) -> str:
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def _iso(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-value))


def _outcome_times(scheduled: datetime, created: datetime, outcome: str, rules: dict[str, Any],
                   rng: random.Random) -> dict[str, datetime | None]:
    """Synthetic adjudication rules; no universal real-world resolution rule is implied."""
    if outcome in ("canceled", "rescheduled"):
        # Transition happens during the booking lead interval, before the appointment starts.
        fraction = rng.uniform(0.05, 0.95)
        transition = created + (scheduled - created) * fraction
        return {"started_at": None, "ended_at": None, "transition_at": transition,
                "outcome_available_at": transition}

    if outcome == "attended":
        offset = rng.randint(rules["arrival_offset_min_minutes"], rules["arrival_offset_max_minutes"])
        started = scheduled + timedelta(minutes=offset)
        duration = rng.randint(rules["completed_duration_min_minutes"], rules["completed_duration_max_minutes"])
        ended = started + timedelta(minutes=duration)
        return {"started_at": started, "ended_at": ended, "transition_at": None,
                "outcome_available_at": ended}

    if outcome == "patient_no_show":
        # Doctor enters; patient tolerance runs from scheduled time. If arrival is later, adjudication is immediate.
        started = scheduled + timedelta(minutes=rng.randint(0, rules["participant_arrival_max_minutes"]))
        resolved = max(started, scheduled + timedelta(minutes=rules["patient_tolerance_minutes"]))
        return {"started_at": started, "ended_at": resolved, "transition_at": None,
                "outcome_available_at": resolved}

    if outcome == "doctor_no_show":
        # Patient enters and waits until the configured doctor wait window has elapsed.
        started = scheduled + timedelta(minutes=rng.randint(0, rules["participant_arrival_max_minutes"]))
        resolved = max(started, scheduled + timedelta(minutes=rules["doctor_wait_minutes"]))
        return {"started_at": started, "ended_at": resolved, "transition_at": None,
                "outcome_available_at": resolved}

    # Both absent: no session starts; synthetic adjudication waits out the doctor window.
    resolved = scheduled + timedelta(minutes=rules["doctor_wait_minutes"])
    return {"started_at": None, "ended_at": None, "transition_at": None,
            "outcome_available_at": resolved}


def derive_prior_features(prediction_at: datetime, created_at: datetime,
                           prior_events: list[dict[str, Any]],
                           reservation_events: list[dict[str, Any]] | None = None,
                           current_appointment_id: str | None = None) -> dict[str, int | float]:
    """Count prior reservations by creation time; derive outcome stats as-of the strict availability cutoff."""
    window_start = prediction_at - timedelta(days=90)
    reservations = reservation_events if reservation_events is not None else prior_events
    # Only the current appointment is excluded; without an id to exclude, every reservation in the window counts.
    prior_bookings = [event for event in reservations
                      if window_start <= event["created_at"] < prediction_at
                      and (current_appointment_id is None or event.get("appointment_id") != current_appointment_id)]
    resolved = [event for event in prior_events
                if window_start <= event["scheduled_at"] < prediction_at
                and event["created_at"] < prediction_at
                and event["outcome_available_at"] < prediction_at]
    clinical = [event for event in resolved if event["outcome"] in RESOLVED_CLINICAL]
    attended = sum(event["outcome"] in ("attended", "doctor_no_show") for event in clinical)
    return {
        "prior_appointments_90d": len(prior_bookings),
        "prior_attended_rate": round(attended / len(clinical), 6) if clinical else 0.0,
        "prior_patient_no_show_count": sum(event["outcome"] == "patient_no_show" for event in resolved),
        "prior_cancel_count": sum(event["outcome"] == "canceled" for event in resolved),
        "prior_reschedule_count": sum(event["outcome"] == "rescheduled" for event in resolved),
    }


def generate(config: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (features+two targets, post-event audit), deriving histories as-of scheduled_at."""
    count = int(config["n_records"])
    months = int(config["period_months"])
    seed = int(config["seed"])
    distribution = config["outcome_distribution"]
    rules = config["synthetic_timing_rules"]
    if count < 1 or months < 1:
        raise ValueError("n_records y period_months deben ser positivos")
    if set(distribution) != set(OUTCOMES) or any(v < 0 for v in distribution.values()) or sum(distribution.values()) <= 0:
        raise ValueError(f"outcome_distribution debe contener {OUTCOMES} y pesos no negativos con suma positiva")

    rng = random.Random(seed)
    start = datetime.fromisoformat(config["period_start"].replace("Z", "+00:00")).astimezone(timezone.utc)
    end = start + timedelta(days=round(months * 365.2425 / 12))
    patients = [_uuid(rng) for _ in range(int(config["n_patients"]))]
    doctors = [_uuid(rng) for _ in range(int(config["n_doctors"]))]
    specialties = list(config["specialty_codes"])
    if not patients or not doctors or not specialties:
        raise ValueError("Se requiere al menos un paciente, médico y especialidad sintéticos")
    doctor_specialty = {doctor: rng.choice(specialties) for doctor in doctors}
    behavior = {patient: rng.choices(["high_attendance", "variable", "frequent_no_show"], [0.55, 0.30, 0.15])[0]
                for patient in patients}

    events = []
    span_seconds = int((end - start).total_seconds())
    for _ in range(count):
        scheduled = start + timedelta(seconds=rng.randrange(span_seconds))
        appointment_type = "emergency" if rng.random() < float(config["emergency_share"]) else "scheduled"
        lead = rng.uniform(0.05, 12.0) if appointment_type == "emergency" else min(rng.expovariate(1 / 120), 24 * 90)
        created = scheduled - timedelta(hours=lead)
        patient, doctor = rng.choice(patients), rng.choice(doctors)
        events.append((scheduled, created, patient, doctor, appointment_type, lead, _uuid(rng)))
    events.sort(key=lambda item: (item[0], item[6]))

    reservations_by_patient: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for scheduled, created, patient, _, _, _, appointment_id in events:
        reservations_by_patient[patient].append({"appointment_id": appointment_id, "scheduled_at": scheduled,
                                                 "created_at": created})
    prior_events: dict[str, list[dict[str, Any]]] = defaultdict(list)
    rows: list[dict[str, Any]] = []
    audits: list[dict[str, Any]] = []
    for scheduled, created, patient, doctor, appointment_type, lead, appointment_id in events:
        history_features = derive_prior_features(scheduled, created, prior_events[patient],
                                                  reservations_by_patient[patient], appointment_id)
        resolved_prior = [event for event in prior_events[patient]
                          if event["outcome_available_at"] < scheduled
                          and scheduled - timedelta(days=90) <= event["scheduled_at"] < scheduled]
        attended_count = sum(event["outcome"] in ("attended", "doctor_no_show") for event in resolved_prior)
        any_absences = sum(event["outcome"] in ("patient_no_show", "both_no_show") for event in resolved_prior)

        kind = behavior[patient]
        base = {"high_attendance": -2.7, "variable": -1.25, "frequent_no_show": 0.1}[kind]
        base += 0.65 if lead > 24 * 30 else 0.0
        base += 0.30 if 0 < lead < 12 else 0.0
        base += 0.25 if scheduled.weekday() >= 5 else 0.0
        base += 0.012 * abs(scheduled.hour - 11)
        base += -0.35 if appointment_type == "emergency" else 0.0
        base += min(any_absences, 4) * 0.28 - min(attended_count, 5) * 0.08
        p_absent = _sigmoid(base)
        requested = rng.choices(OUTCOMES, weights=[distribution[o] for o in OUTCOMES], k=1)[0]
        if requested in ("patient_no_show", "both_no_show"):
            outcome = requested if rng.random() < p_absent else "attended"
        elif requested == "attended":
            outcome = "patient_no_show" if rng.random() < p_absent else "attended"
        else:
            outcome = requested

        times = _outcome_times(scheduled, created, outcome, rules, rng)
        eligible = outcome in RESOLVED_CLINICAL
        patient_joined = outcome in ("attended", "doctor_no_show")
        doctor_joined = outcome in ("attended", "patient_no_show")
        rows.append({
            "appointment_id": appointment_id, "patient_id": patient, "doctor_id": doctor,
            "specialty_code": doctor_specialty[doctor], "created_at": _iso(created), "scheduled_at": _iso(scheduled),
            "lead_time_hours": round(lead, 3), "appointment_type": appointment_type,
            "weekday": scheduled.weekday(), "hour": scheduled.hour, "month": scheduled.month,
            **history_features,
            "y_patient_absent_any": int(outcome in ("patient_no_show", "both_no_show")),
            "y_patient_no_show": int(outcome == "patient_no_show"),
        })
        audit = {
            "appointment_id": appointment_id, "final_outcome": outcome, "label_eligible": int(eligible),
            "patient_joined": int(patient_joined), "doctor_joined": int(doctor_joined),
            "started_at": _iso(times["started_at"]), "ended_at": _iso(times["ended_at"]),
            "outcome_available_at": _iso(times["outcome_available_at"]),
            "transition_at": _iso(times["transition_at"]),
        }
        audits.append(audit)
        prior_events[patient].append({"scheduled_at": scheduled, "created_at": created,
                                      "outcome_available_at": times["outcome_available_at"], "outcome": outcome})
    validate(rows, audits, config)
    return rows, audits


def _parse(value: str) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def validate(rows: list[dict[str, Any]], audits: list[dict[str, Any]], config: dict[str, Any]) -> None:
    if len(rows) != int(config["n_records"]) or len(audits) != len(rows):
        raise ValueError("Cantidad de filas inconsistente")
    ids = [row["appointment_id"] for row in rows]
    if len(ids) != len(set(ids)) or len({row["appointment_id"] for row in audits}) != len(audits):
        raise ValueError("appointment_id debe ser único")
    feature_map = {row["appointment_id"]: row for row in rows}
    audit_map = {row["appointment_id"]: row for row in audits}
    if set(feature_map) != set(audit_map):
        raise ValueError("Los archivos no tienen el mismo conjunto de citas")
    sensitive = {"curp", "name", "first_name", "last_name", "phone", "email", "birth_date", "address", "reason", "notes"}
    if sensitive.intersection(rows[0]) or sensitive.intersection(audits[0]):
        raise ValueError("Se detectó una columna personal no permitida")

    all_reservations_by_patient: dict[str, list[tuple[dict[str, Any], datetime]]] = defaultdict(list)
    for candidate in rows:
        all_reservations_by_patient[candidate["patient_id"]].append((candidate, _parse(candidate["created_at"])))
    previous_by_patient: dict[str, list[tuple[dict[str, Any], dict[str, Any]]]] = defaultdict(list)
    for row in sorted(rows, key=lambda item: (item["scheduled_at"], item["appointment_id"])):
        audit = audit_map[row["appointment_id"]]
        scheduled, created = _parse(row["scheduled_at"]), _parse(row["created_at"])
        available, started, ended, transition = (_parse(audit[key]) for key in
                                                  ("outcome_available_at", "started_at", "ended_at", "transition_at"))
        if scheduled is None or created is None or created > scheduled or row["lead_time_hours"] < 0:
            raise ValueError("Fecha/anticipación incoherente")
        if available is None:
            raise ValueError("outcome_available_at es obligatorio")
        outcome = audit["final_outcome"]
        if outcome not in OUTCOMES:
            raise ValueError("final_outcome no pertenece al catálogo sintético")
        expected_joined = {
            "attended": (1, 1), "patient_no_show": (0, 1), "doctor_no_show": (1, 0),
            "both_no_show": (0, 0), "canceled": (0, 0), "rescheduled": (0, 0),
        }[outcome]
        if (audit["patient_joined"], audit["doctor_joined"]) != expected_joined:
            raise ValueError("Marcas de conexión no corresponden al outcome")
        if audit["label_eligible"] != int(outcome in RESOLVED_CLINICAL):
            raise ValueError("label_eligible no corresponde al outcome")
        if outcome in ("canceled", "rescheduled"):
            if transition is None or transition != available or transition < created or transition >= scheduled or started or ended:
                raise ValueError("Transición de cancelación/reprogramación incoherente")
        else:
            if transition is not None:
                raise ValueError("Outcome clínico no debe tener transition_at")
            if available < scheduled:
                raise ValueError("Outcome clínico no puede estar disponible antes de la cita")
            if started and started > available or ended and (started is None or ended < started or ended > available):
                raise ValueError("Timestamps de sesión incoherentes")
            if outcome == "attended" and (started is None or ended is None or available != ended):
                raise ValueError("Asistencia requiere sesión finalizada y outcome al cierre")
            if outcome == "both_no_show" and (started is not None or ended is not None):
                raise ValueError("Doble inasistencia no inicia sesión")
        if row["y_patient_absent_any"] != int(outcome in ("patient_no_show", "both_no_show")):
            raise ValueError("y_patient_absent_any no corresponde al outcome")
        if row["y_patient_no_show"] != int(outcome == "patient_no_show"):
            raise ValueError("y_patient_no_show no corresponde al outcome")

        history_all = [(prior, prior_audit) for prior, prior_audit in previous_by_patient[row["patient_id"]]
                       if scheduled - timedelta(days=90) <= _parse(prior["scheduled_at"]) < scheduled
                       and _parse(prior["created_at"]) < scheduled]
        history_resolved = [(prior, prior_audit) for prior, prior_audit in history_all
                            if _parse(prior_audit["outcome_available_at"]) < scheduled]
        resolved_outcomes = [prior_audit["final_outcome"] for _, prior_audit in history_resolved]
        rate_denominator = [value for value in resolved_outcomes if value in RESOLVED_CLINICAL]
        attended_count = sum(value in ("attended", "doctor_no_show") for value in rate_denominator)
        expected = {
            "prior_appointments_90d": sum(
                scheduled - timedelta(days=90) <= reservation_created < scheduled
                and candidate["appointment_id"] != row["appointment_id"]
                for candidate, reservation_created in all_reservations_by_patient[row["patient_id"]]),
            "prior_patient_no_show_count": sum(value == "patient_no_show" for value in resolved_outcomes),
            "prior_cancel_count": sum(value == "canceled" for value in resolved_outcomes),
            "prior_reschedule_count": sum(value == "rescheduled" for value in resolved_outcomes),
            "prior_attended_rate": round(attended_count / len(rate_denominator), 6) if rate_denominator else 0.0,
        }
        if any(row[field] != value for field, value in expected.items()):
            raise ValueError(f"Features históricas no coinciden con reconstrucción as-of para {row['appointment_id']}")
        previous_by_patient[row["patient_id"]].append((row, audit))


def write_csv(path: Path, fields: list[str], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    config = load_config(args.config)
    output_dir = args.output_dir or ROOT / "data" / "synthetic" / config["dataset_version"]
    rows, audits = generate(config)
    write_csv(output_dir / "appointments_synthetic.csv", FEATURE_FIELDS, rows)
    write_csv(output_dir / "appointments_synthetic_audit.csv", AUDIT_FIELDS, audits)
    counts = Counter(row["final_outcome"] for row in audits)
    eligible = sum(row["label_eligible"] for row in audits)
    labels_any = sum(row["y_patient_absent_any"] for row in rows)
    labels_exclusive = sum(row["y_patient_no_show"] for row in rows)
    summary = {"dataset_version": config["dataset_version"], "records": len(rows), "eligible_records": eligible,
               "period_start": config["period_start"], "period_months": config["period_months"], "seed": config["seed"],
               "outcome_counts": dict(sorted(counts.items())),
               "target_counts": {"y_patient_absent_any": {"1": labels_any, "0": eligible - labels_any},
                                 "y_patient_no_show": {"1": labels_exclusive, "0": eligible - labels_exclusive}}}
    with (output_dir / "summary.json").open("w", encoding="utf-8") as stream:
        json.dump(summary, stream, indent=2, ensure_ascii=False)
    checksums = {name: hashlib.sha256((output_dir / name).read_bytes()).hexdigest()
                 for name in ("appointments_synthetic.csv", "appointments_synthetic_audit.csv", "summary.json")}
    with (output_dir / "dataset_manifest.json").open("w", encoding="utf-8") as stream:
        json.dump({"dataset_version": config["dataset_version"], "seed": config["seed"],
                   "config": config, "config_sha256": hashlib.sha256(args.config.read_bytes()).hexdigest(),
                   "files_sha256": checksums}, stream, indent=2, ensure_ascii=False)
    print(json.dumps({**summary, "output_dir": str(output_dir)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
