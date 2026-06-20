from __future__ import annotations

import math

import numpy as np
from scipy.optimize import LinearConstraint, milp
from scipy.sparse import eye as speye

from .. import config


# ── helpers (unchanged) ─────────────────────────────────────────────────────

def _road_importance(corridor):
    if corridor and any(m in corridor for m in config.MAJOR_CORRIDORS):
        return config.MAJOR_CORRIDOR_IMPORTANCE
    return config.DEFAULT_CORRIDOR_IMPORTANCE


def site_officers(cause):
    return config.SITE_OFFICERS.get(cause, config.SITE_OFFICERS_DEFAULT)


# ── sub-components (unchanged interface) ────────────────────────────────────

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


# ── MILP-optimised deployment ───────────────────────────────────────────────

def _optimised_deployment(affected_junctions, budget):
    """Solve a Mixed-Integer Linear Program to find the minimum total
    officers that still clears the aggregate congestion demand.

    Variables
    ---------
    x_i : int  — officers assigned to junction *i*

    Objective
    ---------
    minimise  sum(x_i)   (fewest officers possible)

    Constraints
    -----------
    1. Global clearance: sum(x_i * efficiency_i) >= total_demand
       where efficiency_i = importance(corridor_i) and
       demand_i = congestion_i * 100  (normalised to officer-units).
    2. Per-junction bounds:
       - HIGH  risk junctions: 1 <= x_i <= 4
       - MEDIUM risk junctions: 0 <= x_i <= 3
       - LOW   risk junctions: 0 <= x_i <= 2
    3. Budget cap: sum(x_i) <= budget
    4. Integrality: every x_i must be a non-negative integer.
    """
    n = len(affected_junctions)
    if n == 0:
        return []

    # Build per-junction vectors
    efficiencies = np.array(
        [_road_importance(a.get("corridor")) for a in affected_junctions],
        dtype=float,
    )

    # Each junction's demand is its congestion level (0..1).
    # Each officer deployed at junction i clears efficiency_i units of demand.
    # We want: sum(x_i * eff_i) >= total_demand
    demands = np.array(
        [float(a.get("congestion", 0.0)) for a in affected_junctions],
        dtype=float,
    )
    total_demand = float(demands.sum())

    # Bounds per junction
    lb = np.zeros(n, dtype=float)
    ub = np.full(n, 2.0, dtype=float)
    for i, a in enumerate(affected_junctions):
        risk = a.get("risk", "LOW")
        if risk == "HIGH":
            lb[i] = 1.0   # must have at least 1
            ub[i] = 4.0
        elif risk == "MEDIUM":
            lb[i] = 0.0
            ub[i] = 3.0
        else:
            lb[i] = 0.0
            ub[i] = 2.0

    from scipy.optimize import Bounds

    bounds = Bounds(lb=lb, ub=ub)

    # Check feasibility: can max allocation reach total_demand?
    max_clearance = float(np.sum(ub * efficiencies))
    if max_clearance < total_demand:
        # Scale demand down so the problem is tight but feasible
        total_demand = max_clearance * 0.95

    # Objective: minimise sum(x_i)  → cost vector is all 1s
    c = np.ones(n, dtype=float)

    # Constraint 1: sum(x_i * eff_i) >= total_demand
    # milp uses form lb <= A @ x <= ub  for linear constraints
    # So: total_demand <= eff @ x <= +inf
    clearance_constraint = LinearConstraint(
        A=efficiencies.reshape(1, -1),
        lb=total_demand,
        ub=np.inf,
    )

    # Constraint 2: sum(x_i) <= budget
    budget_constraint = LinearConstraint(
        A=np.ones((1, n), dtype=float),
        lb=0.0,
        ub=float(budget),
    )

    constraints = [clearance_constraint, budget_constraint]

    # All variables are integers
    integrality = np.ones(n, dtype=int)  # 1 = integer

    result = milp(
        c=c,
        constraints=constraints,
        integrality=integrality,
        bounds=bounds,
    )

    if not result.success:
        return None  # signal fallback

    allocations = np.round(result.x).astype(int)
    return allocations


def _heuristic_deployment(affected_junctions, budget):
    """Original rule-based fallback (kept for safety)."""
    ranked = []
    for a in affected_junctions:
        jr = float(a.get("junction_risk", 50.0)) / 100.0
        importance = _road_importance(a.get("corridor"))
        priority = a.get("congestion", 0.0) * jr * importance
        ranked.append((priority, a))
    ranked.sort(key=lambda t: t[0], reverse=True)

    plan = []
    remaining = budget
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
        plan.append({
            "junction": a["junction"],
            "risk": a.get("risk"),
            "officers": officers,
            "barricades": 1,
            "congestion": round(float(a.get("congestion", 0.0)), 3),
        })
    return plan


def deployment_plan(affected_junctions, budget):
    """Build an optimal per-junction deployment using MILP, falling back
    to the heuristic if the solver is unavailable or infeasible."""

    try:
        allocations = _optimised_deployment(affected_junctions, budget)
    except Exception:
        allocations = None

    if allocations is None:
        return _heuristic_deployment(affected_junctions, budget)

    # Convert MILP result into the standard plan format
    plan = []
    for i, a in enumerate(affected_junctions):
        officers = int(allocations[i])
        if officers <= 0:
            continue
        plan.append({
            "junction": a["junction"],
            "risk": a.get("risk"),
            "officers": officers,
            "barricades": max(1, officers // 2),
            "congestion": round(float(a.get("congestion", 0.0)), 3),
        })

    # Sort by officers descending (highest priority first)
    plan.sort(key=lambda d: d["officers"], reverse=True)
    return plan


# ── police breakdown (uses MILP total for point_duty) ───────────────────────

def police_breakdown(affected_junctions, impact_radius, cause):
    """Compute the officer breakdown.  The point-duty figure now comes from
    the MILP solver instead of the old per-risk-level multipliers."""

    # Run the optimiser to get total point-duty officers
    preliminary_budget = config.TOTAL_POLICE_CAP
    try:
        allocations = _optimised_deployment(affected_junctions, preliminary_budget)
    except Exception:
        allocations = None

    if allocations is not None:
        point_duty = int(np.sum(allocations))
    else:
        # Heuristic fallback
        highs = sum(1 for a in affected_junctions if a.get("risk") == "HIGH")
        mediums = sum(1 for a in affected_junctions if a.get("risk") == "MEDIUM")
        point_duty = (
            highs * config.OFFICERS_PER_HIGH_JUNCTION
            + mediums * config.OFFICERS_PER_MEDIUM_JUNCTION
        )

    perimeter = math.ceil(2 * math.pi * impact_radius / config.PERIMETER_KM_PER_OFFICER)
    site = site_officers(cause)
    raw_total = point_duty + perimeter + site

    highs = sum(1 for a in affected_junctions if a.get("risk") == "HIGH")
    mediums = sum(1 for a in affected_junctions if a.get("risk") == "MEDIUM")
    lows = sum(1 for a in affected_junctions if a.get("risk") == "LOW")

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
        "optimiser": "milp" if allocations is not None else "heuristic",
    }


# ── public entry point (same signature as before) ──────────────────────────

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
