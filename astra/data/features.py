"""Feature engineering: time features and the Haversine affected-distance.

These are the model-ready columns derived from the cleaned event log. Spatial
risk features (junction/zone/corridor risk scores) are built separately in the
memory layer because they aggregate across the whole dataset.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import NIGHT_HOURS, PEAK_HOURS, SPAN_CORRUPTION_KM
from ..geo import haversine_km


def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    """Derive hour, weekday, month and the peak/night/weekend flags from start."""
    df = df.copy()
    start = df["start_datetime"]
    df["hour"] = start.dt.hour.astype("Int16")
    df["weekday"] = start.dt.weekday.astype("Int16")   # Mon=0 .. Sun=6
    df["month"] = start.dt.month.astype("Int16")
    df["is_weekend"] = (df["weekday"] >= 5).astype("Int8")
    df["is_peak"] = df["hour"].isin(PEAK_HOURS).astype("Int8")
    df["is_night"] = df["hour"].isin(NIGHT_HOURS).astype("Int8")
    return df


def add_affected_distance(df: pd.DataFrame) -> pd.DataFrame:
    """Physical span between start and end coordinates, in km.

    Most events are point incidents whose end coordinates are the (0,0)
    placeholder — those get distance 0. Spans above the corruption threshold
    (bad coordinate pairs that jump to hundreds of km) are also zeroed. This
    feature is intentionally weak (median ≈ 13 m); the meaningful spatial
    quantity is the modelled impact radius, not this physical span.
    """
    df = df.copy()
    lat2 = df["endlatitude"]
    lon2 = df["endlongitude"]
    # Valid two-point span: end coords present and not the ~0 placeholder.
    valid = (
        lat2.notna() & lon2.notna() & (lat2.abs() >= 1.0) & (lon2.abs() >= 1.0)
    )
    dist = pd.Series(0.0, index=df.index, dtype="float64")
    if valid.any():
        d = haversine_km(
            df.loc[valid, "latitude"],
            df.loc[valid, "longitude"],
            lat2[valid],
            lon2[valid],
        )
        dist.loc[valid] = np.asarray(d, dtype="float64")
    # Zero out coordinate corruption.
    dist = dist.where(dist <= SPAN_CORRUPTION_KM, 0.0)
    df["affected_distance_km"] = dist
    return df


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Apply all feature transforms to a cleaned event frame."""
    df = add_time_features(df)
    df = add_affected_distance(df)
    return df
