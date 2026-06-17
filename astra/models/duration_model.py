from __future__ import annotations

from dataclasses import dataclass

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier, LGBMRegressor
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from .. import config

CAT_COLS = ["event_cause", "corridor", "event_type", "veh_type", "police_station", "zone", "junction"]
NUM_COLS = [
    "road_closure", "priority_high", "latitude", "longitude", "hour", "weekday", "month",
    "is_weekend", "is_peak", "is_night", "hour_sin", "hour_cos", "weekday_sin", "weekday_cos",
]
FEATURES = CAT_COLS + NUM_COLS
TARGET = "duration_hours"
LONG_THRESHOLD_HOURS = 6.0
BLEND_START = 0.30
BLEND_WIDTH = 0.75
P90_MULTIPLIER = 1.30
P90_RISK_BOOST = 15.0

_TRUE = {"true", "1", "yes", "y"}


def _norm_bool(s):
    return s.fillna(False).astype(str).str.strip().str.lower().isin(_TRUE).astype(int)


def build_features(data: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame(index=data.index)
    start = pd.to_datetime(data["start_datetime"], errors="coerce", utc=True) if "start_datetime" in data else None

    def col(name, default="unknown"):
        return data[name] if name in data.columns else pd.Series(default, index=data.index)

    out["event_cause"] = col("event_cause").fillna("unknown").astype(str).str.strip().str.lower()
    out["corridor"] = col("corridor").fillna("unknown").astype(str).str.strip()
    out["event_type"] = col("event_type").fillna("unknown").astype(str).str.strip().str.lower()
    out["veh_type"] = col("veh_type").fillna("unknown").astype(str).str.strip().str.lower()
    out["police_station"] = col("police_station").fillna("unknown").astype(str).str.strip()
    out["zone"] = col("zone").fillna("unknown").astype(str).str.strip()
    out["junction"] = col("junction").fillna("unknown").astype(str).str.strip()

    if "road_closure" in data.columns:
        out["road_closure"] = pd.to_numeric(data["road_closure"], errors="coerce").fillna(0).astype(int)
    else:
        out["road_closure"] = _norm_bool(col("requires_road_closure", False))

    if "priority_high" in data.columns:
        out["priority_high"] = pd.to_numeric(data["priority_high"], errors="coerce").fillna(0).astype(int)
    else:
        out["priority_high"] = col("priority", "").fillna("").astype(str).str.strip().str.lower().eq("high").astype(int)

    out["latitude"] = pd.to_numeric(col("latitude", np.nan), errors="coerce")
    out["longitude"] = pd.to_numeric(col("longitude", np.nan), errors="coerce")

    if "hour" in data.columns:
        out["hour"] = pd.to_numeric(data["hour"], errors="coerce").fillna(0).astype(int)
        out["weekday"] = pd.to_numeric(data.get("weekday", 0), errors="coerce").fillna(0).astype(int)
        out["month"] = pd.to_numeric(data.get("month", 0), errors="coerce").fillna(0).astype(int)
    elif start is not None:
        out["hour"] = start.dt.hour.fillna(0).astype(int)
        out["weekday"] = start.dt.weekday.fillna(0).astype(int)
        out["month"] = start.dt.month.fillna(0).astype(int)
    else:
        out["hour"] = 0
        out["weekday"] = 0
        out["month"] = 0

    out["is_weekend"] = out["weekday"].isin([5, 6]).astype(int)
    out["is_peak"] = out["hour"].isin([8, 9, 10, 17, 18, 19, 20]).astype(int)
    out["is_night"] = ((out["hour"] <= 5) | (out["hour"] >= 22)).astype(int)
    out["hour_sin"] = np.sin(2 * np.pi * out["hour"] / 24)
    out["hour_cos"] = np.cos(2 * np.pi * out["hour"] / 24)
    out["weekday_sin"] = np.sin(2 * np.pi * out["weekday"] / 7)
    out["weekday_cos"] = np.cos(2 * np.pi * out["weekday"] / 7)

    return out[FEATURES]


def _preprocessor():
    return ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore", min_frequency=5), CAT_COLS),
            ("num", SimpleImputer(strategy="median"), NUM_COLS),
        ],
        remainder="drop",
    )


def _regressor(objective, alpha=None):
    kw = dict(
        objective=objective, n_estimators=400, learning_rate=0.025, num_leaves=15,
        max_depth=5, min_child_samples=35, subsample=0.80, colsample_bytree=0.80,
        reg_alpha=1.0, reg_lambda=3.0, random_state=42, verbosity=-1,
    )
    if alpha is not None:
        kw["alpha"] = alpha
    return Pipeline([("prep", _preprocessor()), ("model", LGBMRegressor(**kw))])


def _classifier():
    clf = LGBMClassifier(
        objective="binary", n_estimators=300, learning_rate=0.025, num_leaves=15,
        max_depth=5, min_child_samples=35, subsample=0.80, colsample_bytree=0.80,
        reg_alpha=1.0, reg_lambda=3.0, random_state=42, verbosity=-1,
    )
    return Pipeline([("prep", _preprocessor()), ("model", clf)])


@dataclass
class DurationModel:
    bundle: dict

    @classmethod
    def load(cls, path=config.DURATION_MODEL):
        return cls(joblib.load(path))

    def save(self, path=config.DURATION_MODEL):
        config.ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.bundle, path)

    def predict_quantiles(self, event: dict) -> dict:
        b = self.bundle
        s = b["settings"]
        X = build_features(pd.DataFrame([event]))[b["features"]]

        raw_p50 = float(np.clip(np.expm1(b["model_p50_raw"].predict(X)[0]), 0, 168))
        p10 = float(np.clip(np.expm1(b["model_p10"].predict(X)[0]), 0, 168))
        p90 = float(np.clip(np.expm1(b["model_p90"].predict(X)[0]), 0, 168))
        long_prob = float(b["model_long_clf"].predict_proba(X)[0, 1])

        weight = float(np.clip((long_prob - s["blend_start"]) / s["blend_width"], 0, 1))
        p50 = float(np.clip((1 - weight) * s["anchor_hours"] + weight * raw_p50, 0, 168))
        p10 = min(p10, p50)
        p90 = float(np.clip(max(p90 * s["p90_multiplier"] + long_prob * s["p90_risk_boost"], p50), 0, 168))
        confidence = float(np.clip(1 - min((p90 - p10) / 168, 1), 0, 1))

        return {
            "p10": round(p10, 2),
            "p50": round(p50, 2),
            "p90": round(p90, 2),
            "duration_hours": round(p50, 2),
            "planning_duration_hours": round(p90, 2),
            "long_event_probability": round(long_prob, 3),
            "confidence": round(confidence, 3),
        }

    def predict_one(self, event: dict) -> float:
        return self.predict_quantiles(event)["duration_hours"]


def _load_valid(path=config.RAW_EVENTS_CSV):
    df = pd.read_csv(path, low_memory=False)
    df["start_datetime"] = pd.to_datetime(df["start_datetime"], errors="coerce", utc=True)
    df["closed_datetime"] = pd.to_datetime(df["closed_datetime"], errors="coerce", utc=True)
    df["duration_hours"] = (df["closed_datetime"] - df["start_datetime"]).dt.total_seconds() / 3600
    valid = df[
        df["start_datetime"].notna()
        & df["closed_datetime"].notna()
        & (df["duration_hours"] > 0)
        & (df["duration_hours"] <= 168)
    ].copy()
    return valid.sort_values("start_datetime").reset_index(drop=True)


def train(csv_path=config.RAW_EVENTS_CSV):
    from sklearn.metrics import (
        average_precision_score,
        mean_absolute_error,
        median_absolute_error,
        r2_score,
        roc_auc_score,
    )

    valid = _load_valid(csv_path)
    X = build_features(valid)
    y_hours = valid["duration_hours"].astype(float)
    y_log = np.log1p(y_hours)

    cut = int(len(X) * 0.80)
    X_tr, X_te = X.iloc[:cut], X.iloc[cut:]
    ytr_log, yte_log = y_log.iloc[:cut], y_log.iloc[cut:]
    ytr_hours, yte_hours = y_hours.iloc[:cut], y_hours.iloc[cut:]

    model_p50_raw = _regressor("mae")
    model_p10 = _regressor("quantile", alpha=0.10)
    model_p90 = _regressor("quantile", alpha=0.90)
    model_long = _classifier()

    ytr_long = (ytr_hours > LONG_THRESHOLD_HOURS).astype(int)
    yte_long = (yte_hours > LONG_THRESHOLD_HOURS).astype(int)

    model_p50_raw.fit(X_tr, ytr_log)
    model_p10.fit(X_tr, ytr_log)
    model_p90.fit(X_tr, ytr_log)
    model_long.fit(X_tr, ytr_long)

    anchor = float(ytr_hours.median())
    raw_p50 = np.clip(np.expm1(model_p50_raw.predict(X_te)), 0, 168)
    p10 = np.clip(np.expm1(model_p10.predict(X_te)), 0, 168)
    p90q = np.clip(np.expm1(model_p90.predict(X_te)), 0, 168)
    long_prob = model_long.predict_proba(X_te)[:, 1]

    weight = np.clip((long_prob - BLEND_START) / BLEND_WIDTH, 0, 1)
    p50 = np.clip((1 - weight) * anchor + weight * raw_p50, 0, 168)
    p10 = np.minimum(p10, p50)
    p90 = np.clip(np.maximum(p90q * P90_MULTIPLIER + long_prob * P90_RISK_BOOST, p50), 0, 168)

    p50_log = np.log1p(p50)
    ratio = np.maximum(yte_hours.values / np.maximum(p50, 1e-6), p50 / np.maximum(yte_hours.values, 1e-6))
    metrics = {
        "model": "astra_duration_pipeline_final",
        "MedianAE_hours": round(float(median_absolute_error(yte_hours, p50)), 4),
        "MAE_hours": round(float(mean_absolute_error(yte_hours, p50)), 4),
        "within2x": round(float(np.mean(ratio <= 2.0)), 4),
        "logMAE": round(float(mean_absolute_error(yte_log, p50_log)), 4),
        "logR2": round(float(r2_score(yte_log, p50_log)), 4),
        "interval_hit_rate_p10_p90": round(float(np.mean((yte_hours.values >= p10) & (yte_hours.values <= p90))), 4),
        "p10_median_hours": round(float(np.median(p10)), 4),
        "p50_median_hours": round(float(np.median(p50)), 4),
        "p90_median_hours": round(float(np.median(p90)), 4),
        "long_classifier_roc_auc": round(float(roc_auc_score(yte_long, long_prob)), 4),
        "long_classifier_avg_precision": round(float(average_precision_score(yte_long, long_prob)), 4),
        "long_event_test_rate": round(float(yte_long.mean()), 4),
        "anchor_hours": anchor,
        "train_rows": int(len(X_tr)),
        "test_rows": int(len(X_te)),
        "split": "time_ordered_80_20_newest_test",
        "target_transform": "log1p(duration_hours)",
    }

    bundle = {
        "model_p10": model_p10,
        "model_p50_raw": model_p50_raw,
        "model_p90": model_p90,
        "model_long_clf": model_long,
        "features": FEATURES,
        "cat_cols": CAT_COLS,
        "num_cols": NUM_COLS,
        "metrics": metrics,
        "settings": {
            "blend_start": BLEND_START,
            "blend_width": BLEND_WIDTH,
            "anchor_hours": anchor,
            "p90_multiplier": P90_MULTIPLIER,
            "p90_risk_boost": P90_RISK_BOOST,
            "long_threshold_hours": LONG_THRESHOLD_HOURS,
        },
    }
    return DurationModel(bundle), metrics
