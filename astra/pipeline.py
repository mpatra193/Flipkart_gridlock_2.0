from __future__ import annotations

import pickle
from dataclasses import dataclass

import pandas as pd

from . import config
from .engines import resource_planner
from .engines.diversion import DiversionEngine
from .engines.impact_radius import estimate_impact_radius, find_affected_junctions
from .engines.similar_events import SimilarEventEngine
from .engines.spillover import _dominant_corridor, affected_from_source
from .memory.lookup import RiskLookup
from .models.duration_model import DurationModel
from .scoring.esi import compute_esi

RING_CONGESTION = {"HIGH": 0.8, "MEDIUM": 0.5, "LOW": 0.2}


@dataclass
class AstraPipeline:
    model: DurationModel
    risk: RiskLookup
    graph: object
    similar: SimilarEventEngine
    diversion: DiversionEngine
    registry: pd.DataFrame
    junction_corridor: dict

    @classmethod
    def load(cls):
        events = pd.read_parquet(config.EVENTS_CLEAN)
        registry = pd.read_parquet(config.JUNCTION_REGISTRY)
        with open(config.PROCESSED_DIR / "spillover_graph.pkl", "rb") as f:
            graph = pickle.load(f)
        return cls(
            model=DurationModel.load(),
            risk=RiskLookup.load(),
            graph=graph,
            similar=SimilarEventEngine.load(),
            diversion=DiversionEngine.load(),
            registry=registry,
            junction_corridor=_dominant_corridor(events),
        )

    def _resolve_location(self, event):
        junction = event.get("junction")
        lat, lon, corridor = event.get("latitude"), event.get("longitude"), event.get("corridor")
        if junction:
            coords = self.risk.junction_coords(junction)
            if coords:
                lat, lon = coords
            corridor = corridor or self.junction_corridor.get(junction)
        return junction, lat, lon, corridor

    def _affected(self, junction, lat, lon, impact_radius):
        if junction and junction in self.graph:
            raw = affected_from_source(self.graph, junction)
        else:
            raw = [
                {"junction": a.junction, "lat": a.lat, "lon": a.lon,
                 "congestion": RING_CONGESTION[a.ring], "risk": a.ring}
                for a in find_affected_junctions(lat, lon, impact_radius, self.registry)
            ]
        for a in raw:
            a["junction_risk"] = self.risk.junction_score(a["junction"])
            a["corridor"] = self.junction_corridor.get(a["junction"])
        return raw

    def analyze(self, event):
        junction, lat, lon, corridor = self._resolve_location(event)
        hour = int(event["hour"])
        weekday = int(event["weekday"])
        is_peak = 1 if hour in config.PEAK_HOURS else 0
        is_weekend = 1 if weekday >= 5 else 0
        road_closure = int(event.get("road_closure", 0))
        priority_high = int(event.get("priority_high", 1))
        cause = event["event_cause"]

        if event.get("duration_override") is not None:
            duration = float(event["duration_override"])
            duration_source = "override"
        else:
            duration = self.model.predict_one(
                {
                    "event_cause": cause, "corridor": corridor, "road_closure": road_closure,
                    "priority_high": priority_high, "hour": hour, "weekday": weekday,
                    "latitude": lat, "longitude": lon,
                }
            )
            duration_source = "predicted"

        jc = self.risk.junction_component(junction=junction, zone=event.get("zone"), corridor=corridor)
        esi = compute_esi(cause, duration, road_closure, hour, is_weekend, jc)

        impact_radius = estimate_impact_radius(duration, road_closure, is_peak, cause)
        affected = self._affected(junction, lat, lon, impact_radius)

        similar = self.similar.query(
            {
                "event_cause": cause, "road_closure": road_closure, "hour": hour,
                "weekday": weekday, "latitude": lat, "longitude": lon,
            },
            predicted_duration=duration,
        )

        diversions = self.diversion.recommend(
            lat, lon, corridor, impact_radius, affected, similar_count=similar["match_count"]
        )

        resources = resource_planner.plan(cause, road_closure, impact_radius, duration, affected)

        return {
            "event": {
                "event_cause": cause, "junction": junction, "corridor": corridor,
                "latitude": lat, "longitude": lon, "hour": hour, "weekday": weekday,
                "is_peak": bool(is_peak), "road_closure": bool(road_closure),
            },
            "esi": esi.esi,
            "risk_level": esi.risk_level,
            "esi_components": esi.components,
            "duration_hours": round(duration, 2),
            "duration_source": duration_source,
            "impact_radius_km": impact_radius,
            "confidence": similar["confidence"]["score"],
            "similar_event_count": similar["match_count"],
            "affected_junctions": affected,
            "similar": similar,
            "diversions": diversions,
            "resources": resources,
        }
