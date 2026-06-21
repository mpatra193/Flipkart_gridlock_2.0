"""Unit tests for the ESI scoring engine."""

from astra.scoring.esi import (
    cause_score,
    closure_score,
    compute_esi,
    duration_score,
    risk_label,
    time_score,
)


def test_duration_bands():
    assert duration_score(0.2) == 10
    assert duration_score(0.7) == 25
    assert duration_score(2.5) == 45
    assert duration_score(5) == 60
    assert duration_score(10) == 75
    assert duration_score(20) == 85
    assert duration_score(100) == 95
    assert duration_score(None) == 10  # missing → lowest band


def test_closure_and_time():
    assert closure_score(True) == 100
    assert closure_score(0) == 0
    assert time_score(18, is_weekend=0) == 100      # evening peak
    assert time_score(3, is_weekend=0) == 5         # night
    assert time_score(18, is_weekend=1) == 60       # weekend scaled (100 * 0.6)


def test_risk_labels():
    assert risk_label(15) == "LOW"
    assert risk_label(45) == "MEDIUM"
    assert risk_label(70) == "HIGH"
    assert risk_label(90) == "CRITICAL"


def test_worked_example_procession_silk_board():
    """Procession, 6PM Fri, road closed, 2.5h, junction 72 — closure + peak elevate it."""
    res = compute_esi(
        cause="procession",
        duration_hours=2.5,
        road_closure=1,
        hour=18,
        is_weekend=0,
        junction_component=72.0,
    )
    assert 0 <= res.esi <= 100
    assert res.risk_level in ("MEDIUM", "HIGH", "CRITICAL")


def test_same_event_off_peak_no_closure_drops():
    """Removing closure and moving to a weekend night must lower ESI and risk."""
    peak_closed = compute_esi("procession", 2.5, 1, 18, 0, 72.0)
    off_open = compute_esi("procession", 2.5, 0, 2, 1, 72.0)
    assert off_open.esi < peak_closed.esi
    assert off_open.risk_level in ("LOW", "MEDIUM")


def test_cause_ordering():
    """Data-derived duration severity: longer median duration → higher score."""
    assert cause_score("pot_holes") > cause_score("vehicle_breakdown")
    assert cause_score("water_logging") > cause_score("accident")
