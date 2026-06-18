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
