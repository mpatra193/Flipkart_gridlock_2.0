"""Phase 2 — Historical memory / risk tables.

Reads events_clean.parquet, builds junction registry + junction/zone/corridor
risk tables, writes them to data/processed/.

Run:  python scripts/02_build_memory.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from astra import config
from astra.memory.risk_tables import (
    build_corridor_risk,
    build_junction_registry,
    build_junction_risk,
    build_zone_risk,
)


def main() -> None:
    print("=" * 70)
    print("PHASE 2 — MEMORY / RISK TABLES")
    print("=" * 70)

    df = pd.read_parquet(config.EVENTS_CLEAN)
    print(f"Loaded clean events: {len(df)} rows")

    registry = build_junction_registry(df)
    jrisk = build_junction_risk(df)
    zrisk = build_zone_risk(df)
    crisk = build_corridor_risk(df)

    print(f"\nJunction registry:   {len(registry):>4} junctions")
    print(f"Junction risk table: {len(jrisk):>4} junctions")
    print(f"Zone risk table:     {len(zrisk):>4} zones")
    print(f"Corridor risk table: {len(crisk):>4} corridors")

    print("\nTop 10 junctions by risk score:")
    cols = ["junction", "incident_count", "avg_duration", "road_closure_rate", "risk_score"]
    print(jrisk[cols].head(10).to_string(index=False, float_format=lambda x: f"{x:.2f}"))

    print("\nTop 5 zones by risk score:")
    print(zrisk.head(5).to_string(index=False, float_format=lambda x: f"{x:.2f}"))

    print("\nTop 5 corridors by risk score:")
    print(crisk.head(5).to_string(index=False, float_format=lambda x: f"{x:.2f}"))

    # ── Integrity assertions ──────────────────────────────────────────────
    assert jrisk["risk_score"].between(0, 100).all(), "junction risk out of [0,100]"
    assert zrisk["risk_score"].between(0, 100).all(), "zone risk out of [0,100]"
    assert crisk["risk_score"].between(0, 100).all(), "corridor risk out of [0,100]"
    assert registry[["lat", "lon"]].notna().all().all(), "registry has null coords"
    assert len(registry) == len(jrisk), "registry/risk junction mismatch"

    registry.to_parquet(config.JUNCTION_REGISTRY, index=False)
    jrisk.to_parquet(config.JUNCTION_RISK, index=False)
    zrisk.to_parquet(config.ZONE_RISK, index=False)
    crisk.to_parquet(config.CORRIDOR_RISK, index=False)
    print("\nWrote 4 tables to data/processed/")
    print("PHASE 2 OK")


if __name__ == "__main__":
    main()
