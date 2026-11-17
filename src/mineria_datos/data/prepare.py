"""Join, filter, split, and preprocess the synthetic appointments without fitting on future rows."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_FEATURES = ROOT / "data" / "synthetic" / "v2" / "appointments_synthetic.csv"
DEFAULT_AUDIT = ROOT / "data" / "synthetic" / "v2" / "appointments_synthetic_audit.csv"
DEFAULT_CONFIG = ROOT / "config" / "preparation_v2.json"
ID_COL = "appointment_id"
TIME_COL = "scheduled_at"
TARGET = "y_patient_no_show"
ALT_TARGET = "y_patient_absent_any"
ID_COLUMNS = {"appointment_id", "patient_id", "doctor_id"}
POST_OUTCOMES = {"final_outcome", "patient_joined", "doctor_joined", "label_eligible"}
TARGET_OUTCOME = {
    "attended": 0,
    "patient_no_show": 1,
    "doctor_no_show": 0,
    "both_no_show": 0,
}
FEATURE_COLUMNS = {
    "specialty_code", "lead_time_hours", "appointment_type", "weekday", "hour", "month",
    "prior_appointments_90d", "prior_attended_rate", "prior_patient_no_show_count",
    "prior_cancel_count", "prior_reschedule_count",
}
TEMPORAL_AUDIT_COLUMNS = {"started_at", "ended_at", "outcome_available_at", "transition_at"}
FORBIDDEN_X = ID_COLUMNS | {TARGET, ALT_TARGET, TIME_COL, "created_at"} | POST_OUTCOMES | TEMPORAL_AUDIT_COLUMNS


def load_config(path: Path = DEFAULT_CONFIG) -> dict[str, Any]:
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def validate_temporal_history(combined: pd.DataFrame) -> None:
    """Independently reconstruct historical fields using strict outcome availability cutoffs."""
    ordered = combined.copy()
    for column in ("created_at", TIME_COL, "outcome_available_at"):
        ordered[column] = pd.to_datetime(ordered[column], utc=True, errors="raise")
    reservations_by_patient = {
        patient: group[[ID_COL, "created_at"]].to_dict("records")
        for patient, group in ordered.groupby("patient_id", sort=False)
    }
    history_by_patient: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in ordered.sort_values([TIME_COL, ID_COL], kind="mergesort").to_dict("records"):
        prediction_at = row[TIME_COL]
        previous = [item for item in history_by_patient[row["patient_id"]]
                    if prediction_at - pd.Timedelta(days=90) <= item[TIME_COL] < prediction_at
                    and item["created_at"] < prediction_at]
        resolved = [item for item in previous if item["outcome_available_at"] < prediction_at]
        clinical = [item for item in resolved if item["final_outcome"] in TARGET_OUTCOME]
        expected = {
            "prior_appointments_90d": sum(
                prediction_at - pd.Timedelta(days=90) <= reservation["created_at"] < prediction_at
                and reservation[ID_COL] != row[ID_COL]
                for reservation in reservations_by_patient[row["patient_id"]]),
            "prior_attended_rate": round(sum(item["patient_joined"] == 1 for item in clinical) / len(clinical), 6) if clinical else 0.0,
            "prior_patient_no_show_count": sum(item["final_outcome"] == "patient_no_show" for item in resolved),
            "prior_cancel_count": sum(item["final_outcome"] == "canceled" for item in resolved),
            "prior_reschedule_count": sum(item["final_outcome"] == "rescheduled" for item in resolved),
        }
        if any(row[name] != value for name, value in expected.items()):
            raise ValueError(f"Historial as-of no válido para appointment_id={row[ID_COL]}")
        history_by_patient[row["patient_id"]].append(row)


def load_eligible(features_path: Path = DEFAULT_FEATURES, audit_path: Path = DEFAULT_AUDIT) -> pd.DataFrame:
    features = pd.read_csv(features_path)
    audit = pd.read_csv(audit_path)
    required_features = ID_COLUMNS | {"specialty_code", "created_at", TIME_COL, "lead_time_hours", "appointment_type",
        "weekday", "hour", "month", "prior_appointments_90d", "prior_attended_rate",
        "prior_patient_no_show_count", "prior_cancel_count", "prior_reschedule_count", TARGET, ALT_TARGET}
    required_audit = {ID_COL, "final_outcome", "label_eligible", "patient_joined", "doctor_joined", *TEMPORAL_AUDIT_COLUMNS}
    if not required_features.issubset(features.columns):
        raise ValueError(f"Faltan columnas requeridas en features: {sorted(required_features - set(features.columns))}")
    if not required_audit.issubset(audit.columns):
        raise ValueError(f"Faltan columnas requeridas en auditoría: {sorted(required_audit - set(audit.columns))}")
    if features[ID_COL].isna().any() or audit[ID_COL].isna().any():
        raise ValueError("appointment_id no puede ser nulo")
    if features[ID_COL].duplicated().any() or audit[ID_COL].duplicated().any():
        raise ValueError("appointment_id debe ser único en ambos archivos")
    if set(features[ID_COL]) != set(audit[ID_COL]):
        raise ValueError("Los CSV no contienen el mismo conjunto de appointment_id")

    combined = features.merge(audit, on=ID_COL, how="inner", validate="one_to_one", suffixes=("", "_audit"))
    if not set(combined["label_eligible"].unique()).issubset({0, 1}):
        raise ValueError("label_eligible debe ser binario")
    if not set(combined["final_outcome"].unique()).issubset(set(TARGET_OUTCOME) | {"canceled", "rescheduled"}):
        raise ValueError("final_outcome fuera del catálogo esperado")
    expected = combined["final_outcome"].map(TARGET_OUTCOME).fillna(0).astype(int)
    if not combined[TARGET].isin([0, 1]).all() or not combined[TARGET].astype(int).equals(expected):
        raise ValueError("y_patient_no_show no corresponde a final_outcome")
    expected_alt = combined["final_outcome"].isin(["patient_no_show", "both_no_show"]).astype(int)
    if not combined[ALT_TARGET].isin([0, 1]).all() or not combined[ALT_TARGET].astype(int).equals(expected_alt):
        raise ValueError("y_patient_absent_any no corresponde a final_outcome")
    expected_eligible = combined["final_outcome"].isin(TARGET_OUTCOME).astype(int)
    if not combined["label_eligible"].astype(int).equals(expected_eligible):
        raise ValueError("label_eligible no corresponde a la definición de outcomes elegibles")

    validate_temporal_history(combined)

    # Only this flag chooses the training/evaluation population. Outcomes are consistency-checked,
    # but never used as the eligibility predicate.
    eligible = combined.loc[combined["label_eligible"].eq(1)].copy()
    if eligible["final_outcome"].isin(["canceled", "rescheduled"]).any():
        raise ValueError("Cancelaciones/reprogramaciones marcadas elegibles")
    if not eligible[TARGET].isin([0, 1]).all():
        raise ValueError("Etiqueta no binaria en población elegible")
    eligible[TIME_COL] = pd.to_datetime(eligible[TIME_COL], utc=True, errors="raise")
    if eligible[TIME_COL].isna().any():
        raise ValueError("scheduled_at no puede ser nulo")
    if eligible[ID_COL].duplicated().any():
        raise ValueError("Hay filas duplicadas en población elegible")
    return eligible.sort_values([TIME_COL, ID_COL], kind="mergesort").reset_index(drop=True)


def split_chronologically(data: pd.DataFrame, config: dict[str, Any]) -> dict[str, pd.DataFrame]:
    train_f = float(config["train_fraction"])
    val_f = float(config["validation_fraction"])
    test_f = float(config["test_fraction"])
    if min(train_f, val_f, test_f) <= 0 or abs(train_f + val_f + test_f - 1.0) > 1e-9:
        raise ValueError("Fracciones train/validation/test deben ser positivas y sumar 1")
    n = len(data)
    train_end = int(n * train_f)
    validation_end = train_end + int(n * val_f)
    if train_end < 1 or validation_end <= train_end or validation_end >= n:
        raise ValueError("No hay suficientes filas para los tres conjuntos")
    splits = {
        "train": data.iloc[:train_end].copy(),
        "validation": data.iloc[train_end:validation_end].copy(),
        "test": data.iloc[validation_end:].copy(),
    }
    if not (splits["train"][TIME_COL].max() < splits["validation"][TIME_COL].min()
            and splits["validation"][TIME_COL].max() < splits["test"][TIME_COL].min()):
        raise ValueError("Timestamps coincidentes cruzan límites; no se puede garantizar orden temporal estricto")
    return splits


def make_preprocessor(train: pd.DataFrame, config: dict[str, Any]) -> tuple[ColumnTransformer, list[str], list[str]]:
    feature_columns = sorted(FEATURE_COLUMNS.intersection(train.columns))
    if set(feature_columns) != FEATURE_COLUMNS:
        raise ValueError(f"Columnas predictoras inesperadas o ausentes: {sorted(FEATURE_COLUMNS.symmetric_difference(feature_columns))}")
    if FORBIDDEN_X.intersection(feature_columns) or POST_OUTCOMES.intersection(feature_columns):
        raise ValueError("Se detectaron columnas prohibidas en X")
    categorical = sorted(column for column in feature_columns if train[column].dtype == "object")
    numeric = sorted(set(feature_columns) - set(categorical))
    numeric_steps: list[tuple[str, Any]] = [("imputer", SimpleImputer(strategy=config["numeric_imputation"]))]
    if config["scale_numeric"]:
        numeric_steps.append(("scaler", StandardScaler()))
    categorical_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy=config["categorical_imputation"])),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    processor = ColumnTransformer([
        ("numeric", Pipeline(numeric_steps), numeric),
        ("categorical", categorical_pipe, categorical),
    ], remainder="drop", verbose_feature_names_out=True)
    return processor, numeric, categorical


def prepare(features_path: Path, audit_path: Path, config: dict[str, Any]) -> tuple[dict[str, pd.DataFrame], Any, dict[str, Any]]:
    data = load_eligible(features_path, audit_path)
    splits = split_chronologically(data, config)
    processor, numeric, categorical = make_preprocessor(splits["train"], config)
    x_columns = sorted(FEATURE_COLUMNS)
    processor.fit(splits["train"][x_columns])
    transformed: dict[str, pd.DataFrame] = {}
    for name, frame in splits.items():
        matrix = processor.transform(frame[x_columns])
        transformed[name] = pd.DataFrame(matrix, columns=processor.get_feature_names_out(), index=frame.index)
        if set(transformed[name].columns) & FORBIDDEN_X:
            raise ValueError("X transformado contiene columnas prohibidas")

    summary = {
        "dataset_version": config["dataset_version"],
        "eligible_records": len(data),
        "outcome_counts": data["final_outcome"].value_counts().sort_index().to_dict(),
        "label_counts": {str(int(k)): int(v) for k, v in data[TARGET].value_counts().sort_index().items()},
        "alternative_target_counts": {
            TARGET: {str(int(k)): int(v) for k, v in data[TARGET].value_counts().sort_index().items()},
            ALT_TARGET: {str(int(k)): int(v) for k, v in data[ALT_TARGET].value_counts().sort_index().items()},
        },
        "x_source_columns": x_columns,
        "numeric_columns": numeric,
        "categorical_columns": categorical,
        "transformed_columns": list(processor.get_feature_names_out()),
        "splits": {
            name: {"rows": len(frame), "start": frame[TIME_COL].min().isoformat(),
                   "end": frame[TIME_COL].max().isoformat(),
                   "label_counts": {str(int(k)): int(v) for k, v in frame[TARGET].value_counts().sort_index().items()},
                   "alternative_label_counts": {str(int(k)): int(v) for k, v in frame[ALT_TARGET].value_counts().sort_index().items()}}
            for name, frame in splits.items()
        },
        "train_fit_only": True,
    }
    return splits, processor, {"transformed": transformed, "summary": summary}


def write_artifacts(splits: dict[str, pd.DataFrame], processor: Any, result: dict[str, Any], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    transformed = result["transformed"]
    for name, frame in splits.items():
        transformed[name].to_csv(output_dir / f"X_{name}.csv", index=False)
        targets = frame[[ALT_TARGET, TARGET]].copy()
        targets.to_csv(output_dir / f"y_{name}.csv", index=False)
        manifest = frame[[ID_COL, TIME_COL]].copy()
        manifest.insert(0, "dataset_version", result["summary"]["dataset_version"])
        manifest.rename(columns={TIME_COL: "prediction_at"}, inplace=True)
        manifest.to_csv(output_dir / f"manifest_{name}.csv", index=False)
    joblib.dump(processor, output_dir / "preprocessor.joblib")
    with (output_dir / "summary.json").open("w", encoding="utf-8") as stream:
        json.dump(result["summary"], stream, indent=2, ensure_ascii=False, default=str)
    checksums = {}
    for path in sorted(output_dir.iterdir()):
        if path.is_file() and path.name != "preparation_manifest.json":
            checksums[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    with (output_dir / "preparation_manifest.json").open("w", encoding="utf-8") as stream:
        json.dump({"dataset_version": result["summary"]["dataset_version"], "files_sha256": checksums,
                   "input_files_sha256": result["summary"].get("input_files_sha256", {}),
                   "preprocessor_fit_scope": "train only", "targets": [ALT_TARGET, TARGET]},
                  stream, indent=2, ensure_ascii=False)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--features", type=Path, default=DEFAULT_FEATURES)
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    config = load_config(args.config)
    splits, processor, result = prepare(args.features, args.audit, config)
    result["summary"]["input_files_sha256"] = {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (args.features, args.audit, args.config)
    }
    output_dir = args.output_dir or ROOT / "data" / "processed" / config["dataset_version"]
    write_artifacts(splits, processor, result, output_dir)
    print(json.dumps(result["summary"], ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
