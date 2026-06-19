import { useEffect, useRef, useState } from "react";
import { mapplsDirections, mapplsStatus } from "../api";
import { loadSdk, waitFor } from "../mapsdk";
import { nearestRegion, pickHospital } from "../hospitals";
import type { Junction, Prediction } from "../types";

const UNITS = ["Ambulance", "Fire", "Police"];

type LL = { lat: number; lng: number };
type Hospital = { pos: LL; name: string; region: string; officers: number; barricades: number };

function signalsAlong(path: LL[], junctions: Junction[]) {
  if (!path || path.length < 2) return [] as string[];
  const sample = path.filter((_, i) => i % 4 === 0);
  const out: string[] = [];
  for (const j of junctions) {
    if (j.lat == null || j.lon == null) continue;
    const cos = Math.cos((j.lat * Math.PI) / 180);
    for (const p of sample) {
      const dx = (j.lon - p.lng) * 111 * cos;
      const dy = (j.lat - p.lat) * 111;
      if (Math.hypot(dx, dy) <= 0.25) {
        out.push(j.junction);
        break;
      }
    }
  }
  return out;
}

function hospitalHtml(h: Hospital) {
  return `<div style="transform:translate(-50%,-100%);text-align:center;pointer-events:none">
    <div style="display:inline-block;background:#ffffff;color:#0f172a;border-radius:8px;padding:3px 8px;box-shadow:0 2px 10px rgba(0,0,0,0.35);font-size:11px;font-weight:700;white-space:nowrap">
      <span style="color:#ef4444">✚</span> ${h.name}
      <div style="font-size:10px;color:#0ea5e9;font-weight:700;margin-top:1px">👮 ${h.officers}&nbsp;&nbsp;🚧 ${h.barricades}</div>
    </div>
    <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #ffffff;margin:0 auto"></div>
  </div>`;
}

function EmergencyMap({ path, from, to, hospital, jammed }: { path: LL[]; from: LL | null; to: LL | null; hospital: Hospital | null; jammed: { lat: number; lon: number }[] }) {
  const mapRef = useRef<any>(null);
  const overlays = useRef<any[]>([]);
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
        overlays.current.push(new M.Circle({ map, center: { lat: a.lat, lng: a.lon }, radius: 120, fillColor: "#ef4444", fillOpacity: 0.7, strokeWeight: 0 }));
      }
      if (path && path.length >= 2) {
        overlays.current.push(new M.Polyline({ map, path, strokeColor: "#22d3ee", strokeOpacity: 0.5, strokeWeight: 9, fitbounds: true }));
        overlays.current.push(new M.Polyline({ map, path, strokeColor: "#ffffff", strokeOpacity: 0.95, strokeWeight: 3, fitbounds: false }));
      }
      if (from) overlays.current.push(new M.Circle({ map, center: from, radius: 150, fillColor: "#22d3ee", fillOpacity: 0.9, strokeColor: "#ffffff", strokeWeight: 2 }));
      if (to) overlays.current.push(new M.Circle({ map, center: to, radius: 160, fillColor: "#ef4444", fillOpacity: 0.9, strokeColor: "#ffffff", strokeWeight: 2 }));
      if (hospital) overlays.current.push(new M.Marker({ map, position: hospital.pos, html: hospitalHtml(hospital) }));
    } catch {
      /* ignore */
    }
  }, [path, from, to, hospital, jammed, ready]);

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

export default function EmergencyView({ prediction, junctions }: { prediction: Prediction | null; junctions: Junction[] }) {
  const [unit, setUnit] = useState("Ambulance");
  const [from, setFrom] = useState("");
  const [route, setRoute] = useState<{ path: LL[]; distance_km: number | null; duration_min: number | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  const incidentJunction = prediction?.event.junction || "";
  const incidentLat = prediction?.event.latitude ?? 12.95;
  const incidentLng = prediction?.event.longitude ?? 77.6;

  useEffect(() => {
    mapplsStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    const far = [...junctions]
      .filter((j) => j.lat != null && j.lon != null && j.junction !== incidentJunction)
      .sort((a, b) => Math.hypot(b.lat - incidentLat, b.lon - incidentLng) - Math.hypot(a.lat - incidentLat, a.lon - incidentLng));
    setFrom(far[0]?.junction || "");
    setRoute(null);
  }, [incidentJunction, junctions]);

  const coordOf = (name: string): LL | null => {
    const j = junctions.find((x) => x.junction === name);
    return j && j.lat != null && j.lon != null ? { lat: j.lat, lng: j.lon } : null;
  };
  const fromC = coordOf(from);
  const toC: LL = { lat: incidentLat, lng: incidentLng };

  useEffect(() => {
    if (!fromC) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    mapplsDirections(`${fromC.lat},${fromC.lng}`, `${toC.lat},${toC.lng}`)
      .then((res) => {
        if (cancelled) return;
        if (res.path && res.path.length >= 2) setRoute({ path: res.path, distance_km: res.distance_km, duration_min: res.duration_min });
        else setError("No route returned.");
      })
      .catch(() => !cancelled && setError("Route unavailable from Mappls."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from, incidentLat, incidentLng]);

  if (!prediction) {
    return (
      <div className="glass h-full flex items-center justify-center t-text-muted text-sm">
        Run a simulation, then switch here to plan an emergency route around the incident.
      </div>
    );
  }

  const region = nearestRegion(incidentLat, incidentLng);
  const hospitalName = pickHospital(region, incidentJunction || `${incidentLat}`);
  const officers = Math.max(2, Math.round(prediction.resources.police.recommended * 0.25));
  const barricades = Math.max(2, Math.round(prediction.resources.barricades.total * 0.3));
  const hospital: Hospital = {
    pos: { lat: incidentLat + 0.009, lng: incidentLng + 0.009 },
    name: hospitalName,
    region,
    officers,
    barricades,
  };

  const jammed = prediction.affected_junctions.filter((a) => a.risk === "HIGH" || a.risk === "MEDIUM");
  const signals = route ? signalsAlong(route.path, junctions) : [];
  const normalEta = route?.duration_min ?? null;
  const priorityEta = normalEta != null ? Math.round(normalEta * 0.55) : null;
  const saved = normalEta != null && priorityEta != null ? Math.round(normalEta - priorityEta) : null;

  const selectClass = "w-full rounded-xl px-3 py-2 text-sm focus:outline-none";
  const selectStyle = { background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--input-text)" } as const;

  return (
    <div className="glass p-5 h-full flex gap-5">
      <div className="w-64 shrink-0 space-y-3 overflow-y-auto custom-scroll pr-1">
        <div>
          <div className="text-sm font-bold t-text">Emergency routing</div>
          <div className="text-[11px] t-text-muted">Priority green-corridor to the incident</div>
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

        <div>
          <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">From (unit base)</div>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass} style={selectStyle}>
            {junctions.map((j) => (
              <option key={j.junction} value={j.junction}>{j.junction}</option>
            ))}
          </select>
        </div>

        <div className="rounded-xl p-3" style={{ background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.2)" }}>
          <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1">Nearest hospital · dispatch</div>
          <div className="text-[12px] font-bold t-text leading-tight">✚ {hospitalName}</div>
          <div className="text-[10px] t-text-muted mb-2">{region} region · staging point</div>
          <div className="flex gap-3 text-[12px] font-semibold">
            <span className="text-cyan-400">👮 {officers} officers</span>
            <span className="text-amber-400">🚧 {barricades} barricades</span>
          </div>
        </div>

        {signals.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">Clear signals at</div>
            <div className="flex flex-wrap gap-1">
              {signals.slice(0, 10).map((s) => (
                <span key={s} className="text-[10px] px-2 py-0.5 rounded-md text-cyan-300" style={{ background: "rgba(34,211,238,0.1)" }}>{s}</span>
              ))}
            </div>
          </div>
        )}
        <div className="text-[10px] t-text-muted italic pt-1">{unit} routed traffic-aware; priority clears signals along the path. Hospital location approximate.</div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="relative rounded-xl overflow-hidden flex-1" style={{ border: "1px solid var(--border-subtle)", minHeight: 300 }}>
          {configured === false ? (
            <div className="absolute inset-0 flex items-center justify-center t-text-muted text-sm">Mappls not configured.</div>
          ) : (
            <EmergencyMap path={route?.path || []} from={fromC} to={toC} hospital={hospital} jammed={jammed} />
          )}
          {loading && <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded z-10" style={{ background: "rgba(0,0,0,0.55)", color: "#e2e8f0" }}>routing…</div>}
          {error && <div className="absolute bottom-2 left-2 text-[10px] text-rose-400 px-2 py-1 rounded z-10" style={{ background: "rgba(0,0,0,0.55)" }}>{error}</div>}
        </div>

        <div className="grid grid-cols-5 gap-2 mt-3">
          <Metric label="Distance" value={route?.distance_km != null ? `${route.distance_km} km` : "—"} />
          <Metric label="Normal ETA" value={normalEta != null ? `${Math.round(normalEta)} min` : "—"} accent="text-rose-400" />
          <Metric label="Priority ETA" value={priorityEta != null ? `${priorityEta} min` : "—"} accent="text-cyan-400" />
          <Metric label="Time saved" value={saved != null ? `${saved} min` : "—"} accent="text-emerald-400" />
          <Metric label="Signals to clear" value={`${signals.length}`} />
        </div>
      </div>
    </div>
  );
}
