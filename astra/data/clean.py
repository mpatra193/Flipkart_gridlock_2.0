"""Cleaning: datetime parsing, cause normalization, priority, duration label.

Duration is the only supervised-learning label in ASTRA, so its derivation and
cleaning rules live here and are applied consistently everywhere.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import (
    CAUSE_NORMALIZE,
    DURATION_MAX_HOURS,
    DURATION_MIN_HOURS,
)


def parse_datetimes(df: pd.DataFrame) -> pd.DataFrame:
    """Parse start/closed timestamps to UTC-aware datetimes.

    The raw values are ISO-8601 with a ``+00`` offset and variable fractional
    precision; ``utc=True`` normalizes them all. Unparseable values become NaT.
    """
    df = df.copy()
    for col in ("start_datetime", "closed_datetime"):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce", utc=True)
    return df


def normalize_cause(df: pd.DataFrame) -> pd.DataFrame:
    """Lowercase/trim event_cause and fold case + label variants onto canon keys.

    e.g. 'Debris' and 'debris' → 'debris'; 'Fog / Low Visibility' →
    'fog_low_visibility'. Anything already canonical is left untouched.
    """
    df = df.copy()
    raw = df["event_cause"].astype("string").str.strip().str.lower()
    df["event_cause"] = raw.map(lambda c: CAUSE_NORMALIZE.get(c, c)).fillna("others")
    return df


def normalize_priority(df: pd.DataFrame) -> pd.DataFrame:
    """Map High/Low priority to a binary `priority_high` (default High when null)."""
    df = df.copy()
    p = df["priority"].astype("string").str.strip().str.lower()
    # Null priority (2 rows) → treat as High: conservative for severity scoring.
    df["priority_high"] = (p == "high").fillna(True).astype("int8")
    return df


def compute_duration(df: pd.DataFrame) -> pd.DataFrame:
    """Add `duration_hours = closed_datetime − start_datetime` with cleaning.

    Drops (to NaN) durations that are <= 0 (closed before/at start — data error)
    or > 168h (stale tickets bulk-closed long after the event resolved). The row
    itself is kept; only the label is nulled, so the event still contributes to
    risk tables and the heatmap even when it cannot train the duration model.
    """
    df = df.copy()
    delta = (df["closed_datetime"] - df["start_datetime"]).dt.total_seconds() / 3600.0
    delta = delta.where((delta > DURATION_MIN_HOURS) & (delta <= DURATION_MAX_HOURS))
    df["duration_hours"] = delta.astype("float64")
    return df


def clean_events(df: pd.DataFrame) -> pd.DataFrame:
    """Full cleaning pipeline: datetimes → cause → priority → duration."""
    df = parse_datetimes(df)
    df = normalize_cause(df)
    df = normalize_priority(df)
    df = compute_duration(df)
    # requires_road_closure may load as bool or object; coerce to a clean int8.
    df["road_closure"] = (
        df["requires_road_closure"].astype("boolean").fillna(False).astype("int8")
    )
    return df
