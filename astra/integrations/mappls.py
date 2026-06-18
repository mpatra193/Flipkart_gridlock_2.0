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


def _in_india(lat, lng):
    return 6.0 <= lat <= 37.0 and 68.0 <= lng <= 98.0


def _decode_polyline(enc, precision=5):
    factor = float(10 ** precision)
    coords, index, lat, lng = [], 0, 0, 0
    length = len(enc)
    while index < length:
        for is_lng in (False, True):
            shift, result = 0, 0
            while True:
                b = ord(enc[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else (result >> 1)
            if is_lng:
                lng += delta
            else:
                lat += delta
        coords.append([lat / factor, lng / factor])
    return coords


def _to_path(geometry):
    if isinstance(geometry, dict):
        return [[c[1], c[0]] for c in geometry.get("coordinates", [])]
    if isinstance(geometry, str) and geometry:
        path = _decode_polyline(geometry, 5)
        if path and not _in_india(path[0][0], path[0][1]):
            path = _decode_polyline(geometry, 6)
        return path
    return []


def directions(source: str, destination: str) -> dict:
    token = get_token()
    url = f"{BASE}/{token}/route_adv/driving/{_lnglat(source)};{_lnglat(destination)}"
    resp = httpx.get(
        url,
        params={"geometries": "geojson", "overview": "full", "steps": "false"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    route = (data.get("routes") or [{}])[0]
    return {
        "distance_km": round(route.get("distance", 0) / 1000, 2) if route.get("distance") else None,
        "duration_min": round(route.get("duration", 0) / 60, 1) if route.get("duration") else None,
        "geometry": route.get("geometry"),
        "path": _to_path(route.get("geometry")),
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
