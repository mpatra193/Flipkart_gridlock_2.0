"""Phase 1 — Preprocessing.

Load raw events → clean (datetimes, cause/priority, duration label) → engineer
features (time, affected distance) → write data/processed/events_clean.parquet.

Run:  python scripts/01_preprocess.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from astra import config
from astra.data.clean import clean_events
from astra.data.features import build_features
from astra.data.load import load_raw


def main() -> None:
    print("=" * 70)
    print("PHASE 1 — PREPROCESSING")
    print("=" * 70)

    raw = load_raw()
    print(f"Loaded raw events:           {len(raw):>6} rows, {raw.shape[1]} cols")

    df = clean_events(raw)
    df = build_features(df)

    # ── Validation ────────────────────────────────────────────────────────
    n = len(df)
    n_dur = int(df["duration_hours"].notna().sum())
    n_coords = int((df["latitude"].notna() & df["longitude"].notna()).sum())
    n_closure = int(df["road_closure"].sum())
    n_span = int((df["affected_distance_km"] > 0).sum())

    print(f"Rows after cleaning:         {n:>6}")
    print(f"  with valid duration label: {n_dur:>6} ({100*n_dur/n:.1f}%)")
    print(f"  with coordinates:          {n_coords:>6} ({100*n_coords/n:.1f}%)")
    print(f"  requiring road closure:    {n_closure:>6} ({100*n_closure/n:.1f}%)")
    print(f"  with non-zero phys. span:  {n_span:>6} ({100*n_span/n:.1f}%)")

    print("\nDuration (hours) — labelled rows only:")
    desc = df["duration_hours"].describe(percentiles=[0.5, 0.75, 0.9, 0.99])
    for k in ("mean", "50%", "75%", "90%", "99%", "max"):
        print(f"  {k:>5}: {desc[k]:.2f}")

    print("\nEvent cause distribution (normalized):")
    vc = df["event_cause"].value_counts()
    for cause, cnt in vc.items():
        sub = df.loc[df["event_cause"] == cause, "duration_hours"]
        med = sub.median() if sub.notna().any() else float("nan")
        med_s = f"{med:.2f}h" if pd.notna(med) else "  n/a"
        print(f"  {cause:<20} {cnt:>5} ({100*cnt/n:4.1f}%)  median_dur={med_s}")

    # ── Integrity assertions (fail loud on regressions) ───────────────────
    assert n == 8173, f"expected 8173 rows, got {n}"
    assert df["duration_hours"].dropna().between(0, 168).all(), "duration out of bounds"
    assert df["affected_distance_km"].max() <= config.SPAN_CORRUPTION_KM, "span filter leak"
    assert df["event_cause"].notna().all(), "null cause after normalize"
    assert set(df["road_closure"].unique()) <= {0, 1}, "road_closure not binary"

    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(config.EVENTS_CLEAN, index=False)
    print(f"\nWrote {config.EVENTS_CLEAN.relative_to(config.ROOT)}  ({len(df)} rows)")
    print("PHASE 1 OK")


if __name__ == "__main__":
    main()
