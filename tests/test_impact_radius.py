import pandas as pd

from astra.engines.impact_radius import (
    base_radius,
    estimate_impact_radius,
    find_affected_junctions,
    ring_for_distance,
)


def test_base_radius_bands():
    assert base_radius(0.2) == 0.3
    assert base_radius(0.8) == 0.8
    assert base_radius(2.5) == 1.5
    assert base_radius(5) == 3.0
    assert base_radius(10) == 5.0
    assert base_radius(30) == 7.0
    assert base_radius(None) == 0.3


def test_impact_radius_multipliers_monotonic():
    # behaviour, not exact constants: closure / peak / a more disruptive cause each
    # enlarge the radius, and the worst case stays within the 10 km cap.
    base = estimate_impact_radius(2.5, road_closure=0, is_peak=0, cause="vehicle_breakdown")
    assert estimate_impact_radius(2.5, road_closure=1, is_peak=0, cause="vehicle_breakdown") > base
    assert estimate_impact_radius(2.5, road_closure=0, is_peak=1, cause="vehicle_breakdown") > base
    assert estimate_impact_radius(2.5, road_closure=0, is_peak=0, cause="water_logging") >= base
    worst = estimate_impact_radius(2.5, road_closure=1, is_peak=1, cause="water_logging")
    assert base <= worst <= 10.0


def test_radius_capped_at_10():
    # base(48)=7.0 × closure(1.69) × peak(1.0) × cause(1.98) = 23.42 → capped
    r = estimate_impact_radius(48, road_closure=1, is_peak=1, cause="construction")
    assert r == 10.0


def test_rings():
    assert ring_for_distance(1.0, 6.0) == "HIGH"
    assert ring_for_distance(3.0, 6.0) == "MEDIUM"
    assert ring_for_distance(5.5, 6.0) == "LOW"


def test_find_affected_junctions():
    registry = pd.DataFrame(
        {
            "junction": ["A", "B", "C", "Far"],
            "lat": [12.917, 12.920, 12.950, 13.200],
            "lon": [77.622, 77.625, 77.640, 77.700],
        }
    )
    affected = find_affected_junctions(12.917, 77.622, 6.0, registry)
    names = [a.junction for a in affected]
    assert "A" in names and "Far" not in names
    assert affected[0].junction == "A" and affected[0].ring == "HIGH"
