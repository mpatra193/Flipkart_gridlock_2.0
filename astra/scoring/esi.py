"""Event Severity Index (ESI) — rule-based 0–100 severity.

    ESI = 0.30·S_cause + 0.25·S_duration + 0.20·S_closure
        + 0.15·S_time + 0.10·S_junction

Every component is normalized to 0–100 and each coefficient has a documented
justification (see docs/DESIGN.md). Pure functions — the junction component is
resolved upstream by RiskLookup and passed in, keeping this module testable in
isolation.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..config import (
    CAUSE_SCORE,
    CAUSE_SCORE_DEFAULT,
    DURATION_SCORE_BANDS,
    ESI_WEIGHTS,
    RISK_BANDS,
    WEEKEND_TIME_FACTOR,
)
from ..config import time_score as _hour_time_score


def cause_score(cause: str) -> float:
    return float(CAUSE_SCORE.get(cause, CAUSE_SCORE_DEFAULT))


def duration_score(hours: float | None) -> float:
    """Map predicted/elapsed duration to its severity band (10 → 95)."""
    if hours is None or hours != hours:  # None or NaN
        return float(DURATION_SCORE_BANDS[0][1])
    for upper, score in DURATION_SCORE_BANDS:
        if hours < upper:
            return float(score)
    return float(DURATION_SCORE_BANDS[-1][1])


def closure_score(road_closure: bool | int) -> float:
    return 100.0 if int(road_closure) == 1 else 0.0


def time_score(hour: int, is_weekend: bool | int = 0) -> float:
    """Hour-of-day severity, scaled down on weekends (lower traffic volume)."""
    base = float(_hour_time_score(int(hour)))
    return base * (WEEKEND_TIME_FACTOR if int(is_weekend) == 1 else 1.0)


def risk_label(esi: float) -> str:
    for upper, label in RISK_BANDS:
        if esi <= upper:
            return label
    return RISK_BANDS[-1][1]


@dataclass
class ESIResult:
    esi: float
    risk_level: str
    components: dict  # raw component scores, for explainability in the UI


def compute_esi(
    cause: str,
    duration_hours: float | None,
    road_closure: bool | int,
    hour: int,
    is_weekend: bool | int,
    junction_component: float,
) -> ESIResult:
    """Weighted sum of the five components → 0–100 ESI + risk label + breakdown."""
    comp = {
        "cause": cause_score(cause),
        "duration": duration_score(duration_hours),
        "closure": closure_score(road_closure),
        "time": time_score(hour, is_weekend),
        "junction": float(junction_component),
    }
    esi = sum(ESI_WEIGHTS[k] * comp[k] for k in ESI_WEIGHTS)
    esi = round(min(max(esi, 0.0), 100.0), 2)
    return ESIResult(esi=esi, risk_level=risk_label(esi), components=comp)
