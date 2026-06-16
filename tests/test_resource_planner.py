import math

from astra.engines import resource_planner as rp


def _affected():
    return [
        {"junction": "A", "risk": "HIGH", "congestion": 0.9, "junction_risk": 80, "corridor": "Hosur Road"},
        {"junction": "B", "risk": "HIGH", "congestion": 0.7, "junction_risk": 60, "corridor": "x"},
        {"junction": "C", "risk": "MEDIUM", "congestion": 0.5, "junction_risk": 40, "corridor": "x"},
        {"junction": "D", "risk": "LOW", "congestion": 0.2, "junction_risk": 20, "corridor": "x"},
    ]


def test_police_breakdown():
    p = rp.police_breakdown(_affected(), impact_radius=6.0, cause="procession")
    assert p["point_duty"] == 2 * 2 + 1 * 1
    assert p["perimeter"] == math.ceil(2 * math.pi * 6.0 / 1.5)
    assert p["site"] == 4


def test_police_cap():
    many = [{"junction": f"J{i}", "risk": "HIGH", "congestion": 0.9} for i in range(40)]
    p = rp.police_breakdown(many, impact_radius=10.0, cause="protest")
    assert p["recommended"] == 50 and p["capped"] is True


def test_barricades():
    assert rp.barricades(6.0, road_closure=1) == {"site": 4, "diversion": 24, "total": 28}
    assert rp.barricades(2.0, road_closure=0)["site"] == 1


def test_patrol_vehicles():
    assert rp.patrol_vehicles(6.0, duration_hours=2) == min(math.ceil(math.pi * 36 / 8), 8)
    assert rp.patrol_vehicles(2.0, duration_hours=20) <= 8


def test_deployment_prioritizes_major_corridor():
    plan = rp.deployment_plan(_affected(), police_budget=10)
    assert plan[0]["junction"] == "A"
    assert all(p["risk"] in ("HIGH", "MEDIUM") for p in plan)


def test_full_plan():
    out = rp.plan("procession", 1, 6.0, 2.5, _affected())
    assert out["police"]["recommended"] > 0
    assert out["barricades"]["total"] == 28
    assert len(out["deployment_plan"]) >= 1
