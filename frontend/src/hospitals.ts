export type Region = { lat: number; lng: number; hospitals: string[] };

export const HOSPITAL_REGIONS: Record<string, Region> = {
  Central: {
    lat: 12.972,
    lng: 77.594,
    hospitals: [
      "JP Prasad Nursing Home", "Nethrakashi Eye Hospital", "Vydehi Superspeciality Hospital", "Lady Willington TB Centre",
      "Mamta Hospital", "Children Surgical Centre", "Dr Rudrappa ENT & EYE Care", "Bangalore Kidney Stone Hospital",
      "Dr NR Shetty Medical Center", "DR Rudrappas Hospital", "PD Hinduja Block 1", "Punarjyoti Eye Hospital",
      "PD Hinduja Sindhi Hospital", "Sahaya Integrative Hospital", "Shri Sharada Hospital", "St Martha's Heart Centre",
      "Olympus Cancer", "Furtde Hospital", "Gleneagles Global Hospitals", "Health Heaven Hospiria",
      "Republic Hospital", "HCG Cancer Centre KR Road", "KMK Varma Hospital", "Bangalore Institute of Oncology",
      "NU Hospitals", "Spandana Heart Hospital", "Mamta Nursing Home", "Modern Eye Hospital",
      "HCG Cancer Centre Double Road", "Phoenix Hospital",
    ],
  },
  North: {
    lat: 13.04,
    lng: 77.59,
    hospitals: [
      "Sri Sai Krupa Hospital", "Mind & Brain Hospital", "UPHC Kodigehalli", "Gonj Hospital",
      "Nephroworld Medstar Hospital", "Sri Sai Northside Hospital", "SHC Sanjeevini Nagar", "PHC Kodigehalli",
      "Nephroworld Dialysis Center", "Nayana Nethralaya Eye Hospital", "Pet Connect Hospital", "Medstar Speciality Hospital",
      "Mannat Fertility Centre", "Manas Multispeciality Hospital", "Akshaya Rhinodent Hospital", "Manas Child Care Centre",
      "Tulsi Hospital", "Cloudnine Sahakar Nagar", "UPHC Sahakarnagar", "Athma Sanjeevini",
      "Northside Hospital", "Arulprakasam Herbals", "SHC Bytarayanapura", "Aster CMI Hospital",
      "Apollo AyurVAID Hebbal", "Motherhod", "Motherhood Hebbal", "IPSC Hospital", "The Image Hospital", "Ayurvedic Hospital",
    ],
  },
  South: {
    lat: 12.918,
    lng: 77.585,
    hospitals: [
      "Shanthi Hospital & Research Centre", "Adhventha Hospital", "JJR Nagar Referral Hospital", "Rajalakshmi Hospital",
      "SB Ayurveda Hospital", "Madhumeha Hospital", "Prema Nursing Home", "Vaayu Chest & Sleep Specialist",
      "Pulse Specialist Care", "Parency IVF Hospital", "Sahasra Hospitals", "Jayanagar Heart Centre",
      "Sri Krishna Seva Hospital", "Apollo Cradle Jayanagar", "Lady Hospital", "Nethradhama Eye Hospital",
      "Excelcare Hospital", "Rama Krishna Nursing Home", "1 Dental Hospital", "Tara Health Care Jayanagar",
      "Shanthi Nursing Home", "Sathish Hospital", "Deepak Hospital", "Milann Fertility Centre",
      "Sri Sairam Hospital", "Hi Tech Kidney Stone Hospital", "Indiara Nursing Home", "Sridevi Hospital",
      "Ayurveda Prathishthana Hospital", "RV Dental College Hospital",
    ],
  },
  East: {
    lat: 12.975,
    lng: 77.7,
    hospitals: [
      "BEML Hospital", "Astr Hospital", "Medray Hospitals", "Vaidyaratnam Ayurvedic", "Dr Ranganath Dental Hospital",
      "Janani Hospital", "Johns Medical Hospital", "HAL Hospital", "Urban Primary Health Center", "Venus Hospital",
      "Sanjay Gandhi Accident Hospital", "Sukanya Prakash Charitable Hospital", "PHC Bhimanagar", "Sub Centre Gopalpura",
      "Shree Anugraha Hospital", "Dr Chaitanyas Hospital", "ISRO Health Centre", "VIMS Speciality Hospitals",
      "Magdum Hospital", "Srinivasa Nursing Home", "Vaidyaratnam", "Carewell Orthopaedic Hospital",
      "Comfort Multi Speciality Hospital", "Abhayahasta Hospital", "Nethradhama Superspeciality", "Sri Lakshmi Hospital",
      "Hospital", "Shakti Krupa Nursing Home", "MIAS MH Surgery Clinic", "Cloudnine Old Airport Road",
    ],
  },
  West: {
    lat: 12.975,
    lng: 77.52,
    hospitals: [
      "Sarvodaya Nursing Home", "Jeevani Health and Medicare", "PHC Kalarani", "RR Multi Speciality Hospital",
      "Siri Hospital", "Government Health Centre", "BBMP PHC Centre", "Shivakrupa Eye Hospital",
      "Hosahalli Referral Hospital", "Govt Homeopathic Hospital", "Shinee", "Vijaya Eye Hospital",
      "Dr Agarwal's Eye Hospital", "Cutis Hospital", "Dr Satyaprakash Gastro Hospital", "Horizon Hospital",
      "CGHS Wellness Center", "Kangaroo Care Hospital", "Gayatri Hospital", "BBMP Hospital",
      "Sadguna Hospital", "Janisthaa Fertility Hospital", "Anugraha Hospital", "Andic Hospital",
      "Shanbhag Nursing Home", "Govindarajnagar Referral Hospital", "Punya Hospital", "Kamadhenu Hospital", "Padmavathi Hospital",
    ],
  },
  "South-East": {
    lat: 12.93,
    lng: 77.625,
    hospitals: [
      "St Johns Medical College Hospital", "St Johns Academy of Health", "Seth Baldeodas Charitable Hospital",
      "Apollo Spectra Koramangala", "Nova Speciality Hospitals", "Vaatsalya Healthcare", "Sri Venkateshwara Hospital",
      "Sri Lashmi Global Hospital", "HCG Curie Oncology Koramangala", "Sumanth Nursing Home", "Acura Speciality Hospital",
      "Vara Lakshmi Hospital", "Varalakshmi Multispeciality Hospital", "UPHC Koramangala", "Kaveri Speciality Hospital",
      "Hospital Horamavu", "Apollo Cradle Koramangala", "Aparna Hospital", "Superhealth Hospitals",
      "Dr Agarwals Eye Koramangala", "Kamakshi Hospital", "BBMP Dialysis Center", "Gunasheela Maternity Hospital",
      "Ayur Healing Hospital", "Nishat Dental Hospital", "SMS Nursing Home", "Kerala Ayurveda Hospital",
      "KSAC Hospital", "Beams Hospital", "Spurthy Hospital",
    ],
  },
};

export function nearestRegion(lat: number, lng: number): string {
  let best = "Central";
  let bestD = Infinity;
  for (const [name, r] of Object.entries(HOSPITAL_REGIONS)) {
    const d = (r.lat - lat) ** 2 + (r.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

export function pickHospital(region: string, seed: string): string {
  const list = HOSPITAL_REGIONS[region]?.hospitals || [];
  if (!list.length) return "Nearest hospital";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}
