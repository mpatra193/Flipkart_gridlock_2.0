import { useEffect, useRef, useState } from "react";
import { mapplsStatus } from "../api";
import { loadSdk, waitFor } from "../mapsdk";
import type { Junction, Prediction } from "../types";

const SEVERITY: Record<string, number> = { Low: 0.6, Medium: 1.0, High: 1.5 };
const CAPACITY: Record<string, number> = { High: 0.75, Normal: 1.0, Low: 1.4 };
const WEATHER: Record<string, number> = { Clear: 1.0, Rain: 1.25, Heavy: 1.6 };
const TIMEOFDAY: Record<string, number> = { "Off-peak": 0.8, Peak: 1.3 };
const VOLUME: Record<string, number> = { Low: 0.8, Normal: 1.0, High: 1.35 };
const LANES: Record<string, number> = { "1 lane": 0.85, "2 lanes": 1.1, "3+ lanes": 1.35 };
const DAY: Record<string, number> = { Weekday: 1.1, Weekend: 0.85 };
const RESPONSE: Record<string, number> = { Fast: 0.8, Normal: 1.0, Slow: 1.3 };

type Pt = { junction: string; lat: number; lon: number; intensity: number };

function Seg({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">{label}</div>
      <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-subtle)" }}>
        {options.map((o) => {
          const active = o === value;
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all ${active ? "t-accent" : "t-text-muted"}`}
              style={active ? { background: "var(--accent-glow)" } : undefined}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function intensityColor(v: number) {
  if (v >= 0.6) return "#ef4444";
  if (v >= 0.3) return "#f97316";
  return "#eab308";
}

function ScenarioMap({ cLat, cLon, points, impactKm }: { cLat: number; cLon: number; points: Pt[]; impactKm: number }) {
  const mapRef = useRef<any>(null);
  const circles = useRef<Map<string, { c: any; color: string }>>(new Map());
  const ringRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const clearOne = (o: any) => {
    try {
      o?.remove ? o.remove() : mapRef.current?.removeLayer?.(o);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadSdk()
      .then(() => waitFor(() => !!((window as any).mappls?.Map) && !!document.getElementById("astra-whatif-map")))
      .then(() => {
        if (cancelled || mapRef.current) return;
        const M = (window as any).mappls;
        const map = new M.Map("astra-whatif-map", { center: { lat: cLat, lng: cLon }, zoom: 12, zoomControl: false });
        mapRef.current = map;
        const r = () => {
          if (!cancelled) {
            setReady(true);
            setTimeout(() => map.resize?.(), 120);
          }
        };
        if (typeof map.on === "function") map.on("load", r);
        else r();
        setTimeout(r, 1500);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const M = (window as any).mappls;
    if (!ready || !map || !M) return;
    map.setCenter?.({ lat: cLat, lng: cLon });
    setTimeout(() => map.resize?.(), 150);

    if (ringRef.current) clearOne(ringRef.current);
    try {
      ringRef.current = new M.Circle({ map, center: { lat: cLat, lng: cLon }, radius: impactKm * 1000, fillColor: "#ef4444", fillOpacity: 0.07, strokeColor: "#ef4444", strokeWeight: 1 });
    } catch {
      /* ignore */
    }

    const present = new Set(points.map((p) => p.junction));
    for (const [j, v] of circles.current) {
      if (!present.has(j)) {
        clearOne(v.c);
        circles.current.delete(j);
      }
    }
    for (const p of points) {
      const color = intensityColor(p.intensity);
      const ex = circles.current.get(p.junction);
      if (ex && ex.color === color) continue;
      if (ex) clearOne(ex.c);
      try {
        const c = new M.Circle({ map, center: { lat: p.lat, lng: p.lon }, radius: color === "#ef4444" ? 150 : color === "#f97316" ? 130 : 115, fillColor: color, fillOpacity: 0.85, strokeColor: "#ffffff", strokeWeight: 1 });
        circles.current.set(p.junction, { c, color });
      } catch {
        /* ignore */
      }
    }
  }, [points, impactKm, cLat, cLon, ready]);

  return <div id="astra-whatif-map" className="absolute inset-0" style={{ width: "100%", height: "100%" }} />;
}

function Schematic({ cLat, cLon, points, impactKm }: { cLat: number; cLon: number; points: Pt[]; impactKm: number }) {
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const ringPx = 150;
  const cosLat = Math.cos((cLat * Math.PI) / 180);
  let maxKm = Math.max(impactKm, 0.6);
  for (const p of points) {
    const dx = (p.lon - cLon) * 111 * cosLat;
    const dy = (p.lat - cLat) * 111;
    maxKm = Math.max(maxKm, Math.hypot(dx, dy));
  }
  const kmToPx = ringPx / maxKm;
  const project = (lat: number, lon: number): [number, number] => {
    const dx = (lon - cLon) * 111 * cosLat;
    const dy = (lat - cLat) * 111;
    return [cx + dx * kmToPx, cy - dy * kmToPx];
  };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
      <rect width={size} height={size} fill="#0b1220" />
      <circle cx={cx} cy={cy} r={(impactKm / maxKm) * ringPx} fill="#ef4444" fillOpacity={0.06} stroke="#ef4444" strokeOpacity={0.4} strokeDasharray="4 4" />
      {points.map((p) => {
        const [x, y] = project(p.lat, p.lon);
        const color = intensityColor(p.intensity);
        return <circle key={p.junction} cx={x} cy={y} r={color === "#ef4444" ? 6 : color === "#f97316" ? 5 : 4} fill={color} opacity={0.9} />;
      })}
      <circle cx={cx} cy={cy} r={7} fill="#ffffff" stroke="#ef4444" strokeWidth={2} />
    </svg>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-subtle)" }}>
      <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-0.5">{label}</div>
      <div className={`text-base font-bold ${accent || "t-text"}`}>{value}</div>
    </div>
  );
}

export default function WhatIfView({ prediction, junctions }: { prediction: Prediction | null; junctions: Junction[] }) {
  const [sev, setSev] = useState("Medium");
  const [cap, setCap] = useState("Normal");
  const [weather, setWeather] = useState("Clear");
  const [tod, setTod] = useState("Peak");
  const [vol, setVol] = useState("Normal");
  const [lanes, setLanes] = useState("2 lanes");
  const [day, setDay] = useState("Weekday");
  const [response, setResponse] = useState("Normal");
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    mapplsStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, []);

  if (!prediction) {
    return (
      <div className="glass h-full flex items-center justify-center t-text-muted text-sm">
        Run a simulation, then switch here to explore what-if scenarios.
      </div>
    );
  }

  const combined =
    SEVERITY[sev] * CAPACITY[cap] * WEATHER[weather] * TIMEOFDAY[tod] * VOLUME[vol] * LANES[lanes] * DAY[day] * RESPONSE[response];
  const baseDur = prediction.planning_duration_hours ?? prediction.duration_hours;
  const cLat = prediction.event.latitude;
  const cLon = prediction.event.longitude;
  const cosLat = Math.cos((cLat * Math.PI) / 180);
  const affectedRadius = Math.max(0.4, prediction.impact_radius_km * combined);

  const within: Pt[] = [];
  for (const j of junctions) {
    if (j.lat == null || j.lon == null) continue;
    const dx = (j.lon - cLon) * 111 * cosLat;
    const dy = (j.lat - cLat) * 111;
    const dist = Math.hypot(dx, dy);
    if (dist <= affectedRadius) {
      within.push({ junction: j.junction, lat: j.lat, lon: j.lon, intensity: Math.max(0.05, 1 - dist / affectedRadius) });
    }
  }
  within.sort((a, b) => b.intensity - a.intensity);
  const points = within.slice(0, 80);
  const affectedCount = within.length;
  const severeCount = within.filter((p) => p.intensity >= 0.6).length;

  const projImpact = Math.round(Math.min(20, affectedRadius) * 10) / 10;
  const projCong = Math.min(100, Math.round(prediction.esi * combined));
  const projDur = Math.round(baseDur * combined * 10) / 10;
  const projVeh = Math.round(affectedCount * 220 + 600);

  return (
    <div className="glass p-5 h-full flex gap-5">
      <div className="w-60 shrink-0 space-y-3 overflow-y-auto custom-scroll pr-1">
        <div>
          <div className="text-sm font-bold t-text">What-if simulator</div>
          <div className="text-[11px] t-text-muted">Adjust conditions, watch the impact change</div>
        </div>
        <Seg label="Incident severity" value={sev} options={["Low", "Medium", "High"]} onChange={setSev} />
        <Seg label="Lanes blocked" value={lanes} options={["1 lane", "2 lanes", "3+ lanes"]} onChange={setLanes} />
        <Seg label="Road capacity" value={cap} options={["Low", "Normal", "High"]} onChange={setCap} />
        <Seg label="Weather" value={weather} options={["Clear", "Rain", "Heavy"]} onChange={setWeather} />
        <Seg label="Time of day" value={tod} options={["Off-peak", "Peak"]} onChange={setTod} />
        <Seg label="Day" value={day} options={["Weekday", "Weekend"]} onChange={setDay} />
        <Seg label="Traffic volume" value={vol} options={["Low", "Normal", "High"]} onChange={setVol} />
        <Seg label="Response time" value={response} options={["Fast", "Normal", "Slow"]} onChange={setResponse} />
        <div className="text-[10px] t-text-muted italic pt-1">Projection scales the live prediction by the chosen conditions.</div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="relative rounded-xl overflow-hidden flex-1" style={{ border: "1px solid var(--border-subtle)", minHeight: 300 }}>
          {configured ? (
            <ScenarioMap cLat={cLat} cLon={cLon} points={points} impactKm={projImpact} />
          ) : (
            <Schematic cLat={cLat} cLon={cLon} points={points} impactKm={projImpact} />
          )}
          <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded z-10" style={{ background: "rgba(0,0,0,0.55)", color: "#e2e8f0" }}>
            scenario load ×{combined.toFixed(2)}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <Metric label="Junctions affected" value={`${affectedCount}`} accent="text-orange-400" />
          <Metric label="Severe junctions" value={`${severeCount}`} accent="text-rose-400" />
          <Metric label="Congestion score" value={`${projCong}`} />
          <Metric label="Impact radius" value={`${projImpact} km`} />
          <Metric label="Duration" value={`${projDur} h`} />
          <Metric label="Vehicles" value={projVeh.toLocaleString()} />
        </div>
      </div>
    </div>
  );
}
