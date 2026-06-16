from __future__ import annotations

import math

from .. import config


def _road_importance(corridor):
    if corridor and any(m in corridor for m in config.MAJOR_CORRIDORS):
        return config.MAJOR_CORRIDOR_IMPORTANCE
    return config.DEFAULT_CORRIDOR_IMPORTANCE


def site_officers(cause):
    return config.SITE_OFFICERS.get(cause, config.SITE_OFFICERS_DEFAULT)


def police_breakdown(affected_junctions, impact_radius, cause):
    highs = sum(1 for a in affected_junctions if a.get("risk") == "HIGH")
    mediums = sum(1 for a in affected_junctions if a.get("risk") == "MEDIUM")
    lows = sum(1 for a in affected_junctions if a.get("risk") == "LOW")

    point_duty = (
        highs * config.OFFICERS_PER_HIGH_JUNCTION
        + mediums * config.OFFICERS_PER_MEDIUM_JUNCTION
        + lows * config.OFFICERS_PER_LOW_JUNCTION
    )
    perimeter = math.ceil(2 * math.pi * impact_radius / config.PERIMETER_KM_PER_OFFICER)
    site = site_officers(cause)
    raw_total = point_duty + perimeter + site
    return {
        "point_duty": point_duty,
        "perimeter": perimeter,
        "site": site,
        "raw_total": raw_total,
        "recommended": min(raw_total, config.TOTAL_POLICE_CAP),
        "capped": raw_total > config.TOTAL_POLICE_CAP,
        "high_junctions": highs,
        "medium_junctions": mediums,
        "low_junctions": lows,
    }


def barricades(impact_radius, road_closure):
    site = config.SITE_BARRICADES_CLOSURE if int(road_closure) == 1 else config.SITE_BARRICADES_OPEN
    diversion = math.ceil(impact_radius * config.DIVERSION_BARRICADES_PER_KM)
    return {"site": site, "diversion": diversion, "total": site + diversion}


def patrol_vehicles(impact_radius, duration_hours):
    area = math.pi * impact_radius ** 2
    vehicles = math.ceil(area / config.PATROL_SQKM_PER_VEHICLE)
    if duration_hours is not None and duration_hours == duration_hours:
        if duration_hours > config.PATROL_LONG_DURATION_HOURS:
            vehicles *= 2
    return min(max(vehicles, 1), config.PATROL_VEHICLE_CAP)


def deployment_plan(affected_junctions, police_budget):
    ranked = []
    for a in affected_junctions:
        jr = float(a.get("junction_risk", 50.0)) / 100.0
        importance = _road_importance(a.get("corridor"))
        priority = a.get("congestion", 0.0) * jr * importance
        ranked.append((priority, a))
    ranked.sort(key=lambda t: t[0], reverse=True)

    plan = []
    remaining = police_budget
    for _, a in ranked:
        if remaining <= 0:
            break
        if a.get("risk") == "HIGH":
            officers = min(2, remaining)
        elif a.get("risk") == "MEDIUM":
            officers = min(1, remaining)
        else:
            continue
        remaining -= officers
        plan.append(
            {
                "junction": a["junction"],
                "risk": a.get("risk"),
                "officers": officers,
                "barricades": 1,
                "congestion": round(float(a.get("congestion", 0.0)), 3),
            }
        )
    return plan


def plan(cause, road_closure, impact_radius, duration_hours, affected_junctions):
    police = police_breakdown(affected_junctions, impact_radius, cause)
    barr = barricades(impact_radius, road_closure)
    patrol = patrol_vehicles(impact_radius, duration_hours)
    deploy = deployment_plan(affected_junctions, police["point_duty"])
    return {
        "police": police,
        "barricades": barr,
        "patrol_vehicles": patrol,
        "deployment_plan": deploy,
    }
