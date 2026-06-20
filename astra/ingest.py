from __future__ import annotations

import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone

import pandas as pd

from . import config

PLANNED_CAUSES = {"procession", "public_event", "vip_movement", "construction"}
_FMT = "%Y-%m-%d %H:%M:%S+00"

_lock = threading.Lock()
_state = {"active": False, "last_finished": None, "last_error": None}


def is_rebuilding() -> bool:
    return _state["active"]


def status() -> dict:
    return dict(_state)


def _start_datetime(hour, weekday) -> datetime:
    now = datetime.now(timezone.utc)
    h = int(hour) if hour is not None else now.hour
    wd = int(weekday) if weekday is not None else now.weekday()
    back = (now.weekday() - wd) % 7
    return (now - timedelta(days=back)).replace(hour=h % 24, minute=0, second=0, microsecond=0)


def _lookup(junctions_df, junction, col):
    if junctions_df is None or junction is None or "junction" not in junctions_df.columns:
        return None
    m = junctions_df[junctions_df["junction"] == junction]
    if not len(m) or col not in m.columns:
        return None
    v = m.iloc[0][col]
    return v if pd.notna(v) else None


def build_raw_row(fb: dict, structured: dict, junctions_df) -> dict:
    junction = fb.get("junction")
    lat = _lookup(junctions_df, junction, "lat")
    lon = _lookup(junctions_df, junction, "lon")
    zone = _lookup(junctions_df, junction, "zone")
    police = _lookup(junctions_df, junction, "police_station")

    cause = structured.get("event_cause") or fb.get("event_cause") or "others"
    actual = fb.get("actual_hours")
    if actual is None:
        actual = structured.get("duration_hours")
    start = _start_datetime(fb.get("hour"), fb.get("weekday"))
    closed = start + timedelta(hours=float(actual)) if actual else None
    closure = structured.get("requires_road_closure")
    if closure is None:
        closure = False

    return {
        "id": f"FBK{int(time.time() * 1000)}",
        "event_type": "planned" if cause in PLANNED_CAUSES else "unplanned",
        "latitude": float(lat) if lat is not None else None,
        "longitude": float(lon) if lon is not None else None,
        "event_cause": cause,
        "requires_road_closure": "TRUE" if closure else "FALSE",
        "start_datetime": start.strftime(_FMT),
        "closed_datetime": closed.strftime(_FMT) if closed else "NULL",
        "status": "closed",
        "priority": structured.get("priority") or "High",
        "zone": zone,
        "junction": junction,
        "police_station": police,
        "veh_type": structured.get("veh_type") or "unknown",
        "description": structured.get("description") or fb.get("notes") or "",
    }


def append_event(row: dict) -> None:
    path = config.RAW_EVENTS_CSV
    header = list(pd.read_csv(path, nrows=0).columns)
    full = {c: "" for c in header}
    for k, v in row.items():
        if k in full and v is not None:
            full[k] = v
    with open(path, "rb") as f:
        f.seek(0, 2)
        needs_nl = f.tell() > 0 and (f.seek(-1, 2), f.read(1))[1] != b"\n"
    if needs_nl:
        with open(path, "a", encoding="utf-8", newline="") as f:
            f.write("\n")
    pd.DataFrame([full])[header].to_csv(path, mode="a", header=False, index=False, lineterminator="\n")


def rebuild_and_reload(load_state_fn) -> bool:
    if _state["active"]:
        return False

    def _run():
        with _lock:
            _state["active"] = True
            _state["last_error"] = None
            try:
                build = config.ROOT / "scripts" / "build_all.py"
                subprocess.run([sys.executable, str(build)], check=True, cwd=str(config.ROOT))
                load_state_fn()
                _state["last_finished"] = time.time()
            except Exception as exc:
                _state["last_error"] = str(exc)
                print("[ingest] rebuild failed:", exc)
            finally:
                _state["active"] = False

    threading.Thread(target=_run, daemon=True).start()
    return True
