from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import httpx

OUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "hospitalsData.ts"

REGION_CENTROID = {
    "Central": (12.972, 77.594),
    "North": (13.04, 77.59),
    "South": (12.918, 77.585),
    "East": (12.975, 77.70),
    "West": (12.975, 77.52),
    "South-East": (12.93, 77.625),
}

BOUNDS = (12.70, 13.20, 77.35, 77.80)

HOSPITALS = {
    "Central": [
        "JP Prasad Nursing Home", "Nethrakashi Eye Hospital & Micro Surgical Centre",
        "Vydehi Superspeciality Hospital", "Lady Willington State TB Centre", "Mamta Hospital",
        "Children Surgical Centre", "Dr Rudrappa ENT & EYE Care", "The Bangalore Kidney Stone Hospital",
        "Dr NR Shetty Dental and Medical Center", "DR Rudrappas Hospital", "P D Hinduja Block 1 Hcw",
        "Punarjyoti Eye Hospital", "PD Hinduja Sindhi Hospital", "Sahaya Holistic Integrative Hospital",
        "Shri Sharada Hospital", "St Martha's Heart Centre, Sampangi Rama Nagar", "Olympus Cancer",
        "Furtde Hospital", "Gleneagles Global Hospitals, Richmond Road Bengaluru", "Health Heaven Hospiria",
        "Republic Hospital", "HCG Cancer Centre, KR Road Bengaluru", "KMK Varma Clinic & Hospital",
        "Bangalore Institute of Oncology", "NU Hospitals", "Spandana Heart and Super Speciality Hospital",
        "Mamta Nursing Home", "Modern Eye Hospital", "HCG Cancer Centre, Double Road Bengaluru", "Phoenix Hospital",
    ],
    "North": [
        "Sri Sai Krupa Hospital", "Mind & Brain Hospital", "Urban Primary Health Centre Kodigehalli",
        "Gonj Hospital", "Nephroworld Dialysis Center & Medstar Speciality Hospital", "Sri Sai Nothside Hospital",
        "Sub Health Centre Sanjeevini Nagar", "Primary Health Centre Kodigehalli",
        "Nephroworld Dialysis Center Medstar Hospital", "Nayana Nethralaya and Diagnostics Super Speciality Eye Hospital",
        "Pet Connect Speciality Hospital", "Medstar Speciality Hospital", "Mannat Fertility Centre",
        "Manas Multispeciality Hospital", "Akshaya Rhinodent Hospital", "Manas Child Care Medical Centre",
        "Tulsi Hospital", "Cloudnine Hospital, Sahakar Nagar", "Urban Primary Health Centre Sahakarnagar",
        "Athma Sanjeevini", "Northside Hospital & Diagnostic Centre", "Arulprakasam Herbals",
        "Sub Health Centre Bytarayanapura", "Aster CMI Hospital", "Apollo AyurVAID Hospital, Hebbal", "Motherhod",
        "Motherhood Women & Children's Hospital, Hebbal", "IPSC Hospital", "The Image Hospital", "Ayurvedic Hospital",
    ],
    "South": [
        "Shanthi Hospital & Research Centre", "Adhventha Hospital", "JJR Nagar Referral Hospital",
        "Rajalakshmi Multi Speciality Hospital", "SB Multispeciality Ayurveda Hospital", "Madhumeha Hospital",
        "Prema Nursing Home", "Vaayu Chest & Sleep Specialist", "Pulse Diagnostics & Specialist Care Center",
        "Parency IVF Hospital", "Sahasra Hospitals", "Jayanagar Heart Centre", "Sri Krishna Seva Sharma Hospital",
        "Apollo Cradle Hospitals, Bengaluru Jayanagar", "Lady Hospital", "Nethradhama Super Speciality Eye Hospital",
        "Excelcare Hospital", "Rama Krishna Nursing Home", "1 Dental Hospital", "Tara Health Care, Jayanagar",
        "Shanthi Nursing Home", "Sathish Hospital", "Deepak Hospital", "Milann Fertility Centre", "Sri Sairam Hospital",
        "Hi Tech Kidney Stone Hospital", "Multi Speciality Indiara Nursing Home", "Sridevi Hospital",
        "Ayurveda Prathishthana Hospital", "RV Dental College Hospital",
    ],
    "East": [
        "BEML Hospital", "Astr Hospital", "Medray Hospitals", "Vaidyaratnam Oushadhasala Ayurvedic Medicines",
        "Dr Ranganath Jingade Dental Hospital", "Janani Hospital", "Johns Medical Hospital", "HAL Hospital",
        "Urban Primary Health Center", "Venus Hospital", "Sanjay Gandhi Accident Hospital & Research Institute",
        "Sukanya Prakash Gurulu Charitable Hospital and Dialysis Centre", "Primary Health Centre Bhimanagar",
        "Sub Centre Gopalpura", "Shree Anugraha Hospital", "Dr Chaitanyas Hospital",
        "Government of India Department of Space Isro Health Centre", "VIMS Speciality Hospitals", "Magdum Hospital",
        "Srinivasa Nursing Home & Maternity Centre", "Vaidyaratnam", "Carewell Orthopaedic Hospital",
        "Comfort Multi Speciality Hospital", "Abhayahasta Multi Speciality Hospital", "Nethradhama Superspeciality Eye Hospital",
        "Sri Lakshmi Super Speciality Hospital", "Hospital", "Shakti Krupa Nursing Home", "MIAS MH Surgery Clinic",
        "Cloudnine Hospital, Old Airport Road",
    ],
    "West": [
        "Sarvodaya Nursing Home", "Jeevani Health and Medicare", "Primary Health Centre Kalarani",
        "RR Multi Speciality Hospital", "Siri Hospital", "Government Hospital Health Centre",
        "BBMP Primary Health Care Centre", "Shivakrupa Eye Hospital", "Hosahalli Referral Hospital",
        "Government Homeopathic Medical Hospital", "Shinee", "Vijaya Eye Hospital", "Dr Agarwal's Eye Hospital",
        "Cutis Hospital", "Dr BS Satyaprakash Super Speciality Gastroenterology Hospital", "Horizon Hospital",
        "CGHS Wellness Center", "Kangaroo Care Women & Children Hospital", "Gayatri Hospital", "BBMP Hospital",
        "Sadguna Hospital", "Janisthaa Fertility Center and Hospital", "Anugraha Hospital", "Andic Hospital",
        "Shanbhag Nursing Home", "Govindarajnagar Referral Hospital", "Punya Hospital", "Kamadhenu Hospital",
        "Padmavathi Hospital",
    ],
    "South-East": [
        "St Johns Medical College Hospital", "St Johns National Academy of Health Sciences",
        "Seth Baldeodas Shah Charitable Hospital", "Apollo Spectra Hospitals, Koramangala", "Nova Speciality Hospitals",
        "Vaatsalya Healthcare Solution", "Sri Venkateshwara Hospital", "Sri Lashmi Global Hospital",
        "HCG Curie Centre of Oncology, Koramangala Bengaluru", "Sumanth Nursing Home", "Acura Speciality Hospital",
        "Vara Lakshmi Hospital", "Varalakshmi Multispeciality Hospital", "Urban Primary Health Center Koramangala",
        "Kaveri Speciality Hospital", "Hospital Horamavu", "Apollo Cradle & Children Hospital, Koramangala",
        "Aparna Hospital", "Superhealth Hospitals", "Dr Agarwals Eye Hospital, Koramangala", "Kamakshi Hospital",
        "BBMP Government Hospital Dialysis Center", "Gunasheela Surgical & Maternity Hospital",
        "Ayur Healing Ayurveda and Siddha Hospital", "Nishat Multi Speciality Dental Hospital", "SMS Nursing Home",
        "Kerala Ayurveda Multispeciality Hospital", "KSAC Hospital", "Beams Hospital", "Spurthy Hospital",
    ],
}

UA = {"User-Agent": "astra-traffic-demo/1.0 (hospital geocode, contact dev)"}


def in_bounds(lat, lon):
    return BOUNDS[0] <= lat <= BOUNDS[1] and BOUNDS[2] <= lon <= BOUNDS[3]


def fallback(name, region):
    clat, clng = REGION_CENTROID[region]
    h = int(hashlib.md5(name.encode()).hexdigest(), 16)
    dy = ((h % 1000) / 1000 - 0.5) * 0.034
    dx = (((h // 1000) % 1000) / 1000 - 0.5) * 0.034
    return round(clat + dy, 5), round(clng + dx, 5)


def geocode(name):
    for q in (f"{name}, Bengaluru, Karnataka, India", f"{name}, Bangalore"):
        try:
            r = httpx.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": q, "format": "json", "limit": 1, "countrycodes": "in"},
                headers=UA, timeout=20,
            )
            j = r.json()
            if j:
                lat, lon = float(j[0]["lat"]), float(j[0]["lon"])
                if in_bounds(lat, lon):
                    return round(lat, 5), round(lon, 5), True
        except Exception:
            pass
        time.sleep(1.1)
    return None


def main():
    rows = []
    n_osm = 0
    for region, names in HOSPITALS.items():
        for name in names:
            res = geocode(name)
            if res:
                lat, lon, _ = res
                src = "osm"
                n_osm += 1
            else:
                lat, lon = fallback(name, region)
                src = "region"
            rows.append({"name": name, "region": region, "lat": lat, "lon": lon, "src": src})
            print(f"[{len(rows):3d}/179] {src:6s} {lat:.4f},{lon:.4f}  {name[:45]}", flush=True)
            time.sleep(1.1)

    body = ",\n".join(
        f'  {{ name: {json.dumps(r["name"])}, region: {json.dumps(r["region"])}, lat: {r["lat"]}, lon: {r["lon"]} }}'
        for r in rows
    )
    ts = (
        "export type HospitalGeo = { name: string; region: string; lat: number; lon: number };\n\n"
        f"export const HOSPITALS: HospitalGeo[] = [\n{body},\n];\n"
    )
    OUT.write_text(ts, encoding="utf-8")
    print(f"\nWrote {len(rows)} hospitals to {OUT} ({n_osm} geocoded, {len(rows) - n_osm} region-anchored)")


if __name__ == "__main__":
    main()
