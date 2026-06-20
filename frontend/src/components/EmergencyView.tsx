import { useEffect, useMemo, useRef, useState } from "react";
import { mapplsStatus } from "../api";
import { cachedDirections, type RouteResult } from "../routeCache";
import { loadSdk, waitFor } from "../mapsdk";
import { HOSPITALS } from "../hospitalsData";
import { IconOfficer, IconBarrier, IconCross, OFFICER_ICON_PATH, BARRIER_ICON_PATH, CROSS_ICON_PATH, strokeIconMarkup, fillIconMarkup } from "./icons";
import type { Junction, Prediction } from "../types";

const UNITS = ["Ambulance", "Fire", "Police"];

type LL = { lat: number; lng: number };
type Hospital = { pos: LL; name: string; region: string; dist_km: number; officers: number; barricades: number; general: boolean };
type SignalJ = { junction: string; lat: number; lon: number };
type Incident = { lat: number; lon: number; label: string; esi: number };
type Dispatch = {
  incident: LL;
  label: string;
  hospital: Hospital;
  path: LL[];
  distance_km: number | null;
  signals: SignalJ[];
  officerPoints: SignalJ[];
  normalEta: number | null;
  priorityEta: number | null;
  saved: number | null;
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

const SPECIALIZED_KEYWORDS = [
  "eye", "nethralaya", "nethradhama", "dental", "kidney", "stone", "cancer", "oncolog", "maternity",
  "fertility", "ivf", "ent ", "tb centre", "tb center", "ayurved", "homeopath", "siddha", "chest",
  "sleep", "orthopaed", "dialysis", "nephro", "cutis", "skin", "rhinodent", "gastro", "herbal",
  "mind & brain", "brain hospital", "women & children", "child care", "heart centre", "heart center",
  "cradle", "fert", "neuro", "psychiatr",
];
const GENERAL_KEYWORDS = [
  "multispeciality", "multi speciality", "super speciality", "superspeciality", "general hospital",
  " general ", "medical college", "trauma", "apollo", "aster", "fortis", "manipal", "narayana",
  "sakra", "columbia", "st johns", "st martha", "mallya", "vikram", "bgs", "gleneagles", "vydehi",
];

function isGeneralHospital(name: string) {
  const n = ` ${name.toLowerCase()} `;
  if (GENERAL_KEYWORDS.some((k) => n.includes(k))) return true;
  if (SPECIALIZED_KEYWORDS.some((k) => n.includes(k))) return false;
  return true;
}

const GENERAL_EXTRA_KM = 2.5;

function nearestHospital(lat: number, lng: number) {
  let bestAny = HOSPITALS[0];
  let dAny = Infinity;
  let bestGen: typeof HOSPITALS[number] | null = null;
  let dGen = Infinity;
  for (const h of HOSPITALS) {
    const d = haversineKm(lat, lng, h.lat, h.lon);
    if (d < dAny) { dAny = d; bestAny = h; }
    if (isGeneralHospital(h.name) && d < dGen) { dGen = d; bestGen = h; }
  }
  let chosen = bestAny;
  let chosenD = dAny;
  let general = isGeneralHospital(bestAny.name);
  if (bestGen && dGen - dAny <= GENERAL_EXTRA_KM) {
    chosen = bestGen;
    chosenD = dGen;
    general = true;
  }
  return { name: chosen.name, region: chosen.region, lat: chosen.lat, lon: chosen.lon, dist_km: Math.round(chosenD * 10) / 10, general };
}

function signalsAlong(path: LL[], junctions: Junction[]): SignalJ[] {
  if (!path || path.length < 2) return [];
  const sample = path.filter((_, i) => i % 4 === 0);
  const out: SignalJ[] = [];
  for (const j of junctions) {
    if (j.lat == null || j.lon == null) continue;
    const cos = Math.cos((j.lat * Math.PI) / 180);
    for (const p of sample) {
      const dx = (j.lon - p.lng) * 111 * cos;
      const dy = (j.lat - p.lat) * 111;
      if (Math.hypot(dx, dy) <= 0.25) {
        out.push({ junction: j.junction, lat: j.lat, lon: j.lon });
        break;
      }
    }
  }
  return out;
}

function hospitalHtml(h: Hospital) {
  return `<div style="transform:translate(-50%,-100%);text-align:center;pointer-events:none">
    <div style="display:inline-block;background:#ffffff;color:#0f172a;border-radius:9px;padding:4px 9px;box-shadow:0 3px 12px rgba(0,0,0,0.4);font-size:11px;font-weight:700;white-space:nowrap;border:1px solid rgba(15,23,42,0.08)">
      <span style="display:inline-flex;align-items:center;gap:3px;vertical-align:middle">${fillIconMarkup(CROSS_ICON_PATH, "#ef4444", 12)}${h.name}</span>
      <div style="font-size:9px;color:#64748b;font-weight:600;margin-top:0px">${h.dist_km} km from incident</div>
      <div style="display:flex;gap:10px;justify-content:center;align-items:center;font-size:11px;font-weight:800;margin-top:3px;padding-top:3px;border-top:1px solid #e2e8f0">
        <span style="display:inline-flex;align-items:center;gap:3px;color:#0ea5e9">${strokeIconMarkup(OFFICER_ICON_PATH, "#0ea5e9", 13)}${h.officers}</span>
        <span style="display:inline-flex;align-items:center;gap:3px;color:#d97706">${strokeIconMarkup(BARRIER_ICON_PATH, "#d97706", 13)}${h.barricades}</span>
      </div>
    </div>
    <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #ffffff;margin:0 auto"></div>
  </div>`;
}

function officerHtml() {
  return `<div style="transform:translate(-50%,-50%);pointer-events:none">
    <div style="width:22px;height:22px;border-radius:50%;background:#0ea5e9;border:2px solid #ffffff;box-shadow:0 1px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center">${strokeIconMarkup(OFFICER_ICON_PATH, "#ffffff", 13)}</div>
  </div>`;
}

function fitView(map: any, pts: LL[]) {
  if (!map || pts.length === 0) return;
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
  }
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const spanKm = Math.max((maxLat - minLat) * 111, (maxLng - minLng) * 111 * Math.cos((center.lat * Math.PI) / 180));
  const zoom = spanKm < 1.5 ? 14 : spanKm < 3 ? 13 : spanKm < 6 ? 12.3 : spanKm < 11 ? 11.5 : spanKm < 18 ? 11 : 10.5;
  map.setCenter?.(center);
  map.setZoom?.(zoom);
}

function EmergencyMap({ dispatches, jammed }: { dispatches: Dispatch[]; jammed: { lat: number; lon: number; risk?: string }[] }) {
  const mapRef = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const [ready, setReady] = useState(false);

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
      .then(() => waitFor(() => !!((window as any).mappls?.Map) && !!document.getElementById("astra-emergency-map")))
      .then(() => {
        if (cancelled || mapRef.current) return;
        const M = (window as any).mappls;
        const map = new M.Map("astra-emergency-map", { center: { lat: 12.95, lng: 77.6 }, zoom: 12, zoomControl: true });
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
    overlays.current.forEach(clearOne);
    overlays.current = [];
    try {
      for (const a of jammed.slice(0, 40)) {
        const color = a.risk === "HIGH" ? "#ef4444" : a.risk === "MEDIUM" ? "#f97316" : "#eab308";
        overlays.current.push(new M.Circle({ map, center: { lat: a.lat, lng: a.lon }, radius: a.risk === "HIGH" ? 130 : 110, fillColor: color, fillOpacity: 0.5, strokeWeight: 0 }));
      }
      for (const d of dispatches) {
        if (d.path && d.path.length >= 2) {
          overlays.current.push(new M.Polyline({ map, path: d.path, strokeColor: "#22c55e", strokeOpacity: 0.32, strokeWeight: 11, fitbounds: false }));
          overlays.current.push(new M.Polyline({ map, path: d.path, strokeColor: "#ffffff", strokeOpacity: 0.95, strokeWeight: 3, fitbounds: false }));
        }
        for (const o of d.officerPoints) {
          overlays.current.push(new M.Marker({ map, position: { lat: o.lat, lng: o.lon }, html: officerHtml() }));
        }
        overlays.current.push(new M.Circle({ map, center: d.incident, radius: 150, fillColor: "#ef4444", fillOpacity: 0.9, strokeColor: "#ffffff", strokeWeight: 2 }));
        overlays.current.push(new M.Circle({ map, center: d.hospital.pos, radius: 85, fillColor: "#22c55e", fillOpacity: 0.9, strokeColor: "#ffffff", strokeWeight: 2 }));
        overlays.current.push(new M.Marker({ map, position: d.hospital.pos, html: hospitalHtml(d.hospital) }));
      }
      const pts: LL[] = [];
      for (const d of dispatches) { pts.push(d.incident, d.hospital.pos); }
      fitView(map, pts);
    } catch {
      /* ignore */
    }
  }, [dispatches, jammed, ready]);

  return <div id="astra-emergency-map" className="absolute inset-0" style={{ width: "100%", height: "100%" }} />;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-subtle)" }}>
      <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-0.5">{label}</div>
      <div className={`text-base font-bold ${accent || "t-text"}`}>{value}</div>
    </div>
  );
}

function DispatchCard({ d, index, showIndex }: { d: Dispatch; index: number; showIndex: boolean }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[9px] uppercase tracking-wider t-text-muted">
          {showIndex ? `Dispatch ${index + 1} · ` : "Nearest hospital · "}{d.label}
        </div>
        {d.saved != null && <span className="text-[10px] font-bold text-emerald-400">−{d.saved} min</span>}
      </div>
      <div className="text-[12px] font-bold t-text leading-tight flex items-center gap-1.5">
        <IconCross className="w-3.5 h-3.5 text-red-500 shrink-0" />
        {d.hospital.name}
      </div>
      <div className="text-[10px] t-text-muted mb-2 flex items-center gap-1.5 flex-wrap">
        <span>{d.hospital.region} region · {d.hospital.dist_km} km from incident</span>
        <span
          className={`px-1.5 py-0.5 rounded ${d.hospital.general ? "text-emerald-400" : "text-amber-400"}`}
          style={{ background: d.hospital.general ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)" }}
        >
          {d.hospital.general ? "general" : "specialised — nearest general was farther"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg px-2 py-1.5 text-center" style={{ background: "rgba(14,165,233,0.12)" }}>
          <div className="text-base font-bold text-cyan-400 flex items-center justify-center gap-1.5">
            <IconOfficer className="w-4 h-4" />
            {d.hospital.officers}
          </div>
          <div className="text-[9px] t-text-muted font-semibold uppercase tracking-wide">officers</div>
        </div>
        <div className="rounded-lg px-2 py-1.5 text-center" style={{ background: "rgba(217,119,6,0.12)" }}>
          <div className="text-base font-bold text-amber-500 flex items-center justify-center gap-1.5">
            <IconBarrier className="w-4 h-4" />
            {d.hospital.barricades}
          </div>
          <div className="text-[9px] t-text-muted font-semibold uppercase tracking-wide">barricades</div>
        </div>
      </div>
      <div className="text-[10px] t-text-muted mt-2">
        {d.officerPoints.length} officer{d.officerPoints.length === 1 ? "" : "s"} hold {d.signals.length} signal{d.signals.length === 1 ? "" : "s"} green
      </div>
    </div>
  );
}

export default function EmergencyView({ prediction, junctions }: { prediction: Prediction | null; junctions: Junction[] }) {
  const [unit, setUnit] = useState("Ambulance");
  const [routes, setRoutes] = useState<(RouteResult | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  const incidents: Incident[] = useMemo(() => {
    if (!prediction) return [];
    if (prediction.incidents?.length) {
      return prediction.incidents.map((i) => ({ lat: i.lat, lon: i.lon, label: i.label, esi: i.esi }));
    }
    return [{ lat: prediction.event.latitude, lon: prediction.event.longitude, label: prediction.event.junction || prediction.event.event_cause.replace(/_/g, " "), esi: prediction.esi }];
  }, [prediction]);

  const hospitals = useMemo(() => incidents.map((i) => nearestHospital(i.lat, i.lon)), [incidents]);

  useEffect(() => {
    mapplsStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    if (incidents.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRoutes(new Array(incidents.length).fill(null));
    Promise.all(
      incidents.map((inc, idx) => {
        const h = hospitals[idx];
        return cachedDirections(`${h.lat},${h.lon}`, `${inc.lat},${inc.lon}`)
          .then((r) => ({ idx, r }))
          .catch(() => ({ idx, r: null as RouteResult | null }));
      })
    ).then((results) => {
      if (cancelled) return;
      const next = new Array(incidents.length).fill(null) as (RouteResult | null)[];
      for (const { idx, r } of results) next[idx] = r;
      setRoutes(next);
      setLoading(false);
      if (next.every((r) => !r)) setError("Routes unavailable from Mappls.");
    });
    return () => {
      cancelled = true;
    };
  }, [incidents, hospitals]);

  if (!prediction) {
    return (
      <div className="glass h-full flex items-center justify-center t-text-muted text-sm">
        Run a simulation, then switch here to dispatch emergency units to the incident(s).
      </div>
    );
  }

  const totalEsi = incidents.reduce((s, i) => s + i.esi, 0) || 1;
  const baseOfficers = Math.max(2, Math.round(prediction.resources.police.recommended * 0.25));
  const baseBarr = Math.max(2, Math.round(prediction.resources.barricades.total * 0.3));
  const single = incidents.length === 1;
  const shareOfficers = (esi: number) => (single ? baseOfficers : Math.max(2, Math.round(baseOfficers * (esi / totalEsi))));
  const shareBarr = (esi: number) => (single ? baseBarr : Math.max(2, Math.round(baseBarr * (esi / totalEsi))));

  const dispatches: Dispatch[] = incidents.map((inc, idx) => {
    const h = hospitals[idx];
    const r = routes[idx] ?? null;
    const path = r?.path ?? [];
    const signals = path.length ? signalsAlong(path, junctions) : [];
    const officersN = shareOfficers(inc.esi);
    const officerPoints = signals.slice(0, Math.min(officersN, signals.length));
    const normalEta = r?.duration_min ?? null;
    const priorityEta = normalEta != null ? Math.round(normalEta * 0.55) : null;
    const saved = normalEta != null && priorityEta != null ? Math.round(normalEta - priorityEta) : null;
    return {
      incident: { lat: inc.lat, lng: inc.lon },
      label: inc.label,
      hospital: { pos: { lat: h.lat, lng: h.lon }, name: h.name, region: h.region, dist_km: h.dist_km, officers: officersN, barricades: shareBarr(inc.esi), general: h.general },
      path,
      distance_km: r?.distance_km ?? null,
      signals,
      officerPoints,
      normalEta,
      priorityEta,
      saved,
    };
  });

  const jammed = prediction.affected_junctions.filter((a) => a.risk === "HIGH" || a.risk === "MEDIUM");
  const totalOfficers = dispatches.reduce((s, d) => s + d.officerPoints.length, 0);
  const totalSignals = dispatches.reduce((s, d) => s + d.signals.length, 0);
  const totalDist = Math.round(dispatches.reduce((s, d) => s + (d.distance_km ?? 0), 0) * 10) / 10;
  const totalSaved = dispatches.reduce((s, d) => s + (d.saved ?? 0), 0);
  const worstPriority = dispatches.reduce((m, d) => Math.max(m, d.priorityEta ?? 0), 0);

  return (
    <div className="glass p-5 h-full flex gap-5">
      <div className="w-64 shrink-0 space-y-3 overflow-y-auto custom-scroll pr-1">
        <div>
          <div className="text-sm font-bold t-text">Emergency dispatch</div>
          <div className="text-[11px] t-text-muted">
            {single ? "Priority green-corridor from nearest hospital" : `${incidents.length} incidents · a corridor + hospital for each`}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">Unit</div>
          <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-subtle)" }}>
            {UNITS.map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all ${unit === u ? "t-accent" : "t-text-muted"}`}
                style={unit === u ? { background: "var(--accent-glow)" } : undefined}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {dispatches.map((d, i) => (
          <DispatchCard key={i} d={d} index={i} showIndex={!single} />
        ))}

        <div className="text-[10px] t-text-muted italic pt-1">
          Each incident's nearest hospital is chosen from 179 Bengaluru hospitals; the {unit.toLowerCase()} runs a signal-cleared corridor from it.
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="relative rounded-xl overflow-hidden flex-1" style={{ border: "1px solid var(--border-subtle)", minHeight: 300 }}>
          {configured === false ? (
            <div className="absolute inset-0 flex items-center justify-center t-text-muted text-sm">Mappls not configured.</div>
          ) : (
            <EmergencyMap dispatches={dispatches} jammed={jammed} />
          )}
          {loading && <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded z-10" style={{ background: "rgba(0,0,0,0.55)", color: "#e2e8f0" }}>routing…</div>}
          {error && <div className="absolute bottom-2 left-2 text-[10px] text-rose-400 px-2 py-1 rounded z-10" style={{ background: "rgba(0,0,0,0.55)" }}>{error}</div>}
        </div>

        <div className="grid grid-cols-5 gap-2 mt-3">
          <Metric label={single ? "Distance" : "Total distance"} value={totalDist > 0 ? `${totalDist} km` : "—"} />
          <Metric label="Incidents" value={`${incidents.length}`} accent="text-rose-400" />
          <Metric label="Priority ETA" value={worstPriority > 0 ? `${worstPriority} min` : "—"} accent="text-cyan-400" />
          <Metric label="Time saved" value={totalSaved > 0 ? `${totalSaved} min` : "—"} accent="text-emerald-400" />
          <Metric label="Officers · signals" value={`${totalOfficers} · ${totalSignals}`} />
        </div>
      </div>
    </div>
  );
}
