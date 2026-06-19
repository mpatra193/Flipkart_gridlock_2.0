from __future__ import annotations

import numpy as np
import pandas as pd

from .. import config
from ..engines.spillover import NON_CORRIDORS, _dominant_corridor
from ..geo import haversine_km


def _load_factor(active_count):
    if active_count <= 0:
        return 1.0
    if active_count == 1:
        return 0.7
    if active_count == 2:
        return 0.4
    return 0.1


def _similarity_count_factor(n):
    if n >= 14:
        return 1.0
    if n >= 5:
        return 0.7
    return 0.4


class DiversionEngine:
    def __init__(self, corridor_risk, junction_corridor, registry):
        self.corridor_risk = corridor_risk.set_index("corridor")
        self.junction_corridor = junction_corridor

        reg = registry.copy()
        reg["corridor"] = reg["junction"].map(junction_corridor)
        reg = reg[reg["corridor"].notna() & ~reg["corridor"].isin(NON_CORRIDORS)]
        self.corridor_points = {
            c: g[["lat", "lon"]].to_numpy() for c, g in reg.groupby("corridor")
        }
        self.corridor_junctions = {
            c: set(g["junction"]) for c, g in reg.groupby("corridor")
        }
        counts = reg.groupby("corridor")["junction"].count()
        self.capacity = (counts / counts.max()).to_dict()
        inc = self.corridor_risk["incident_count"]
        self.reliability = (1 - inc / inc.max()).to_dict()

    @classmethod
    def load(cls):
        events = pd.read_parquet(config.EVENTS_CLEAN)
        registry = pd.read_parquet(config.JUNCTION_REGISTRY)
        corridor_risk = pd.read_parquet(config.CORRIDOR_RISK)
        return cls(corridor_risk, _dominant_corridor(events), registry)

    def _candidate_corridors(self, lat, lon, impact_radius, blocked):
        reach = config.DIVERSION_CANDIDATE_RADIUS_MULT * impact_radius
        out = []
        for corridor, pts in self.corridor_points.items():
            if corridor == blocked:
                continue
            d = haversine_km(lat, lon, pts[:, 0], pts[:, 1])
            i = int(d.argmin())
            dmin = float(d[i])
            if dmin <= reach:
                out.append((corridor, dmin, float(pts[i, 0]), float(pts[i, 1])))
        return out

    def recommend(self, lat, lon, blocked_corridor, impact_radius,
                  affected_junctions, similar_count=0, active_load=None, top_n=3):
        active_load = active_load or {}
        affected = {a["junction"]: a["congestion"] for a in affected_junctions}
        avoid = sorted(
            [j for j, c in affected.items() if c > config.SPILLOVER_HIGH],
            key=lambda j: affected[j], reverse=True,
        )
        caution = [j for j, c in affected.items() if config.SPILLOVER_MEDIUM <= c <= config.SPILLOVER_HIGH]

        wd = config.DIVERSION_CORRIDOR_WEIGHTS
        wc = config.DIVERSION_CONFIDENCE_WEIGHTS
        sim_factor = _similarity_count_factor(similar_count)

        reach = config.DIVERSION_CANDIDATE_RADIUS_MULT * impact_radius
        scored = []
        for corridor, dmin, plat, plon in self._candidate_corridors(lat, lon, impact_radius, blocked_corridor):
            load = _load_factor(active_load.get(corridor, 0))
            reliability = float(self.reliability.get(corridor, 0.5))
            capacity = float(self.capacity.get(corridor, 0.0))
            corridor_score = wd["load"] * load + wd["reliability"] * reliability + wd["capacity"] * capacity

            cjs = self.corridor_junctions.get(corridor, set())
            overlap = len(cjs & affected.keys()) / len(cjs) if cjs else 0.0
            spillover_safety = 1.0 - overlap
            proximity = max(0.0, 1.0 - dmin / reach) if reach > 0 else 0.0

            confidence = (
                wc["corridor_score"] * corridor_score
                + wc["historical_success"] * reliability
                + wc["spillover_safety"] * spillover_safety
                + wc["proximity"] * proximity
                + wc["similarity_count"] * sim_factor
            )
            scored.append(
                {
                    "corridor": corridor,
                    "distance_km": round(dmin, 2),
                    "to_lat": round(plat, 6),
                    "to_lon": round(plon, 6),
                    "score": round(corridor_score, 3),
                    "confidence": round(confidence * 100, 1),
                    "active_incidents": int(active_load.get(corridor, 0)),
                    "reliability": round(reliability, 3),
                    "capacity": round(capacity, 3),
                    "spillover_safety": round(spillover_safety, 3),
                    "proximity": round(proximity, 3),
                }
            )

        scored.sort(key=lambda r: r["confidence"], reverse=True)
        return {
            "blocked_corridor": blocked_corridor,
            "recommended": scored[:top_n],
            "avoid_junctions": avoid[:10],
            "caution_junctions": caution[:10],
        }
