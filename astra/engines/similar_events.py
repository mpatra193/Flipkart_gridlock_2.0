from __future__ import annotations

import numpy as np
import pandas as pd

from .. import config
from ..geo import haversine_km


def _count_factor(n):
    if n >= 14:
        return 1.0
    if n >= 10:
        return 0.8
    if n >= 5:
        return 0.6
    if n >= 2:
        return 0.4
    return 0.2


def _consistency_factor(durations):
    if len(durations) < 2:
        return 0.2
    mean = float(np.mean(durations))
    if mean <= 0:
        return 0.2
    cv = float(np.std(durations)) / mean
    if cv < 0.3:
        return 1.0
    if cv < 0.6:
        return 0.7
    if cv < 1.0:
        return 0.4
    return 0.2


def _alignment_factor(predicted, durations):
    if predicted is None or len(durations) == 0:
        return None
    lo, hi = float(np.min(durations)), float(np.max(durations))
    if lo <= predicted <= hi:
        return 1.0
    span = hi - lo
    if lo - 0.5 * span <= predicted <= hi + 0.5 * span:
        return 0.7
    return 0.3


class SimilarEventEngine:
    def __init__(self, candidates):
        self.df = candidates.reset_index(drop=True)
        self.cause = self.df["event_cause"].astype("string").to_numpy()
        self.closure = self.df["road_closure"].astype("int8").to_numpy()
        self.hour = self.df["hour"].astype("float64").to_numpy()
        self.weekday = self.df["weekday"].astype("float64").to_numpy()
        self.lat = self.df["latitude"].astype("float64").to_numpy()
        self.lon = self.df["longitude"].astype("float64").to_numpy()
        self.duration = self.df["duration_hours"].astype("float64").to_numpy()
        self.esi = self.df["esi"].astype("float64").to_numpy() if "esi" in self.df else None

    @classmethod
    def load(cls):
        df = pd.read_parquet(config.EVENTS_SCORED)
        return cls(df[df["duration_hours"].notna()].copy())

    def _distances(self, cause, road_closure, hour, weekday, lat, lon):
        w = config.SIMILARITY_WEIGHTS
        d_cause = w["cause"] * (self.cause != cause)
        d_closure = w["closure"] * (self.closure != int(road_closure))
        hour_diff = np.abs(self.hour - hour)
        hour_diff = np.minimum(hour_diff, 24 - hour_diff)
        d_hour = w["hour"] * (hour_diff / config.SIMILARITY_HOUR_NORM)
        day_diff = np.abs(self.weekday - weekday)
        day_diff = np.minimum(day_diff, 7 - day_diff)
        d_day = w["weekday"] * (day_diff / config.SIMILARITY_WEEKDAY_NORM)
        geo = haversine_km(lat, lon, self.lat, self.lon)
        d_loc = w["location"] * np.minimum(geo / config.SIMILARITY_LOCATION_NORM_KM, 1.0)
        return d_cause + d_closure + d_hour + d_day + d_loc

    def query(self, event, k=None, threshold=None, predicted_duration=None):
        k = k or config.SIMILAR_K
        threshold = threshold if threshold is not None else config.SIMILARITY_THRESHOLD

        dist = self._distances(
            event["event_cause"],
            event.get("road_closure", 0),
            float(event["hour"]),
            float(event["weekday"]),
            float(event["latitude"]),
            float(event["longitude"]),
        )
        order = np.argsort(dist)[: k * 3]
        kept = [i for i in order if dist[i] <= threshold][:k]

        matches = []
        for i in kept:
            row = self.df.iloc[i]
            matches.append(
                {
                    "id": str(row.get("id", i)),
                    "similarity": round(float(1 - dist[i]) * 100, 1),
                    "event_cause": str(row["event_cause"]),
                    "junction": (None if pd.isna(row.get("junction")) else str(row.get("junction"))),
                    "zone": (None if pd.isna(row.get("zone")) else str(row.get("zone"))),
                    "road_closure": int(row["road_closure"]),
                    "duration_hours": round(float(row["duration_hours"]), 2),
                    "esi": (None if self.esi is None else round(float(self.esi[i]), 1)),
                    "start": (None if pd.isna(row.get("start_datetime")) else str(row["start_datetime"])[:10]),
                }
            )

        durations = np.array([m["duration_hours"] for m in matches], dtype="float64")
        stats = self._summary(durations)
        confidence = self._confidence(durations, predicted_duration)

        return {
            "match_count": len(matches),
            "matches": matches,
            "stats": stats,
            "confidence": confidence,
        }

    def _summary(self, durations):
        if len(durations) == 0:
            return {"mean": None, "median": None, "min": None, "max": None}
        return {
            "mean": round(float(np.mean(durations)), 2),
            "median": round(float(np.median(durations)), 2),
            "min": round(float(np.min(durations)), 2),
            "max": round(float(np.max(durations)), 2),
        }

    def _confidence(self, durations, predicted):
        w = config.CONFIDENCE_WEIGHTS
        f_count = _count_factor(len(durations))
        f_cons = _consistency_factor(durations)
        f_align = _alignment_factor(predicted, durations)
        if f_align is None:
            score = (f_count * w["match_count"] + f_cons * w["consistency"]) / (
                w["match_count"] + w["consistency"]
            )
        else:
            score = f_count * w["match_count"] + f_cons * w["consistency"] + f_align * w["alignment"]
        return {
            "score": round(float(score) * 100, 1),
            "match_count_factor": f_count,
            "consistency_factor": f_cons,
            "alignment_factor": f_align,
        }
