from __future__ import annotations

import json
import os

import httpx

from .. import config  # noqa: F401  (ensures .env is loaded)

MODEL = "gemini-2.5-flash"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

SCHEMA = {
    "type": "object",
    "properties": {
        "delay_factors": {"type": "array", "items": {"type": "string"}},
        "inferred_effective": {"type": "string", "enum": ["yes", "partial", "no", "unknown"]},
        "inferred_hours": {"type": "number", "nullable": True},
        "summary": {"type": "string"},
    },
}

PROMPT = (
    "You are analysing a traffic police officer's free-text note about how a road incident was handled. "
    "Extract structured signals.\n"
    "- delay_factors: short lowercase snake_case tags for what made clearance take longer "
    "(e.g. tow_truck_delay, heavy_rain, crowd_surge, vip_protocol, equipment_shortage, waterlogging_deep). "
    "Empty list if none implied.\n"
    "- inferred_effective: was the recommended diversion/reroute effective? yes / partial / no, "
    "or unknown if the note does not say.\n"
    "- inferred_hours: any explicit clearance duration the note mentions, in hours; null if none.\n"
    "- summary: one short neutral sentence.\n\n"
    "Context: cause={cause}, junction={junction}.\nNote: {notes}"
)


def configured() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def extract(notes: str | None, cause: str | None = None, junction: str | None = None) -> dict:
    if not configured() or not notes or not notes.strip():
        return {}
    body = {
        "contents": [{"parts": [{"text": PROMPT.format(cause=cause or "unknown", junction=junction or "unknown", notes=notes.strip())}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": SCHEMA},
    }
    try:
        resp = httpx.post(URL, params={"key": os.getenv("GEMINI_API_KEY")}, json=body, timeout=15)
        resp.raise_for_status()
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
    except Exception:
        return {}

    out: dict = {}
    factors = parsed.get("delay_factors")
    if isinstance(factors, list):
        tags = [str(f).strip().lower().replace(" ", "_") for f in factors if str(f).strip()]
        if tags:
            out["delay_factors"] = tags[:6]
    eff = parsed.get("inferred_effective")
    if eff in ("yes", "partial", "no"):
        out["inferred_effective"] = eff
    hrs = parsed.get("inferred_hours")
    if isinstance(hrs, (int, float)) and 0 < hrs <= 168:
        out["inferred_hours"] = float(hrs)
    summary = parsed.get("summary")
    if isinstance(summary, str) and summary.strip():
        out["notes_summary"] = summary.strip()
    return out


EVENT_SCHEMA = {
    "type": "object",
    "properties": {
        "event_cause": {"type": "string"},
        "requires_road_closure": {"type": "boolean"},
        "veh_type": {"type": "string"},
        "priority": {"type": "string", "enum": ["High", "Low"]},
        "description": {"type": "string"},
        "duration_hours": {"type": "number", "nullable": True},
    },
}

EVENT_PROMPT = (
    "Convert a traffic police officer's free-text post-event note into a structured incident record "
    "that matches an existing traffic-events dataset. Use the hints; override only if the note clearly "
    "contradicts them.\n"
    "- event_cause: best-fit canonical cause, one of: vehicle_breakdown, accident, congestion, "
    "procession, vip_movement, public_event, protest, tree_fall, pot_holes, road_conditions, "
    "construction, water_logging, debris, fog_low_visibility, others. Default to the hint.\n"
    "- requires_road_closure: true if the road was fully or partially closed/blocked, else false.\n"
    "- veh_type: vehicle involved if any (truck, bmtc_bus, lcv, private_car, two_wheeler, tanker, "
    "bus, auto, others), else unknown.\n"
    "- priority: High or Low.\n"
    "- description: one short neutral sentence describing the incident.\n"
    "- duration_hours: clearance time in hours if the note states one, else null.\n\n"
    "Hints: cause={cause}, junction={junction}.\nNote: {notes}"
)


def structure_event(notes: str | None, cause: str | None = None, junction: str | None = None) -> dict:
    if not configured() or not notes or not notes.strip():
        return {}
    body = {
        "contents": [{"parts": [{"text": EVENT_PROMPT.format(cause=cause or "unknown", junction=junction or "unknown", notes=notes.strip())}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": EVENT_SCHEMA},
    }
    try:
        resp = httpx.post(URL, params={"key": os.getenv("GEMINI_API_KEY")}, json=body, timeout=15)
        resp.raise_for_status()
        parsed = json.loads(resp.json()["candidates"][0]["content"]["parts"][0]["text"])
    except Exception:
        return {}

    out: dict = {}
    ec = parsed.get("event_cause")
    if isinstance(ec, str) and ec.strip():
        out["event_cause"] = ec.strip().lower().replace(" ", "_")
    rc = parsed.get("requires_road_closure")
    if isinstance(rc, bool):
        out["requires_road_closure"] = rc
    vt = parsed.get("veh_type")
    if isinstance(vt, str) and vt.strip():
        out["veh_type"] = vt.strip().lower().replace(" ", "_")
    pr = parsed.get("priority")
    if pr in ("High", "Low"):
        out["priority"] = pr
    desc = parsed.get("description")
    if isinstance(desc, str) and desc.strip():
        out["description"] = desc.strip()
    hrs = parsed.get("duration_hours")
    if isinstance(hrs, (int, float)) and 0 < hrs <= 168:
        out["duration_hours"] = float(hrs)
    return out
