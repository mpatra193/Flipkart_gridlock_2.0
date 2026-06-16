from __future__ import annotations

from dataclasses import dataclass

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

from .. import config

CATEGORICAL = ["event_cause", "corridor"]
NUMERIC = ["road_closure", "priority_high", "hour", "weekday", "latitude", "longitude"]
FEATURES = CATEGORICAL + NUMERIC
TARGET = "duration_hours"

LGBM_PARAMS = dict(
    objective="regression_l1",
    n_estimators=600,
    learning_rate=0.03,
    num_leaves=31,
    max_depth=-1,
    min_child_samples=20,
    subsample=0.8,
    subsample_freq=1,
    colsample_bytree=0.8,
    reg_lambda=1.0,
    random_state=42,
    n_jobs=-1,
    verbose=-1,
)


def prepare_X(df, categories=None):
    X = pd.DataFrame(index=df.index)
    for col in CATEGORICAL:
        s = df[col].astype("string")
        if categories is not None:
            X[col] = pd.Categorical(s, categories=categories[col])
        else:
            X[col] = s.astype("category")
    for col in NUMERIC:
        X[col] = pd.to_numeric(df[col], errors="coerce").astype("float64")
    return X[FEATURES]


@dataclass
class DurationModel:
    booster: lgb.LGBMRegressor
    categories: dict
    best_iteration: int | None = None

    def predict(self, df):
        X = prepare_X(df, self.categories)
        log_pred = self.booster.predict(X, num_iteration=self.best_iteration or None)
        return np.clip(np.expm1(log_pred), 0.0, config.DURATION_MAX_HOURS)

    def predict_one(self, event):
        return float(self.predict(pd.DataFrame([event]))[0])

    def save(self, path=config.DURATION_MODEL):
        config.ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "booster": self.booster,
                "categories": self.categories,
                "best_iteration": self.best_iteration,
            },
            path,
        )

    @classmethod
    def load(cls, path=config.DURATION_MODEL):
        d = joblib.load(path)
        return cls(d["booster"], d["categories"], d.get("best_iteration"))


def train(df, test_frac=0.2, val_frac=0.15):
    labelled = df[df[TARGET].notna()].sort_values("start_datetime").reset_index(drop=True)
    n = len(labelled)

    n_test = int(round(n * test_frac))
    train_full = labelled.iloc[: n - n_test]
    test = labelled.iloc[n - n_test :]
    n_val = int(round(len(train_full) * val_frac))
    tr = train_full.iloc[: len(train_full) - n_val]
    val = train_full.iloc[len(train_full) - n_val :]

    categories = {
        c: sorted(labelled[c].astype("string").dropna().unique().tolist())
        for c in CATEGORICAL
    }

    X_tr, y_tr = prepare_X(tr, categories), np.log1p(tr[TARGET].to_numpy())
    X_val, y_val = prepare_X(val, categories), np.log1p(val[TARGET].to_numpy())

    model = lgb.LGBMRegressor(**LGBM_PARAMS)
    model.fit(
        X_tr,
        y_tr,
        eval_set=[(X_val, y_val)],
        eval_metric="l1",
        callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)],
    )

    dm = DurationModel(model, categories, model.best_iteration_)
    y_true = test[TARGET].to_numpy()
    y_pred = dm.predict(test)

    global_med = float(tr[TARGET].median())
    cause_med = tr.groupby("event_cause")[TARGET].median()
    base_global = np.full_like(y_true, global_med, dtype="float64")
    base_cause = test["event_cause"].map(cause_med).fillna(global_med).to_numpy()

    report = _metrics(y_true, y_pred, base_global, base_cause)
    report["n_train"] = len(tr)
    report["n_val"] = len(val)
    report["n_test"] = len(test)
    report["best_iteration"] = int(model.best_iteration_) if model.best_iteration_ else None
    report["importance"] = _gain_importance(model)
    report["perm_importance"] = _permutation_importance(dm, test)
    return dm, report


def _metrics(y_true, y_pred, base_global, base_cause):
    from sklearn.metrics import (
        mean_absolute_error,
        median_absolute_error,
        r2_score,
        root_mean_squared_error,
    )

    lt, lp = np.log1p(y_true), np.log1p(y_pred)
    lg, lc = np.log1p(base_global), np.log1p(base_cause)

    ratio = (y_pred + 1e-6) / (y_true + 1e-6)
    within_2x = float(np.mean((ratio >= 0.5) & (ratio <= 2.0)))

    return {
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 3),
        "rmse": round(float(root_mean_squared_error(y_true, y_pred)), 3),
        "median_ae": round(float(median_absolute_error(y_true, y_pred)), 3),
        "r2": round(float(r2_score(y_true, y_pred)), 3),
        "mae_log": round(float(mean_absolute_error(lt, lp)), 3),
        "rmse_log": round(float(root_mean_squared_error(lt, lp)), 3),
        "r2_log": round(float(r2_score(lt, lp)), 3),
        "within_2x": round(within_2x, 3),
        "baseline_global_mae_log": round(float(mean_absolute_error(lt, lg)), 3),
        "baseline_cause_mae_log": round(float(mean_absolute_error(lt, lc)), 3),
        "baseline_global_mae": round(float(mean_absolute_error(y_true, base_global)), 3),
        "baseline_cause_mae": round(float(mean_absolute_error(y_true, base_cause)), 3),
    }


def _gain_importance(model):
    imp = model.booster_.feature_importance(importance_type="gain")
    total = float(imp.sum()) or 1.0
    rows = [
        {"feature": f, "gain": float(g), "pct": round(100 * float(g) / total, 1)}
        for f, g in zip(FEATURES, imp)
    ]
    return sorted(rows, key=lambda r: r["gain"], reverse=True)


def _permutation_importance(dm, test, repeats=10, seed=42):
    from sklearn.metrics import mean_absolute_error

    rng = np.random.default_rng(seed)
    y_log = np.log1p(test[TARGET].to_numpy())
    base = mean_absolute_error(y_log, np.log1p(dm.predict(test)))
    rows = []
    for f in FEATURES:
        col = test[f].to_numpy()
        deltas = []
        for _ in range(repeats):
            shuffled = test.copy()
            shuffled[f] = rng.permutation(col)
            mae = mean_absolute_error(y_log, np.log1p(dm.predict(shuffled)))
            deltas.append(mae - base)
        rows.append({"feature": f, "delta_logmae": round(float(np.mean(deltas)), 4)})
    return sorted(rows, key=lambda r: r["delta_logmae"], reverse=True)
