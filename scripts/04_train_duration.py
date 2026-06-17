from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from astra import config
from astra.models.duration_model import train


def main():
    print("=" * 70)
    print("PHASE 4 - DURATION MODEL (quantile + long-event risk pipeline)")
    print("=" * 70)

    model, m = train()

    print(f"\nSplit: train={m['train_rows']} test={m['test_rows']} (time-ordered 80/20)")
    print("\nPoint (p50) accuracy:")
    print(f"  MedianAE : {m['MedianAE_hours']:.2f} h")
    print(f"  within2x : {100*m['within2x']:.1f}%")
    print(f"  logMAE   : {m['logMAE']:.3f}   logR2 : {m['logR2']:.3f}")
    print("\nRisk-aware outputs:")
    print(f"  p10/p50/p90 median : {m['p10_median_hours']:.2f} / {m['p50_median_hours']:.2f} / {m['p90_median_hours']:.2f} h")
    print(f"  interval hit rate  : {100*m['interval_hit_rate_p10_p90']:.1f}% (target ~80%)")
    print(f"  long-event ROC-AUC : {m['long_classifier_roc_auc']:.3f}")
    print(f"  long-event avg-prec: {m['long_classifier_avg_precision']:.3f}")

    assert m["logR2"] > 0.05, f"logR2 too low: {m['logR2']}"
    assert m["interval_hit_rate_p10_p90"] > 0.70, "interval coverage too low"
    assert m["long_classifier_roc_auc"] > 0.78, "long-event classifier weak"
    assert m["p90_median_hours"] > m["p50_median_hours"], "p90 must exceed p50"

    model.save()
    with open(config.DURATION_METRICS, "w") as f:
        json.dump(m, f, indent=2)

    demo = {
        "event_cause": "water_logging", "corridor": "Hosur Road", "event_type": "unplanned",
        "veh_type": "unknown", "police_station": "unknown", "zone": "unknown",
        "junction": "SilkBoardJunc", "road_closure": 1, "priority_high": 1,
        "latitude": 12.917, "longitude": 77.622, "hour": 18, "weekday": 2, "month": 7,
    }
    print(f"\nDemo (waterlogging, Hosur Rd, 6PM, closed):\n  {model.predict_quantiles(demo)}")
    print(f"\nSaved model -> {config.DURATION_MODEL.relative_to(config.ROOT)}")
    print("PHASE 4 OK")


if __name__ == "__main__":
    main()
