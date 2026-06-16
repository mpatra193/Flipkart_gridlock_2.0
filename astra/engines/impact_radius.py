from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from .. import config
from ..geo import haversine_km


def base_radius(duration_hours):
    if duration_hours is None or duration_hours != duration_hours or duration_hours <= 0:
        return config.IMPACT_BASE_BANDS[0][1]
    for upper, base in config.IMPACT_BASE_BANDS:
        if duration_hours < upper:
            return base
    return config.IMPACT_BASE_BANDS[-1][1]


def estimate_impact_radius(duration_hours, road_closure, is_peak, cause):
    base = base_radius(duration_hours)
    closure_mult = config.IMPACT_CLOSURE_MULT if int(road_closure) == 1 else 1.0
    peak_mult = config.IMPACT_PEAK_MULT if int(is_peak) == 1 else 1.0
    cause_mult = config.IMPACT_CAUSE_MULT.get(cause, config.IMPACT_CAUSE_MULT_DEFAULT)
    radius = base * closure_mult * peak_mult * cause_mult
    return round(min(radius, config.MAX_IMPACT_RADIUS_KM), 3)


def ring_for_distance(distance_km, radius_km):
    if distance_km <= radius_km * config.RING_INNER_FRAC:
        return "HIGH"
    if distance_km <= radius_km * config.RING_MIDDLE_FRAC:
        return "MEDIUM"
    return "LOW"


@dataclass
class AffectedJunction:
    junction: str
    lat: float
    lon: float
    distance_km: float
    ring: str


def find_affected_junctions(event_lat, event_lon, radius_km, registry):
    dists = haversine_km(event_lat, event_lon, registry["lat"], registry["lon"])
    out = registry.copy()
    out["distance_km"] = dists
    out = out[out["distance_km"] <= radius_km].sort_values("distance_km")
    result = []
    for r in out.itertuples(index=False):
        result.append(
            AffectedJunction(
                junction=r.junction,
                lat=float(r.lat),
                lon=float(r.lon),
                distance_km=round(float(r.distance_km), 3),
                ring=ring_for_distance(float(r.distance_km), radius_km),
            )
        )
    return result
