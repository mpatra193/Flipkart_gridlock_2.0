import numpy as np
import pandas as pd

from astra.engines.similar_events import (
    SimilarEventEngine,
    _consistency_factor,
    _count_factor,
)


def _candidates():
    rng = np.random.default_rng(0)
    n = 40
    return pd.DataFrame(
        {
            "id": [f"e{i}" for i in range(n)],
            "event_cause": ["procession"] * 20 + ["vehicle_breakdown"] * 20,
            "road_closure": [1] * 20 + [0] * 20,
            "hour": [18] * 20 + [3] * 20,
            "weekday": [2] * 20 + [6] * 20,
            "latitude": 12.917 + rng.normal(0, 0.001, n),
            "longitude": 77.622 + rng.normal(0, 0.001, n),
            "duration_hours": [3.0 + rng.normal(0, 0.3) for _ in range(20)]
            + [0.6 + rng.normal(0, 0.1) for _ in range(20)],
            "esi": [70.0] * 20 + [20.0] * 20,
            "junction": ["SilkBoardJunc"] * n,
            "zone": ["South"] * n,
            "start_datetime": pd.Timestamp("2024-06-01", tz="UTC"),
        }
    )


def test_matches_are_same_cause():
    eng = SimilarEventEngine(_candidates())
    q = {
        "event_cause": "procession",
        "road_closure": 1,
        "hour": 18,
        "weekday": 2,
        "latitude": 12.917,
        "longitude": 77.622,
    }
    res = eng.query(q, predicted_duration=3.0)
    assert res["match_count"] > 0
    assert all(m["event_cause"] == "procession" for m in res["matches"])
    assert 2.0 < res["stats"]["median"] < 4.0


def test_confidence_high_when_consistent_and_aligned():
    eng = SimilarEventEngine(_candidates())
    q = {
        "event_cause": "procession",
        "road_closure": 1,
        "hour": 18,
        "weekday": 2,
        "latitude": 12.917,
        "longitude": 77.622,
    }
    res = eng.query(q, predicted_duration=3.0)
    assert res["confidence"]["score"] > 70


def test_factor_helpers():
    assert _count_factor(14) == 1.0
    assert _count_factor(1) == 0.2
    assert _consistency_factor(np.array([3.0, 3.1, 2.9])) == 1.0
    assert _consistency_factor(np.array([0.5, 18.0])) == 0.4
    assert _consistency_factor(np.array([0.2, 0.3, 40.0])) == 0.2
