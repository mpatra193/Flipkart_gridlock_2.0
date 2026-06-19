import { useEffect, useRef, useState } from "react";
import { mapplsDirections, mapplsStatus } from "../api";
import { loadSdk, waitFor } from "../mapsdk";
import type { Junction, Prediction } from "../types";

const UNITS = ["Ambulance", "Fire", "Police"];

type LL = { lat: number; lng: number };

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

function EmergencyMap({ path, from, to, jammed }: { path: LL[]; from: LL | null; to: LL | null; jammed: { lat: number; lon: number }[] }) {
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
    } catch {
      /* ignore */
    }
  }, [path, from, to, jammed, ready]);

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
  const incidentJunction = prediction?.event.junction || "";
  const [unit, setUnit] = useState("Ambulance");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [route, setRoute] = useState<{ path: LL[]; distance_km: number | null; duration_min: number | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    mapplsStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    const others = junctions.filter((j) => j.junction !== incidentJunction);
    setTo(incidentJunction || junctions[0]?.junction || "");
    setFrom(others[0]?.junction || "");
    setRoute(null);
  }, [incidentJunction, junctions]);

  const coordOf = (name: string): LL | null => {
    const j = junctions.find((x) => x.junction === name);
    return j && j.lat != null && j.lon != null ? { lat: j.lat, lng: j.lon } : null;
  };
  const fromC = coordOf(from);
  const toC = coordOf(to);

  useEffect(() => {
    if (!fromC || !toC) return;
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
  }, [from, to]);

  if (!prediction) {
    return (
      <div className="glass h-full flex items-center justify-center t-text-muted text-sm">
        Run a simulation, then switch here to plan an emergency route around the incident.
      </div>
    );
  }

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

        <div>
          <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">To (destination)</div>
          <select value={to} onChange={(e) => setTo(e.target.value)} className={selectClass} style={selectStyle}>
            {junctions.map((j) => (
              <option key={j.junction} value={j.junction}>{j.junction}{j.junction === incidentJunction ? " (incident)" : ""}</option>
            ))}
          </select>
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
        <div className="text-[10px] t-text-muted italic pt-1">{unit} routed traffic-aware; priority clears signals along the path.</div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="relative rounded-xl overflow-hidden flex-1" style={{ border: "1px solid var(--border-subtle)", minHeight: 300 }}>
          {configured === false ? (
            <div className="absolute inset-0 flex items-center justify-center t-text-muted text-sm">Mappls not configured.</div>
          ) : (
            <EmergencyMap path={route?.path || []} from={fromC} to={toC} jammed={jammed} />
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
