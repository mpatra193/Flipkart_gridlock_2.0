from __future__ import annotations

import json
import re
import time
from pathlib import Path

import httpx

from geocode_hospitals import BOUNDS, HOSPITALS, REGION_CENTROID, fallback, in_bounds

OUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "hospitalsData.ts"
UA = {"User-Agent": "astra-traffic-demo/1.0 (hospital geocode pass2)"}

LINE = re.compile(r'\{\s*name:\s*(".*?"),\s*region:\s*".*?",\s*lat:\s*([\d.]+),\s*lon:\s*([\d.]+)\s*\}')


def load_existing():
    text = OUT.read_text(encoding="utf-8")
    out = {}
    for m in LINE.finditer(text):
        name = json.loads(m.group(1))
        out[name] = (float(m.group(2)), float(m.group(3)))
    return out


def is_region_anchored(name, region, lat, lon):
    flat, flon = fallback(name, region)
    return abs(flat - lat) < 1e-4 and abs(flon - lon) < 1e-4


def simplify(name):
    n = re.sub(r",.*$", "", name)
    n = re.sub(r"\b(Multi ?Speciality|Super ?Speciality|Superspeciality|Speciality|and Research Centre|& Research Centre|Diagnostic Centre|& Diagnostics)\b", "", n, flags=re.I)
    return re.sub(r"\s+", " ", n).strip()


def near_region(lat, lon, region, max_km=14.0):
    clat, clon = REGION_CENTROID[region]
    dx = (lon - clon) * 111 * 0.97
    dy = (lat - clat) * 111
    return (dx * dx + dy * dy) ** 0.5 <= max_km


def photon(query, region):
    clat, clon = REGION_CENTROID[region]
    try:
        r = httpx.get(
            "https://photon.komoot.io/api/",
            params={"q": query, "lat": clat, "lon": clon, "limit": 5, "lang": "en"},
            headers=UA, timeout=20,
        )
        for f in r.json().get("features", []):
            c = (f.get("geometry") or {}).get("coordinates")
            if not c:
                continue
            lon, lat = float(c[0]), float(c[1])
            if in_bounds(lat, lon) and near_region(lat, lon, region):
                return round(lat, 5), round(lon, 5)
    except Exception:
        pass
    return None


def nominatim(query, region):
    try:
        r = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 3, "countrycodes": "in"},
            headers=UA, timeout=20,
        )
        for j in r.json():
            lat, lon = float(j["lat"]), float(j["lon"])
            if in_bounds(lat, lon) and near_region(lat, lon, region):
                return round(lat, 5), round(lon, 5)
    except Exception:
        pass
    return None


def relocate(name, region):
    queries = [f"{name}, Bengaluru", name]
    s = simplify(name)
    if s and s.lower() != name.lower():
        queries.append(f"{s}, Bengaluru")
    for q in queries:
        res = photon(q, region)
        time.sleep(1.1)
        if res:
            return res
    for q in queries[:2]:
        res = nominatim(q, region)
        time.sleep(1.1)
        if res:
            return res
    return None


def main():
    existing = load_existing()
    rows = []
    improved = 0
    anchored = 0
    for region, names in HOSPITALS.items():
        for name in names:
            lat, lon = existing.get(name, fallback(name, region))
            if is_region_anchored(name, region, lat, lon):
                res = relocate(name, region)
                if res:
                    lat, lon = res
                    improved += 1
                    tag = "FIXED "
                else:
                    anchored += 1
                    tag = "anchor"
            else:
                tag = "keep  "
            rows.append({"name": name, "region": region, "lat": lat, "lon": lon})
            print(f"[{len(rows):3d}/179] {tag} {lat:.4f},{lon:.4f}  {name[:44]}", flush=True)

    body = ",\n".join(
        f'  {{ name: {json.dumps(r["name"])}, region: {json.dumps(r["region"])}, lat: {r["lat"]}, lon: {r["lon"]} }}'
        for r in rows
    )
    ts = (
        "export type HospitalGeo = { name: string; region: string; lat: number; lon: number };\n\n"
        f"export const HOSPITALS: HospitalGeo[] = [\n{body},\n];\n"
    )
    OUT.write_text(ts, encoding="utf-8")
    real_total = sum(1 for r in rows if not is_region_anchored(r["name"], r["region"], r["lat"], r["lon"]))
    print(f"\nPass 2 done: +{improved} newly fixed, {anchored} still region-anchored. Exact total now ~{real_total}/179.")


if __name__ == "__main__":
    main()
