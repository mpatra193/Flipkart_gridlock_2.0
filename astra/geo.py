"""Geospatial utilities — Haversine great-circle distance.

Used everywhere a straight-line distance is needed: affected-distance feature,
impact-radius circle, spillover edge candidates, similar-event location match.
Road distances (graph edges, diversion routes) come from the MapMyIndia API
layer, not from here.
"""

from __future__ import annotations

import numpy as np

from .config import EARTH_RADIUS_KM


def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in km between two points (scalars or arrays).

    Vectorized: any argument may be a NumPy array / pandas Series as long as the
    shapes broadcast. Inputs are degrees; output is kilometres.

        a = sin²(Δφ/2) + cos φ₁ · cos φ₂ · sin²(Δλ/2)
        d = 2R · arcsin(√a)
    """
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2.0) ** 2
    return EARTH_RADIUS_KM * 2.0 * np.arcsin(np.sqrt(a))
