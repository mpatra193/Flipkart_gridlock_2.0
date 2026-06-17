from __future__ import annotations

import os
import time

import httpx

TOKEN_URL = "https://outpost.mappls.com/api/security/oauth/token"
BASE = "https://apis.mappls.com/advancedmaps/v1"

_cache = {"token": None, "expires_at": 0.0}


def configured() -> bool:
    return bool(os.getenv("MAPMYINDIA_CLIENT_ID") and os.getenv("MAPMYINDIA_CLIENT_SECRET"))


def get_token() -> str:
    if _cache["token"] and time.time() < _cache["expires_at"]:
        return _cache["token"]
    if not configured():
        raise RuntimeError("MapMyIndia credentials not configured")

    resp = httpx.post(
        TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": os.getenv("MAPMYINDIA_CLIENT_ID"),
            "client_secret": os.getenv("MAPMYINDIA_CLIENT_SECRET"),
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    _cache["token"] = data["access_token"]
    _cache["expires_at"] = time.time() + (data.get("expires_in", 3600) - 60)
    return _cache["token"]


def _lnglat(latlng: str) -> str:
    parts = [p.strip() for p in latlng.split(",")]
    return f"{parts[1]},{parts[0]}" if len(parts) == 2 else latlng


def directions(source: str, destination: str) -> dict:
    token = get_token()
    url = f"{BASE}/{token}/route_adv/driving/{_lnglat(source)};{_lnglat(destination)}"
    resp = httpx.get(
        url,
        params={"geometries": "polyline", "overview": "full", "steps": "false"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    route = (data.get("routes") or [{}])[0]
    return {
        "distance_km": round(route.get("distance", 0) / 1000, 2) if route.get("distance") else None,
        "duration_min": round(route.get("duration", 0) / 60, 1) if route.get("duration") else None,
        "geometry": route.get("geometry"),
    }


def distance_matrix(sources: list[str], destinations: list[str]) -> dict:
    token = get_token()
    coords = ";".join(_lnglat(c) for c in [*sources, *destinations])
    src_idx = ";".join(str(i) for i in range(len(sources)))
    dst_idx = ";".join(str(i + len(sources)) for i in range(len(destinations)))
    url = f"{BASE}/{token}/distance_matrix/driving/{coords}"
    resp = httpx.get(url, params={"sources": src_idx, "destinations": dst_idx}, timeout=30)
    resp.raise_for_status()
    return resp.json()


def reverse_geocode(lat: float, lng: float) -> dict:
    token = get_token()
    resp = httpx.get(f"{BASE}/{token}/rev_geocode", params={"lat": lat, "lng": lng}, timeout=15)
    resp.raise_for_status()
    return resp.json()
