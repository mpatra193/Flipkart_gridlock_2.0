"""Phase 3 — ESI scoring for the whole event log.

Resolves each event's junction-risk component via the cascade, computes the
5-component ESI, and writes data/processed/events_scored.parquet.

Run:  python scripts/03_compute_esi.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from astra import config
from astra.memory.lookup import RiskLookup
from astra.scoring.esi import compute_esi


def main() -> None:
    print("=" * 70)
    print("PHASE 3 — ESI SCORING")
    print("=" * 70)

    df = pd.read_parquet(config.EVENTS_CLEAN)
    risk = RiskLookup.load()
    print(f"Loaded {len(df)} events + risk tables")

    # For unlabelled events (no closed_datetime), fall back to the cause's median
    # duration so historical severity stays representative instead of collapsing
    # to the lowest band. The live pipeline uses the ML prediction instead.
    cause_median = df.groupby("event_cause")["duration_hours"].median()
    global_median = float(df["duration_hours"].median())

    esi_vals, labels = [], []
    comps = {k: [] for k in ("cause", "duration", "closure", "time", "junction")}

    for r in df.itertuples(index=False):
        jc = risk.junction_component(
            junction=getattr(r, "junction", None),
            zone=getattr(r, "zone", None),
            corridor=getattr(r, "corridor", None),
        )
        dur = r.duration_hours
        if pd.isna(dur):
            dur = cause_median.get(r.event_cause, global_median)
            if pd.isna(dur):
                dur = global_median
        res = compute_esi(
            cause=r.event_cause,
            duration_hours=dur,
            road_closure=r.road_closure,
            hour=int(r.hour) if pd.notna(r.hour) else 12,
            is_weekend=int(r.is_weekend) if pd.notna(r.is_weekend) else 0,
            junction_component=jc,
        )
        esi_vals.append(res.esi)
        labels.append(res.risk_level)
        for k in comps:
            comps[k].append(res.components[k])

    df["esi"] = esi_vals
    df["risk_level"] = labels
    for k in comps:
        df[f"esi_{k}"] = comps[k]

    # ── Validation ────────────────────────────────────────────────────────
    print(f"\nESI range: {df['esi'].min():.1f} – {df['esi'].max():.1f}  mean {df['esi'].mean():.1f}")
    print("\nRisk level distribution:")
    for label in ("LOW", "MEDIUM", "HIGH", "CRITICAL"):
        n = int((df["risk_level"] == label).sum())
        print(f"  {label:<9} {n:>5} ({100*n/len(df):4.1f}%)")

    print("\nMean ESI by cause (top severity):")
    by_cause = df.groupby("event_cause")["esi"].mean().sort_values(ascending=False)
    for cause, v in by_cause.head(8).items():
        print(f"  {cause:<20} {v:5.1f}")

    assert df["esi"].between(0, 100).all(), "ESI out of [0,100]"
    assert df["risk_level"].isin(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).all(), "bad label"
    # Sanity: water_logging should outrank vehicle_breakdown on average.
    assert by_cause["water_logging"] > by_cause["vehicle_breakdown"], "cause ordering wrong"

    df.to_parquet(config.EVENTS_SCORED, index=False)
    print(f"\nWrote {config.EVENTS_SCORED.relative_to(config.ROOT)}")
    print("PHASE 3 OK")


if __name__ == "__main__":
    main()
