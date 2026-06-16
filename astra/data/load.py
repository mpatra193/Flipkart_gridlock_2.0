"""Raw data loading.

Reads the competition CSV exactly once and hands back a DataFrame. No cleaning
or feature work happens here — that is the job of `clean.py` and `features.py`,
kept separate so each stage is independently testable.
"""

from __future__ import annotations

import pandas as pd

from ..config import RAW_EVENTS_CSV

# Columns we actually use downstream. The raw file has 46; many are empty
# (`map_file`, `comment`, `meta_data`) or operational IDs irrelevant to modelling.
USED_COLUMNS = [
    "id",
    "event_type",
    "event_cause",
    "requires_road_closure",
    "priority",
    "status",
    "latitude",
    "longitude",
    "endlatitude",
    "endlongitude",
    "start_datetime",
    "closed_datetime",
    "zone",
    "junction",
    "corridor",
    "police_station",
    "veh_type",
    "description",
    "address",
]


def load_raw(path=RAW_EVENTS_CSV, usecols: bool = True) -> pd.DataFrame:
    """Load the raw events CSV.

    Parameters
    ----------
    path : Path
        CSV location (defaults to the configured raw dataset).
    usecols : bool
        If True, keep only `USED_COLUMNS` that are present in the file.
    """
    df = pd.read_csv(path, low_memory=False)
    if usecols:
        cols = [c for c in USED_COLUMNS if c in df.columns]
        df = df[cols].copy()
    return df
