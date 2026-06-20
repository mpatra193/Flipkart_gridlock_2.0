from __future__ import annotations

import json
import re
import time
from pathlib import Path

import httpx

from geocode_hospitals import BOUNDS, REGION_CENTROID, fallback, in_bounds

OUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "hospitalsData.ts"
UA = {"User-Agent": "astra-traffic-demo/1.0 (hospital geocode pass3)"}
LINE = re.compile(r'\{\s*name:\s*(".*?"),\s*region:\s*"(.*?)",\s*lat:\s*([\d.]+),\s*lon:\s*([\d.]+)\s*\}')

REGION_AREA = {
    "Central": "Shivajinagar Bengaluru",
    "North": "Hebbal Bengaluru",
    "South": "Jayanagar Bengaluru",
    "East": "KR Puram Bengaluru",
    "West": "Rajajinagar Bengaluru",
    "South-East": "Koramangala Bengaluru",
}

ALIASES = {
    "Government of India Department of Space Isro Health Centre": "ISRO Health Centre Bengaluru",
    "Vaidyaratnam Oushadhasala Ayurvedic Medicines": "Vaidyaratnam Ayurveda Bengaluru",
    "Kangaroo Care Women & Children Hospital": "Kangaroo Care Hospital Bengaluru",
    "HCG Curie Centre of Oncology, Koramangala Bengaluru": "HCG Hospital Koramangala Bengaluru",
    "Nephroworld Dialysis Center & Medstar Speciality Hospital": "Medstar Hospital Bengaluru",
    "Nephroworld Dialysis Center Medstar Hospital": "Medstar Speciality Hospital Bengaluru",
    "Nayana Nethralaya and Diagnostics Super Speciality Eye Hospital": "Nayana Nethralaya Bengaluru",
    "Vaatsalya Healthcare Solution": "Vaatsalya Hospital Bengaluru",
    "Dr BS Satyaprakash Super Speciality Gastroenterology Hospital": "Satyaprakash Hospital Bengaluru",
    "Seth Baldeodas Shah Charitable Hospital": "Seth Baldeodas Shah Hospital Bengaluru",
    "Pulse Diagnostics & Specialist Care Center": "Pulse Hospital Bengaluru",
    "Manas Child Care Medical Centre": "Manas Hospital Bengaluru",
    "Sukanya Prakash Gurulu Charitable Hospital and Dialysis Centre": "Sukanya Prakash Hospital Bengaluru",
    "Kangaroo Care Women & Children Hospital ": "Kangaroo Care Hospital Bengaluru",
    "Dr NR Shetty Dental and Medical Center": "Dr NR Shetty Hospital Bengaluru",
    "BBMP Government Hospital Dialysis Center": "BBMP Hospital Koramangala Bengaluru",
    "Lady Willington State TB Centre": "Lady Willingdon TB Hospital Bengaluru",
    "Vaayu Chest & Sleep Specialist": "Vaayu Chest Clinic Jayanagar Bengaluru",
    "Sri Krishna Seva Sharma Hospital": "Sri Krishna Sharma Hospital Bengaluru",
    "Jeevani Health and Medicare": "Jeevani Hospital Bengaluru",
}

STRIP = re.compile(
    r"\b(Oushadhasala|Ayurvedic Medicines|Super ?Speciality|Multi ?Speciality|Speciality|"
    r"Dialysis Cent(?:er|re)|Diagnostics?|Specialist Care Cent(?:er|re)|Charitable|"
    r"Holistic Integrative|Integrative|Women (?:&|and) Children|Health and Medicare|"
    r"Healthcare Solution|Medical Cent(?:er|re)|Health Cent(?:er|re)|Surgery Clinic|"
    r"and Dialysis Cent(?:re|er)|Department of Space|Government of India)\b",
    re.I,
)


def core(name: str) -> str:
    n = re.sub(r",.*$", "", name)
    n = STRIP.sub("", n)
    n = re.sub(r"\s*&\s*", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def near_region(lat, lon, region, max_km=18.0):
    clat, clon = REGION_CENTROID[region]
    dx = (lon - clon) * 111 * 0.97
    dy = (lat - clat) * 111
    return (dx * dx + dy * dy) ** 0.5 <= max_km


def photon(query, region):
    clat, clon = REGION_CENTROID[region]
    try:
        r = httpx.get("https://photon.komoot.io/api/", params={"q": query, "lat": clat, "lon": clon, "limit": 5, "lang": "en"}, headers=UA, timeout=20)
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
        r = httpx.get("https://nominatim.openstreetmap.org/search", params={"q": query, "format": "json", "limit": 5, "countrycodes": "in"}, headers=UA, timeout=20)
        for j in r.json():
            lat, lon = float(j["lat"]), float(j["lon"])
            if in_bounds(lat, lon) and near_region(lat, lon, region):
                return round(lat, 5), round(lon, 5)
    except Exception:
        pass
    return None


def relocate(name, region):
    area = REGION_AREA[region]
    c = core(name)
    queries = []
    if name in ALIASES:
        queries.append(ALIASES[name])
    queries += [f"{c}, {area}", f"{c} Hospital, {area}", f"{c}, Bengaluru", f"{name}, {area}"]
    seen = set()
    for q in queries:
        if q in seen:
            continue
        seen.add(q)
        for fn in (photon, nominatim):
            res = fn(q, region)
            time.sleep(1.1)
            if res:
                return res, q
    return None, None


def main():
    text = OUT.read_text(encoding="utf-8")
    rows = []
    fixed = 0
    still = 0
    for m in LINE.finditer(text):
        name = json.loads(m.group(1))
        region = m.group(2)
        lat, lon = float(m.group(3)), float(m.group(4))
        fl = fallback(name, region)
        anchored = abs(fl[0] - lat) < 1e-4 and abs(fl[1] - lon) < 1e-4
        if anchored:
            res, q = relocate(name, region)
            if res:
                lat, lon = res
                fixed += 1
                print(f"FIXED  {lat:.4f},{lon:.4f}  {name[:42]:42s} <= {q}", flush=True)
            else:
                still += 1
                print(f"anchor {lat:.4f},{lon:.4f}  {name[:42]}", flush=True)
        rows.append({"name": name, "region": region, "lat": lat, "lon": lon})

    body = ",\n".join(
        f'  {{ name: {json.dumps(r["name"])}, region: {json.dumps(r["region"])}, lat: {r["lat"]}, lon: {r["lon"]} }}'
        for r in rows
    )
    ts = (
        "export type HospitalGeo = { name: string; region: string; lat: number; lon: number };\n\n"
        f"export const HOSPITALS: HospitalGeo[] = [\n{body},\n];\n"
    )
    OUT.write_text(ts, encoding="utf-8")
    real = sum(1 for r in rows if not (abs(fallback(r["name"], r["region"])[0] - r["lat"]) < 1e-4 and abs(fallback(r["name"], r["region"])[1] - r["lon"]) < 1e-4))
    print(f"\nPass 3 done: +{fixed} fixed, {still} still region-anchored. Exact total now ~{real}/179.")


if __name__ == "__main__":
    main()
