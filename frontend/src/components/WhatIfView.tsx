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

type Pt = { junction: string; lat: number; lon: number; intensity: number; eta: number; baseCong: number };

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

function riskBand(v: number) {
  if (v >= 0.6) return "HIGH";
  if (v >= 0.3) return "MEDIUM";
  return "LOW";
}

function ScenarioMap({ cLat, cLon, points, impactKm, phase, selected, onSelect }: { cLat: number; cLon: number; points: Pt[]; impactKm: number; phase: number; selected: string | null; onSelect: (p: Pt) => void }) {
  const mapRef = useRef<any>(null);
  const cores = useRef<Map<string, { c: any; color: string }>>(new Map());
  const halos = useRef<Map<string, { c: any; color: string }>>(new Map());
  const ringRef = useRef<any>(null);
  const selRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const pointsRef = useRef(points);
  const onSelectRef = useRef(onSelect);
  pointsRef.current = points;
  onSelectRef.current = onSelect;

  const clearOne = (o: any) => {
    if (!o) return;
    const M = (window as any).mappls;
    try {
      if (M && typeof M.remove === "function") { M.remove({ map: mapRef.current, layer: o }); return; }
    } catch { /* fall through */ }
    try {
      if (typeof o.remove === "function") { o.remove(); return; }
    } catch { /* fall through */ }
    try { mapRef.current?.removeLayer?.(o); } catch { /* ignore */ }
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
        if (typeof map.on === "function") {
          map.on("click", (e: any) => {
            const ll = e?.lngLat || e?.latlng || e?.latLng;
            if (!ll || typeof ll.lat !== "number") return;
            const cos = Math.cos((ll.lat * Math.PI) / 180);
            let best: Pt | null = null;
            let bestD = Infinity;
            for (const p of pointsRef.current) {
              const dx = (p.lon - ll.lng) * 111 * cos;
              const dy = (p.lat - ll.lat) * 111;
              const d = Math.hypot(dx, dy);
              if (d < bestD) { bestD = d; best = p; }
            }
            if (best && bestD <= 0.45) onSelectRef.current(best);
          });
        }
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
      ringRef.current = new M.Circle({ map, center: { lat: cLat, lng: cLon }, radius: impactKm * 1000 * (0.18 + 0.82 * phase), fillColor: "#ef4444", fillOpacity: 0.06, strokeColor: "#ef4444", strokeOpacity: 0.5, strokeWeight: 1 });
    } catch {
      /* ignore */
    }

    const byEta = [...points].sort((a, b) => a.eta - b.eta);
    const visibleCount = phase >= 1 ? byEta.length : Math.max(1, Math.ceil(byEta.length * phase));
    const visible = byEta.slice(0, visibleCount);
    const present = new Set(visible.map((p) => p.junction));

    for (const [j, v] of cores.current) {
      if (!present.has(j)) { clearOne(v.c); cores.current.delete(j); }
    }
    for (const [j, v] of halos.current) {
      if (!present.has(j)) { clearOne(v.c); halos.current.delete(j); }
    }

    for (const p of visible) {
      const color = intensityColor(p.intensity);
      const r = color === "#ef4444" ? 150 : color === "#f97316" ? 130 : 115;

      const eh = halos.current.get(p.junction);
      if (!eh || eh.color !== color) {
        if (eh) clearOne(eh.c);
        try {
          const c = new M.Circle({ map, center: { lat: p.lat, lng: p.lon }, radius: r * 1.9, fillColor: color, fillOpacity: 0.16, strokeWeight: 0 });
          halos.current.set(p.junction, { c, color });
        } catch { /* ignore */ }
      }
      const ec = cores.current.get(p.junction);
      if (!ec || ec.color !== color) {
        if (ec) clearOne(ec.c);
        try {
          const c = new M.Circle({ map, center: { lat: p.lat, lng: p.lon }, radius: r, fillColor: color, fillOpacity: 0.9, strokeColor: "#ffffff", strokeWeight: 1 });
          cores.current.set(p.junction, { c, color });
        } catch { /* ignore */ }
      }
    }
  }, [points, impactKm, cLat, cLon, ready, phase]);

  useEffect(() => {
    const map = mapRef.current;
    const M = (window as any).mappls;
    if (!ready || !map || !M) return;
    if (selRef.current) { clearOne(selRef.current); selRef.current = null; }
    const p = points.find((x) => x.junction === selected);
    if (!p) return;
    try {
      selRef.current = new M.Circle({ map, center: { lat: p.lat, lng: p.lon }, radius: 230, fillOpacity: 0, strokeColor: "#ffffff", strokeWeight: 3 });
    } catch { /* ignore */ }
  }, [selected, points, ready]);

  return <div id="astra-whatif-map" className="absolute inset-0" style={{ width: "100%", height: "100%" }} />;
}

function Schematic({ cLat, cLon, points, impactKm, phase, selected, onSelect }: { cLat: number; cLon: number; points: Pt[]; impactKm: number; phase: number; selected: string | null; onSelect: (p: Pt) => void }) {
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
  const byEta = [...points].sort((a, b) => a.eta - b.eta);
  const visible = phase >= 1 ? byEta : byEta.slice(0, Math.max(1, Math.ceil(byEta.length * phase)));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
      <rect width={size} height={size} fill="#0b1220" />
      <circle cx={cx} cy={cy} r={(impactKm / maxKm) * ringPx * (0.18 + 0.82 * phase)} fill="#ef4444" fillOpacity={0.06} stroke="#ef4444" strokeOpacity={0.4} strokeDasharray="4 4" />
      {visible.map((p) => {
        const [x, y] = project(p.lat, p.lon);
        const color = intensityColor(p.intensity);
        const rr = color === "#ef4444" ? 6 : color === "#f97316" ? 5 : 4;
        return (
          <g key={p.junction} onClick={() => onSelect(p)} style={{ cursor: "pointer" }}>
            <circle cx={x} cy={y} r={rr * 2} fill={color} opacity={0.18} />
            <circle cx={x} cy={y} r={rr} fill={color} opacity={0.92} />
            {selected === p.junction && <circle cx={x} cy={y} r={rr + 5} fill="none" stroke="#ffffff" strokeWidth={2} />}
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={7} fill="#ffffff" stroke="#ef4444" strokeWidth={2} />
    </svg>
  );
}

function Legend() {
  const rows = [
    { c: "#ef4444", l: "High ≥60%" },
    { c: "#f97316", l: "Medium 30–60%" },
    { c: "#eab308", l: "Low <30%" },
  ];
  return (
    <div className="absolute bottom-2 right-2 z-10 rounded-lg px-2.5 py-2 space-y-1" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
      {rows.map((r) => (
        <div key={r.l} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.c }} />
          <span className="text-[10px] font-medium" style={{ color: "#e2e8f0" }}>{r.l}</span>
        </div>
      ))}
    </div>
  );
}

function DetailCard({ p, onClose }: { p: Pt; onClose: () => void }) {
  const band = riskBand(p.intensity);
  return (
    <div className="absolute top-2 right-2 z-20 rounded-xl w-56 overflow-hidden" style={{ background: "var(--overlay-bg, rgba(15,23,42,0.92))", border: "1px solid var(--border-subtle)", backdropFilter: "blur(8px)", boxShadow: "0 8px 28px rgba(0,0,0,0.3)" }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span className="text-[12px] font-bold t-text truncate pr-2">{p.junction}</span>
        <button onClick={onClose} className="t-text-muted shrink-0">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider t-text-muted">Projected risk</span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded risk-${band}`} style={{ background: "var(--bg-card-inner)" }}>{band}</span>
        </div>
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="t-text-muted">Congestion</span>
            <span className="t-text-2 font-bold">{Math.round(p.intensity * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-card-inner)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.round(p.intensity * 100)}%`, background: intensityColor(p.intensity) }} />
          </div>
          <div className="text-[9px] t-text-muted mt-1">base {Math.round(p.baseCong * 100)}% · scaled by scenario load</div>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="t-text-muted">Spillover ETA</span>
          <span className="t-text-2 font-semibold">{p.eta > 0 ? `${Math.round(p.eta)} min` : "origin"}</span>
        </div>
      </div>
    </div>
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
  const [selected, setSelected] = useState<Pt | null>(null);
  const [phase, setPhase] = useState(1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    mapplsStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    if (!playing) return;
    setPhase(0);
    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / 4000);
      setPhase(t);
      if (t >= 1) { setPlaying(false); clearInterval(id); }
    }, 70);
    return () => clearInterval(id);
  }, [playing]);

  if (!prediction) {
    return (
      <div className="glass h-full flex items-center justify-center t-text-muted text-sm">
        Run a simulation, then switch here to explore what-if scenarios.
      </div>
    );
  }

  const combined =
    SEVERITY[sev] * CAPACITY[cap] * WEATHER[weather] * TIMEOFDAY[tod] * VOLUME[vol] * LANES[lanes] * DAY[day] * RESPONSE[response];
  const BASELINE =
    SEVERITY.Medium * CAPACITY.Normal * WEATHER.Clear * TIMEOFDAY.Peak * VOLUME.Normal * LANES["2 lanes"] * DAY.Weekday * RESPONSE.Normal;
  const load = combined / BASELINE;
  const baseDur = prediction.planning_duration_hours ?? prediction.duration_hours;
  const cLat = prediction.event.latitude;
  const cLon = prediction.event.longitude;

  const scored: Pt[] = prediction.affected_junctions
    .filter((a) => a.lat != null && a.lon != null)
    .map((a) => ({
      junction: a.junction,
      lat: a.lat,
      lon: a.lon,
      intensity: Math.min(1, (a.congestion ?? 0.3) * load),
      eta: a.eta_min ?? 0,
      baseCong: a.congestion ?? 0,
    }));
  const points = scored.filter((p) => p.intensity >= 0.08).sort((a, b) => b.intensity - a.intensity).slice(0, 80);
  const affectedCount = points.length;
  const severeCount = points.filter((p) => p.intensity >= 0.6).length;

  const projImpact = Math.round(Math.min(15, prediction.impact_radius_km * load) * 10) / 10;
  const projCong = Math.min(100, Math.round(prediction.esi * load));
  const projDur = Math.round(baseDur * load * 10) / 10;
  const projVeh = Math.round(affectedCount * 220 + 600);
  const ecoLoss = projVeh * 30 + severeCount * 8000;
  const verdict = projCong >= 80 ? "CRITICAL" : projCong >= 60 ? "HIGH" : projCong >= 40 ? "MEDIUM" : "LOW";
  const rs = (x: number) => (x >= 100000 ? `₹${(x / 100000).toFixed(1)}L` : `₹${Math.max(1, Math.round(x / 1000))}k`);

  const selectedLive = selected ? points.find((p) => p.junction === selected.junction) ?? null : null;

  return (
    <div className="glass p-5 h-full flex gap-5">
      <div className="w-60 shrink-0 space-y-3 overflow-y-auto custom-scroll pr-1">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-bold t-text">What-if simulator</div>
            <div className="text-[11px] t-text-muted">Adjust conditions, watch the impact change</div>
          </div>
          <button
            onClick={() => { setSev("Medium"); setCap("Normal"); setWeather("Clear"); setTod("Peak"); setVol("Normal"); setLanes("2 lanes"); setDay("Weekday"); setResponse("Normal"); }}
            className="text-[10px] t-text-muted underline shrink-0 mt-0.5"
          >
            reset
          </button>
        </div>
        <Seg label="Incident severity" value={sev} options={["Low", "Medium", "High"]} onChange={setSev} />
        <Seg label="Lanes blocked" value={lanes} options={["1 lane", "2 lanes", "3+ lanes"]} onChange={setLanes} />
        <Seg label="Road capacity" value={cap} options={["Low", "Normal", "High"]} onChange={setCap} />
        <Seg label="Weather" value={weather} options={["Clear", "Rain", "Heavy"]} onChange={setWeather} />
        <Seg label="Time of day" value={tod} options={["Off-peak", "Peak"]} onChange={setTod} />
        <Seg label="Day" value={day} options={["Weekday", "Weekend"]} onChange={setDay} />
        <Seg label="Traffic volume" value={vol} options={["Low", "Normal", "High"]} onChange={setVol} />
        <Seg label="Response time" value={response} options={["Fast", "Normal", "Slow"]} onChange={setResponse} />
        <div className="text-[10px] t-text-muted italic pt-1">Projection scales the live prediction by the chosen conditions. Click any junction on the map for its detail.</div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg risk-${verdict}`} style={{ background: "var(--bg-card-inner)" }}>{verdict} gridlock</span>
            <span className="text-[11px] t-text-muted">{affectedCount} junctions · {severeCount} severe</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPlaying(true)}
              className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-semibold t-accent"
              style={{ background: "var(--accent-glow)" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              {playing ? "Spreading…" : "Animate spread"}
            </button>
            <div className="text-[11px] t-text-muted">Est. loss <span className="text-rose-400 font-bold">{rs(ecoLoss)}</span></div>
          </div>
        </div>
        <div className="relative rounded-xl overflow-hidden flex-1" style={{ border: "1px solid var(--border-subtle)", minHeight: 300 }}>
          {configured ? (
            <ScenarioMap cLat={cLat} cLon={cLon} points={points} impactKm={projImpact} phase={phase} selected={selectedLive?.junction ?? null} onSelect={setSelected} />
          ) : (
            <Schematic cLat={cLat} cLon={cLon} points={points} impactKm={projImpact} phase={phase} selected={selectedLive?.junction ?? null} onSelect={setSelected} />
          )}
          <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded z-10" style={{ background: "rgba(0,0,0,0.55)", color: "#e2e8f0" }}>
            scenario load ×{load.toFixed(2)}
          </div>
          <Legend />
          {selectedLive && <DetailCard p={selectedLive} onClose={() => setSelected(null)} />}
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
