from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import pandas as pd

from astra import config
from astra.models.duration_model import train


def main():
    print("=" * 70)
    print("PHASE 4 - DURATION MODEL (LightGBM)")
    print("=" * 70)

    df = pd.read_parquet(config.EVENTS_CLEAN)
    print(f"Labelled training rows: {int(df['duration_hours'].notna().sum())}")

    model, report = train(df)

    print(f"\nSplit: train={report['n_train']} val={report['n_val']} test={report['n_test']}")
    print(f"Best iteration (early stop): {report['best_iteration']}")

    print("\nInterpretable (raw hours):")
    print(f"  Median AE : {report['median_ae']:.2f} h  (typical error, robust to tail)")
    print(f"  within 2x : {100 * report['within_2x']:.1f}%")
    print(f"  MAE/RMSE  : {report['mae']:.2f} / {report['rmse']:.2f} h  (tail-dominated)")

    print("\nLog space (multiplicative accuracy):")
    print(f"  MAE_log : {report['mae_log']:.3f}   RMSE_log : {report['rmse_log']:.3f}   R2_log : {report['r2_log']:.3f}")

    print("\nLog-MAE baselines (lower is better):")
    print(f"  global-median : {report['baseline_global_mae_log']:.3f}")
    print(f"  per-cause-med : {report['baseline_cause_mae_log']:.3f}")
    print(f"  MODEL         : {report['mae_log']:.3f}")
    lift_c = 100 * (1 - report["mae_log"] / report["baseline_cause_mae_log"])
    print(f"  beats per-cause baseline by {lift_c:.1f}%")

    print("\nGain importance (cardinality-biased):")
    for r in report["importance"]:
        print(f"  {r['feature']:<16} {r['pct']:5.1f}%")

    print("\nPermutation importance (delta log-MAE, unbiased):")
    for r in report["perm_importance"]:
        print(f"  {r['feature']:<16} {r['delta_logmae']:+.4f}")

    assert report["mae_log"] < report["baseline_cause_mae_log"]
    assert report["mae_log"] <= report["baseline_global_mae_log"] * 1.05
    assert report["r2_log"] > 0.15
    perm = {r["feature"]: r["delta_logmae"] for r in report["perm_importance"]}
    assert perm["event_cause"] > 0
    assert "event_cause" in [r["feature"] for r in report["perm_importance"][:4]]

    model.save()
    with open(config.DURATION_METRICS, "w") as f:
        json.dump({k: v for k, v in report.items() if k not in ("importance", "perm_importance")}, f, indent=2)
    with open(config.DURATION_IMPORTANCE, "w") as f:
        json.dump({"gain": report["importance"], "permutation": report["perm_importance"]}, f, indent=2)

    demo = {
        "event_cause": "water_logging",
        "corridor": "Hosur Road",
        "road_closure": 1,
        "priority_high": 1,
        "hour": 18,
        "weekday": 2,
        "latitude": 12.917,
        "longitude": 77.622,
    }
    print(f"\nDemo predict (waterlogging, Hosur Rd, 6PM, closed): {model.predict_one(demo):.2f} h")
    print(f"Saved model -> {config.DURATION_MODEL.relative_to(config.ROOT)}")
    print("PHASE 4 OK")


if __name__ == "__main__":
    main()
