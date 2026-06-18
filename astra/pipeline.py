from __future__ import annotations

import math
import pickle
from dataclasses import dataclass

import pandas as pd

from . import config
from .engines import resource_planner
from .engines.diversion import DiversionEngine
from .engines.impact_radius import estimate_impact_radius, find_affected_junctions
from .engines.similar_events import SimilarEventEngine
from .engines.spillover import NON_CORRIDORS, _dominant_corridor, affected_from_source
from .geo import haversine_km
from .memory.lookup import RiskLookup
from .models.duration_model import DurationModel
from .scoring.esi import compute_esi

RING_CONGESTION = {"HIGH": 0.8, "MEDIUM": 0.5, "LOW": 0.2}
_COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]


def _bearing(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _compass(b):
    return _COMPASS[int((b + 22.5) % 360 // 45)]


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
            a["eta_min"] = round(max(-config.DECAY_KAPPA * math.log(max(a["congestion"], 1e-3)) * config.ETA_MIN_PER_COST, 0.0), 1)
        return raw

    def _escape_routes(self, src_lat, src_lon, blocked_corridor, affected, recommended, avoid_junctions):
        if src_lat is None or src_lon is None:
            return
        candidates = []
        for r in recommended:
            pts = self.diversion.corridor_points.get(r["corridor"])
            if pts is not None and len(pts):
                candidates.append((r, pts))
        blocked = blocked_corridor if blocked_corridor and blocked_corridor not in NON_CORRIDORS else None

        for a in affected:
            jlat, jlon = a.get("lat"), a.get("lon")
            if jlat is None or jlon is None:
                continue
            out_b = _bearing(src_lat, src_lon, jlat, jlon)
            src_dir = _compass((out_b + 180) % 360)
            avoid = [j for j in avoid_junctions if j != a["junction"]][:2]
            if blocked:
                avoid = avoid + [blocked]

            best = None
            for r, pts in candidates:
                d = haversine_km(jlat, jlon, pts[:, 0], pts[:, 1])
                i = int(d.argmin())
                plat, plon, dist = float(pts[i, 0]), float(pts[i, 1]), float(d[i])
                if dist < 0.05:
                    continue
                vb = _bearing(jlat, jlon, plat, plon)
                align = math.cos(math.radians((vb - out_b + 180) % 360 - 180))
                score = 0.55 * max(0.0, align) + 0.35 * (r["confidence"] / 100.0) + 0.10 * max(0.0, 1 - dist / 6.0)
                if best is None or score > best["score"]:
                    best = {"score": score, "corridor": r["corridor"], "to_lat": plat,
                            "to_lon": plon, "dist": dist, "vb": vb, "conf": r["confidence"],
                            "reliability": r["reliability"]}

            if best is None:
                dlat = 1.5 / 111.0 * math.cos(math.radians(out_b))
                dlon = 1.5 / (111.0 * math.cos(math.radians(jlat))) * math.sin(math.radians(out_b))
                a["escape"] = {
                    "to_lat": round(jlat + dlat, 6), "to_lon": round(jlon + dlon, 6),
                    "to_label": "open road away from incident", "direction": _compass(out_b),
                    "avoid": avoid, "confidence": 35.0,
                    "reason": [f"incident source is to the {src_dir}",
                               "no clear safe corridor nearby; push flow away from the jam"],
                }
                continue

            reason = [f"incident source is to the {src_dir}"]
            if blocked:
                reason.append(f"{blocked} is blocked / saturated")
            reason.append(f"{best['corridor']} carries lower historical risk")
            reason.append(f"clear road ~{best['dist']:.1f} km {_compass(best['vb'])} from here")
            conf = round(min(100.0, 0.6 * best["conf"] + 40.0 * max(0.0, best["score"])), 0)
            a["escape"] = {
                "to_lat": round(best["to_lat"], 6), "to_lon": round(best["to_lon"], 6),
                "to_label": best["corridor"], "direction": _compass(best["vb"]),
                "avoid": avoid, "confidence": conf, "reason": reason,
            }

    def analyze(self, event):
        junction, lat, lon, corridor = self._resolve_location(event)
        hour = int(event["hour"])
        weekday = int(event["weekday"])
        is_peak = 1 if hour in config.PEAK_HOURS else 0
        is_weekend = 1 if weekday >= 5 else 0
        road_closure = int(event.get("road_closure", 0))
        priority_high = int(event.get("priority_high", 1))
        cause = event["event_cause"]

        model_event = {
            "event_cause": cause, "corridor": corridor,
            "event_type": event.get("event_type") or "unknown",
            "veh_type": event.get("veh_type") or "unknown",
            "police_station": event.get("police_station") or "unknown",
            "zone": event.get("zone") or "unknown", "junction": junction or "unknown",
            "road_closure": road_closure, "priority_high": priority_high,
            "latitude": lat, "longitude": lon, "hour": hour, "weekday": weekday,
            "month": int(event.get("month") or 0),
        }

        if event.get("duration_override") is not None:
            ov = float(event["duration_override"])
            p10 = p50 = planning = ov
            long_prob = None
            model_conf = None
            duration_source = "override"
        else:
            q = self.model.predict_quantiles(model_event)
            p10, p50, planning = q["p10"], q["p50"], q["p90"]
            long_prob = q["long_event_probability"]
            model_conf = q["confidence"]
            duration_source = "predicted"

        jc = self.risk.junction_component(junction=junction, zone=event.get("zone"), corridor=corridor)
        esi = compute_esi(cause, planning, road_closure, hour, is_weekend, jc)

        impact_radius = estimate_impact_radius(planning, road_closure, is_peak, cause)
        affected = self._affected(junction, lat, lon, impact_radius)

        similar = self.similar.query(
            {
                "event_cause": cause, "road_closure": road_closure, "hour": hour,
                "weekday": weekday, "latitude": lat, "longitude": lon,
            },
            predicted_duration=p50,
        )

        diversions = self.diversion.recommend(
            lat, lon, corridor, impact_radius, affected, similar_count=similar["match_count"]
        )

        self._escape_routes(
            lat, lon, diversions["blocked_corridor"], affected,
            diversions["recommended"], diversions["avoid_junctions"],
        )

        resources = resource_planner.plan(cause, road_closure, impact_radius, planning, affected)

        confidence = round(model_conf * 100, 1) if model_conf is not None else similar["confidence"]["score"]

        if cause in ("protest", "vip_movement", "procession"):
            data_support = "low"
        elif cause in ("water_logging", "tree_fall", "pot_holes"):
            data_support = "medium"
        else:
            data_support = "high"

        known = sum([
            bool(junction and junction != "unknown"),
            bool(corridor and corridor not in (None, "unknown") and corridor not in NON_CORRIDORS),
            bool(event.get("zone") and event.get("zone") != "unknown"),
            bool(event.get("police_station") and event.get("police_station") != "unknown"),
        ])
        location_confidence = "High" if known >= 3 else "Medium" if known == 2 else "Low"

        return {
            "event": {
                "event_cause": cause, "junction": junction, "corridor": corridor,
                "latitude": lat, "longitude": lon, "hour": hour, "weekday": weekday,
                "is_peak": bool(is_peak), "road_closure": bool(road_closure),
            },
            "esi": esi.esi,
            "risk_level": esi.risk_level,
            "esi_components": esi.components,
            "duration_hours": round(p50, 2),
            "duration_p10": round(p10, 2),
            "duration_p90": round(planning, 2),
            "planning_duration_hours": round(planning, 2),
            "long_event_probability": long_prob,
            "duration_source": duration_source,
            "impact_radius_km": impact_radius,
            "confidence": confidence,
            "data_support": data_support,
            "location_confidence": location_confidence,
            "similar_event_count": similar["match_count"],
            "affected_junctions": affected,
            "similar": similar,
            "diversions": diversions,
            "resources": resources,
        }
