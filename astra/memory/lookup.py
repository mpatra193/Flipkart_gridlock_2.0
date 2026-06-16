"""RiskLookup — in-memory access to the risk tables + junction registry.

Loads the four processed tables once and serves:
  * the junction-risk cascade for ESI (junction → zone → corridor → neutral 50),
  * junction coordinates and risk scores for the spillover graph and map.

Built once at backend startup; every request reads from memory.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from .. import config


@dataclass
class RiskLookup:
    junction_risk: pd.DataFrame
    zone_risk: pd.DataFrame
    corridor_risk: pd.DataFrame
    registry: pd.DataFrame

    # ── construction ──────────────────────────────────────────────────────
    @classmethod
    def load(cls) -> "RiskLookup":
        return cls(
            junction_risk=pd.read_parquet(config.JUNCTION_RISK),
            zone_risk=pd.read_parquet(config.ZONE_RISK),
            corridor_risk=pd.read_parquet(config.CORRIDOR_RISK),
            registry=pd.read_parquet(config.JUNCTION_REGISTRY),
        )

    def __post_init__(self) -> None:
        # Dict indexes for O(1) lookups.
        self._j = self.junction_risk.set_index("junction")["risk_score"].to_dict()
        self._z = self.zone_risk.set_index("zone")["risk_score"].to_dict()
        self._c = self.corridor_risk.set_index("corridor")["risk_score"].to_dict()
        self._coords = {
            r.junction: (float(r.lat), float(r.lon))
            for r in self.registry.itertuples(index=False)
        }

    # ── ESI junction component cascade ────────────────────────────────────
    def junction_component(
        self,
        junction: str | None = None,
        zone: str | None = None,
        corridor: str | None = None,
    ) -> float:
        """Resolve S_junction with graceful fallback for missing location data.

        Order: junction risk → zone risk → corridor risk → neutral 50.
        Handles the 70% missing junction / 58% missing zone reality.
        """
        if junction and junction in self._j:
            return float(self._j[junction])
        if zone and zone in self._z:
            return float(self._z[zone])
        if corridor and corridor in self._c:
            return float(self._c[corridor])
        return 50.0

    # ── spatial helpers ───────────────────────────────────────────────────
    def junction_coords(self, junction: str) -> tuple[float, float] | None:
        return self._coords.get(junction)

    def junction_score(self, junction: str) -> float:
        return float(self._j.get(junction, 50.0))
