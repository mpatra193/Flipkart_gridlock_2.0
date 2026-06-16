import pandas as pd

from astra.engines.diversion import DiversionEngine, _load_factor


def _engine():
    registry = pd.DataFrame(
        {
            "junction": ["J1", "J2", "J3", "J4", "J5", "J6"],
            "lat": [12.90, 12.91, 12.95, 12.96, 13.20, 13.21],
            "lon": [77.60, 77.60, 77.62, 77.62, 77.75, 77.75],
            "incident_count": [10, 10, 5, 5, 50, 50],
        }
    )
    junction_corridor = {
        "J1": "Blocked Rd", "J2": "Blocked Rd",
        "J3": "Near Rd", "J4": "Near Rd",
        "J5": "Far Rd", "J6": "Far Rd",
    }
    corridor_risk = pd.DataFrame(
        {"corridor": ["Blocked Rd", "Near Rd", "Far Rd"], "incident_count": [20, 10, 100]}
    )
    return DiversionEngine(corridor_risk, junction_corridor, registry)


def test_load_factor():
    assert _load_factor(0) == 1.0
    assert _load_factor(3) == 0.1


def test_excludes_blocked_and_prefers_near():
    eng = _engine()
    affected = [{"junction": "J1", "congestion": 0.9}]
    res = eng.recommend(12.90, 77.60, "Blocked Rd", 6.0, affected, similar_count=15)
    corridors = [r["corridor"] for r in res["recommended"]]
    assert "Blocked Rd" not in corridors
    assert res["recommended"][0]["corridor"] == "Near Rd"
    assert "J1" in res["avoid_junctions"]


def test_far_corridor_lower_proximity():
    eng = _engine()
    res = eng.recommend(12.90, 77.60, "Blocked Rd", 6.0, [], similar_count=0)
    by = {r["corridor"]: r for r in res["recommended"]}
    if "Far Rd" in by and "Near Rd" in by:
        assert by["Near Rd"]["proximity"] > by["Far Rd"]["proximity"]
