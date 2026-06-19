import { useEffect, useRef, useState } from "react";
import { mapplsDirections } from "../api";
import { loadSdk, waitFor } from "../mapsdk";
import type { DiversionCorridor } from "../types";

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

function compassDir(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toR = (d: number) => (d * Math.PI) / 180;
  const dl = toR(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(toR(lat2));
  const x = Math.cos(toR(lat1)) * Math.sin(toR(lat2)) - Math.sin(toR(lat1)) * Math.cos(toR(lat2)) * Math.cos(dl);
  const b = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(b / 45) % 8];
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: "var(--bg-card-inner)" }}>
      <div className="text-[9px] uppercase tracking-wider t-text-muted">{label}</div>
      <div className={`text-sm font-bold ${accent || "t-text"}`}>{value}</div>
    </div>
  );
}

function Bar({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-24 t-text-muted">{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-card-inner)" }}>
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
      </div>
      <span className="w-8 text-right t-text-2 font-semibold">{Math.round(v)}</span>
    </div>
  );
}

export default function DiversionDetail({
  diversion,
  origin,
  onClose,
}: {
  diversion: DiversionCorridor;
  origin: { lat: number; lng: number };
  onClose: () => void;
}) {
  const mapRef = useRef<any>(null);
  const [cost, setCost] = useState<{ distance_km: number | null; duration_min: number | null } | null>(null);
  const [routeError, setRouteError] = useState(false);

  const hasTarget = diversion.to_lat != null && diversion.to_lon != null;
  const dir = hasTarget ? compassDir(origin.lat, origin.lng, diversion.to_lat!, diversion.to_lon!) : null;
  const delayReduced = Math.round(12 + diversion.confidence * 0.25);
  const vehiclesRerouted = Math.round(600 + diversion.capacity * 2600);

  useEffect(() => {
    if (!hasTarget) return;
    let cancelled = false;
    loadSdk()
      .then(() => waitFor(() => !!((window as any).mappls?.Map) && !!document.getElementById("astra-divdetail")))
      .then(async () => {
        if (cancelled || mapRef.current) return;
        const M = (window as any).mappls;
        const map = new M.Map("astra-divdetail", {
          center: { lat: (origin.lat + diversion.to_lat!) / 2, lng: (origin.lng + diversion.to_lon!) / 2 },
          zoom: 13,
          zoomControl: true,
        });
        mapRef.current = map;
        setTimeout(() => map.resize?.(), 150);
        try {
          new M.Circle({ map, center: origin, radius: 120, fillColor: "#ef4444", fillOpacity: 0.9, strokeColor: "#ffffff", strokeWeight: 2 });
          new M.Circle({ map, center: { lat: diversion.to_lat!, lng: diversion.to_lon! }, radius: 150, fillColor: "#22c55e", fillOpacity: 0.9, strokeColor: "#ffffff", strokeWeight: 2 });
        } catch {
          /* ignore */
        }
        try {
          const res = await mapplsDirections(`${origin.lat},${origin.lng}`, `${diversion.to_lat},${diversion.to_lon}`);
          if (cancelled) return;
          if (res.path && res.path.length >= 2) {
            new M.Polyline({ map, path: res.path, strokeColor: "#22c55e", strokeOpacity: 0.95, strokeWeight: 5, fitbounds: true });
            setCost({ distance_km: res.distance_km, duration_min: res.duration_min });
          } else {
            setRouteError(true);
          }
        } catch {
          if (!cancelled) setRouteError(true);
        }
      })
      .catch(() => setRouteError(true));
    return () => {
      cancelled = true;
    };
  }, [diversion.corridor]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div>
            <div className="text-sm font-bold t-text">Divert via {diversion.corridor}</div>
            {dir && <div className="text-[11px] text-emerald-400">push traffic {dir} toward {diversion.corridor} · {diversion.confidence}% confidence</div>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center t-text-muted" style={{ background: "var(--bg-card-inner)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="grid grid-cols-5">
          <div className="col-span-3 relative" style={{ minHeight: 320 }}>
            {hasTarget ? (
              <div id="astra-divdetail" className="absolute inset-0" style={{ width: "100%", height: "100%" }} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center t-text-muted text-xs">No corridor location available.</div>
            )}
            {routeError && (
              <div className="absolute bottom-2 left-2 text-[10px] text-rose-400 px-2 py-1 rounded" style={{ background: "rgba(0,0,0,0.55)" }}>
                Live route unavailable
              </div>
            )}
          </div>
          <div className="col-span-2 p-4 space-y-3" style={{ borderLeft: "1px solid var(--border-subtle)" }}>
            <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium">Effect</div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Delay reduced" value={`${delayReduced}%`} accent="text-emerald-400" />
              <Stat label="Vehicles rerouted" value={vehiclesRerouted.toLocaleString()} />
              <Stat label="Reroute adds" value={cost?.distance_km != null ? `${cost.distance_km} km` : "—"} />
              <Stat label="Extra time" value={cost?.duration_min != null ? `~${Math.round(cost.duration_min)} min` : "—"} />
            </div>
            <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium pt-1">Corridor quality</div>
            <Bar label="Confidence" v={diversion.confidence} />
            <Bar label="Reliability" v={diversion.reliability * 100} />
            <Bar label="Spare capacity" v={diversion.capacity * 100} />
            <Bar label="Spillover safety" v={diversion.spillover_safety * 100} />
            {diversion.effective_rate != null && (
              <div className="text-[11px] t-text-3">Field-rated effective {Math.round(diversion.effective_rate * 100)}% ({diversion.effective_reports} reports)</div>
            )}
            <div className="text-[9px] t-text-muted italic">delay & vehicle figures are estimates</div>
          </div>
        </div>
      </div>
    </div>
  );
}
