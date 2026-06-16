"""Historical memory: junction / zone / corridor risk tables + junction registry.

These aggregate the whole event log into location-level risk profiles. They feed
the ESI junction component (with a junction→zone→corridor→neutral cascade), the
spillover graph (node coordinates), and the diversion engine (corridor load).

Risk score construction (0–100): each component is min-max normalized to [0,1]
across all locations, combined with the configured weights, then scaled ×100.
Normalizing per component first (rather than weighting raw counts against raw
hours) keeps the score scale-consistent and interpretable.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import JUNCTION_RISK_WEIGHTS

# Shrinkage strength: a location needs ~SHRINK_K incidents before its own
# duration/closure rate outweighs the global prior. Tames single-incident
# junctions whose one freak 70h event or lone closure would otherwise spike.
SHRINK_K = 5.0


def _minmax(s: pd.Series) -> pd.Series:
    """Min-max normalize to [0,1]; constant or empty columns map to 0.5 (neutral)."""
    s = s.astype("float64")
    lo, hi = s.min(), s.max()
    if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
        return pd.Series(0.5, index=s.index)
    return (s - lo) / (hi - lo)


def _shrink(value: pd.Series, count: pd.Series, prior: float, k: float = SHRINK_K) -> pd.Series:
    """Empirical-Bayes shrinkage of a per-group statistic toward a global prior.

        shrunk = (count·value + k·prior) / (count + k)

    Low-count groups are pulled toward `prior`; high-count groups keep their own
    estimate. NaN values (no observations) collapse to the prior.
    """
    value = value.astype("float64").fillna(prior)
    count = count.astype("float64").fillna(0.0)
    return (count * value + k * prior) / (count + k)


def _risk_score(
    incident_count: pd.Series,
    avg_duration: pd.Series,
    dur_count: pd.Series,
    closure_rate: pd.Series,
    prior_duration: float,
    prior_closure: float,
) -> pd.Series:
    """Shared 0–100 risk score: log-frequency + shrunk duration + shrunk closure.

    incident_count uses log1p before min-max (diminishing returns, smoother
    spread across mid-frequency locations); duration and closure are shrunk
    toward their global priors so low-count locations cannot spike on noise.
    """
    w = JUNCTION_RISK_WEIGHTS
    dur = _shrink(avg_duration, dur_count, prior_duration)
    clo = _shrink(closure_rate, incident_count, prior_closure)
    raw = (
        w["incident_count"] * _minmax(np.log1p(incident_count.astype("float64")))
        + w["avg_duration"] * _minmax(dur)
        + w["road_closure_rate"] * _minmax(clo)
    )
    return (100.0 * raw).round(2)


def _has_junction(df: pd.DataFrame) -> pd.Series:
    j = df["junction"].astype("string").str.strip()
    return j.notna() & (j != "")


def build_junction_registry(df: pd.DataFrame) -> pd.DataFrame:
    """One row per named junction: representative coordinates + incident count.

    Coordinates are the median of all events at the junction (robust to a few
    mis-tagged points). This is the node set for the spillover graph.
    """
    sub = df[_has_junction(df)].copy()
    reg = (
        sub.groupby("junction")
        .agg(
            lat=("latitude", "median"),
            lon=("longitude", "median"),
            incident_count=("id", "count"),
        )
        .reset_index()
        .sort_values("incident_count", ascending=False)
        .reset_index(drop=True)
    )
    return reg


def build_junction_risk(df: pd.DataFrame) -> pd.DataFrame:
    """Per-junction risk profile and shrinkage-based 0–100 risk score."""
    sub = df[_has_junction(df)].copy()
    prior_dur = float(sub["duration_hours"].mean())
    prior_clo = float(sub["road_closure"].mean())
    agg = (
        sub.groupby("junction")
        .agg(
            lat=("latitude", "median"),
            lon=("longitude", "median"),
            incident_count=("id", "count"),
            dur_count=("duration_hours", "count"),
            avg_duration=("duration_hours", "mean"),
            road_closure_rate=("road_closure", "mean"),
            avg_priority_high=("priority_high", "mean"),
        )
        .reset_index()
    )
    agg["risk_score"] = _risk_score(
        agg["incident_count"], agg["avg_duration"], agg["dur_count"],
        agg["road_closure_rate"], prior_dur, prior_clo,
    )
    return agg.sort_values("risk_score", ascending=False).reset_index(drop=True)


def build_zone_risk(df: pd.DataFrame) -> pd.DataFrame:
    """Per-zone risk profile and 0–100 risk score (ESI fallback when junction missing)."""
    z = df["zone"].astype("string").str.strip()
    sub = df[z.notna() & (z != "")].copy()
    prior_dur = float(sub["duration_hours"].mean())
    prior_clo = float(sub["road_closure"].mean())
    agg = (
        sub.groupby("zone")
        .agg(
            incident_count=("id", "count"),
            dur_count=("duration_hours", "count"),
            avg_duration=("duration_hours", "mean"),
            closure_rate=("road_closure", "mean"),
            high_priority_rate=("priority_high", "mean"),
        )
        .reset_index()
    )
    agg["risk_score"] = _risk_score(
        agg["incident_count"], agg["avg_duration"], agg["dur_count"],
        agg["closure_rate"], prior_dur, prior_clo,
    )
    return agg.sort_values("risk_score", ascending=False).reset_index(drop=True)


def build_corridor_risk(df: pd.DataFrame) -> pd.DataFrame:
    """Per-corridor risk profile and 0–100 risk score (feeds diversion + ESI fallback)."""
    c = df["corridor"].astype("string").str.strip()
    sub = df[c.notna() & (c != "")].copy()
    prior_dur = float(sub["duration_hours"].mean())
    prior_clo = float(sub["road_closure"].mean())
    agg = (
        sub.groupby("corridor")
        .agg(
            incident_count=("id", "count"),
            dur_count=("duration_hours", "count"),
            avg_duration=("duration_hours", "mean"),
            closure_rate=("road_closure", "mean"),
        )
        .reset_index()
    )
    agg["risk_score"] = _risk_score(
        agg["incident_count"], agg["avg_duration"], agg["dur_count"],
        agg["closure_rate"], prior_dur, prior_clo,
    )
    return agg.sort_values("risk_score", ascending=False).reset_index(drop=True)
