import { useEffect, useRef, useState } from "react";
import { mapplsStatus } from "../api";
import { loadSdk, waitFor } from "../mapsdk";
import type { Prediction } from "../types";

const SEVERITY: Record<string, number> = { Low: 0.6, Medium: 1.0, High: 1.5 };
const CAPACITY: Record<string, number> = { High: 0.75, Normal: 1.0, Low: 1.4 };
const WEATHER: Record<string, number> = { Clear: 1.0, Rain: 1.25, Heavy: 1.6 };
const TIMEOFDAY: Record<string, number> = { "Off-peak": 0.8, Peak: 1.3 };
const VOLUME: Record<string, number> = { Low: 0.8, Normal: 1.0, High: 1.35 };
const LANES: Record<string, number> = { "1 lane": 0.85, "2 lanes": 1.1, "3+ lanes": 1.35 };
const DAY: Record<string, number> = { Weekday: 1.1, Weekend: 0.85 };
const RESPONSE: Record<string, number> = { Fast: 0.8, Normal: 1.0, Slow: 1.3 };

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

function ScenarioMap({ prediction, load, impactKm }: { prediction: Prediction; load: number; impactKm: number }) {
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
        const map = new M.Map("astra-whatif-map", { center: { lat: 12.95, lng: 77.6 }, zoom: 12, zoomControl: false });
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
    if (!ready || !prediction) return;
    const map = mapRef.current;
    map.setCenter?.({ lat: prediction.event.latitude, lng: prediction.event.longitude });
    map.setZoom?.(12.5);
    setTimeout(() => map.resize?.(), 150);
  }, [ready, prediction]);

  useEffect(() => {
    const map = mapRef.current;
    const M = (window as any).mappls;
    if (!ready || !map || !M || !prediction) return;

    if (ringRef.current) clearOne(ringRef.current);
    try {
      ringRef.current = new M.Circle({
        map,
        center: { lat: prediction.event.latitude, lng: prediction.event.longitude },
        radius: impactKm * 1000,
        fillColor: "#ef4444",
        fillOpacity: 0.08,
        strokeColor: "#ef4444",
        strokeWeight: 1,
      });
    } catch {
      /* ignore */
    }

    for (const a of prediction.affected_junctions.slice(0, 40)) {
      const intensity = Math.min(1, (a.congestion ?? 0.5) * load);
      const color = intensityColor(intensity);
      const cur = circles.current.get(a.junction);
      if (cur && cur.color === color) continue;
      if (cur) clearOne(cur.c);
      try {
        const c = new M.Circle({
          map,
          center: { lat: a.lat, lng: a.lon },
          radius: color === "#ef4444" ? 150 : color === "#f97316" ? 130 : 115,
          fillColor: color,
          fillOpacity: 0.85,
          strokeColor: "#ffffff",
          strokeWeight: 1,
        });
        circles.current.set(a.junction, { c, color });
      } catch {
        /* ignore */
      }
    }
  }, [load, impactKm, ready, prediction]);

  return <div id="astra-whatif-map" className="absolute inset-0" style={{ width: "100%", height: "100%" }} />;
}

function Schematic({ prediction, load, impactKm }: { prediction: Prediction; load: number; impactKm: number }) {
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const ringPx = 150;
  const cLat = prediction.event.latitude;
  const cLon = prediction.event.longitude;
  const cosLat = Math.cos((cLat * Math.PI) / 180);
  const aff = prediction.affected_junctions.slice(0, 40);
  let maxKm = 0.6;
  for (const a of aff) {
    const dx = (a.lon - cLon) * 111 * cosLat;
    const dy = (a.lat - cLat) * 111;
    maxKm = Math.max(maxKm, Math.hypot(dx, dy));
  }
  const kmToPx = ringPx / maxKm;
  const project = (lat: number, lon: number): [number, number] => {
    const dx = (lon - cLon) * 111 * cosLat;
    const dy = (lat - cLat) * 111;
    return [cx + dx * kmToPx, cy - dy * kmToPx];
  };
  const impactRingPx = Math.min(ringPx, (impactKm / Math.max(maxKm, impactKm)) * ringPx);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
      <rect width={size} height={size} fill="#0b1220" />
      <circle cx={cx} cy={cy} r={impactRingPx} fill="#ef4444" fillOpacity={0.06} stroke="#ef4444" strokeOpacity={0.4} strokeDasharray="4 4" />
      {aff.map((a) => {
        const intensity = Math.min(1, (a.congestion ?? 0.5) * load);
        const [x, y] = project(a.lat, a.lon);
        const color = intensityColor(intensity);
        return <circle key={a.junction} cx={x} cy={y} r={color === "#ef4444" ? 6 : color === "#f97316" ? 5 : 4} fill={color} opacity={0.9} />;
      })}
      <circle cx={cx} cy={cy} r={7} fill="#ffffff" stroke="#ef4444" strokeWidth={2} />
    </svg>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-subtle)" }}>
      <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-0.5">{label}</div>
      <div className="text-base font-bold t-text">{value}</div>
    </div>
  );
}

export default function WhatIfView({ prediction }: { prediction: Prediction | null }) {
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
  const projImpact = Math.round(Math.min(15, prediction.impact_radius_km * combined) * 10) / 10;
  const projCong = Math.min(100, Math.round(prediction.esi * combined));
  const projDur = Math.round(baseDur * combined * 10) / 10;
  const projVeh = Math.round((prediction.affected_junctions.length * 180 + prediction.impact_radius_km * 700) * combined);
  const projSevere = prediction.affected_junctions.filter((a) => Math.min(1, (a.congestion ?? 0) * combined) >= 0.6).length;

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
            <ScenarioMap prediction={prediction} load={combined} impactKm={projImpact} />
          ) : (
            <Schematic prediction={prediction} load={combined} impactKm={projImpact} />
          )}
          <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded z-10" style={{ background: "rgba(0,0,0,0.55)", color: "#e2e8f0" }}>
            scenario load ×{combined.toFixed(2)}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2 mt-3">
          <Metric label="Congestion" value={`${projCong}`} />
          <Metric label="Impact" value={`${projImpact} km`} />
          <Metric label="Duration" value={`${projDur} h`} />
          <Metric label="Vehicles" value={projVeh.toLocaleString()} />
          <Metric label="Severe junc." value={`${projSevere}`} />
        </div>
      </div>
    </div>
  );
}
