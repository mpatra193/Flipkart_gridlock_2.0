import { useEffect, useRef, useState } from "react";
import { mapplsDirections, mapplsStatus, mapplsToken } from "../api";
import type { AffectedJunction, Prediction } from "../types";

declare global {
  interface Window {
    mappls?: any;
  }
}

const RISK_FILL: Record<string, string> = {
  HIGH: "#ef4444",
  MEDIUM: "#f97316",
  LOW: "#eab308",
};

const ROUTE_COLOR = "#00C853";
const RAMP_MIN = 6;
const LEVEL_COLOR = ["#eab308", "#f97316", "#ef4444"];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function jammedList(p: Prediction): AffectedJunction[] {
  return p.affected_junctions
    .filter((a) => a.escape && (a.risk === "HIGH" || a.risk === "MEDIUM"))
    .sort((x, y) => y.congestion - x.congestion)
    .slice(0, 14);
}

function loadSdk(): Promise<void> {
  if (window.mappls && window.mappls.Map) return Promise.resolve();
  if (document.getElementById("mappls-sdk")) {
    return waitFor(() => !!(window.mappls && window.mappls.Map));
  }
  return mapplsToken().then(
    (token) =>
      new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.id = "mappls-sdk";
        s.src = `https://apis.mappls.com/advancedmaps/api/${token}/map_sdk?layer=vector&v=3.0`;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Mappls SDK failed to load"));
        document.head.appendChild(s);
      })
  );
}

function waitFor(cond: () => boolean, tries = 60): Promise<void> {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      if (cond()) return resolve();
      if (n++ > tries) return reject(new Error("Mappls SDK not ready"));
      setTimeout(tick, 100);
    };
    tick();
  });
}

export default function MapView({ prediction }: { prediction: Prediction | null }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [picked, setPicked] = useState<AffectedJunction | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const routeRef = useRef<any[]>([]);
  const cascadeRef = useRef<Map<string, any>>(new Map());
  const affectedRef = useRef<AffectedJunction[]>([]);

  const affected40 = prediction ? prediction.affected_junctions.slice(0, 40) : [];
  const maxEta = Math.max(1, ...affected40.map((a) => a.eta_min ?? 0));
  const litCount = affected40.filter((a) => (a.eta_min ?? 0) <= clock).length;

  const clearOne = (o: any) => {
    try {
      o.remove ? o.remove() : mapRef.current?.removeLayer?.(o);
    } catch {
      /* ignore */
    }
  };

  function clearRoute() {
    routeRef.current.forEach(clearOne);
    routeRef.current = [];
  }

  function clearCascade() {
    cascadeRef.current.forEach((v) => clearOne(v.circle));
    cascadeRef.current = new Map();
  }

  function levelAt(a: AffectedJunction, t: number) {
    const since = t - (a.eta_min ?? 0);
    if (since < 0) return -1;
    const intensity = (a.congestion ?? 0.5) * Math.min(1, since / RAMP_MIN);
    if (intensity >= 0.6) return 2;
    if (intensity >= 0.3) return 1;
    return 0;
  }

  function renderCascade(t: number) {
    const map = mapRef.current;
    const M = window.mappls;
    if (!map || !M) return;
    for (const a of affectedRef.current) {
      const lvl = levelAt(a, t);
      const cur = cascadeRef.current.get(a.junction);
      if (lvl < 0) {
        if (cur) {
          clearOne(cur.circle);
          cascadeRef.current.delete(a.junction);
        }
        continue;
      }
      if (cur && cur.level === lvl) continue;
      if (cur) clearOne(cur.circle);
      try {
        const circle = new M.Circle({
          map,
          center: { lat: a.lat, lng: a.lon },
          radius: lvl === 2 ? 150 : lvl === 1 ? 130 : 115,
          fillColor: LEVEL_COLOR[lvl],
          fillOpacity: 0.85,
          strokeColor: "#ffffff",
          strokeWeight: 1,
        });
        cascadeRef.current.set(a.junction, { circle, level: lvl });
      } catch {
        /* ignore */
      }
    }
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    setClock(0);
    setPlaying(true);
  }

  async function drawRoute(a: AffectedJunction) {
    setPicked(a);
    setRouteError(null);
    clearRoute();
    const map = mapRef.current;
    const M = window.mappls;
    if (!map || !M || !a.escape) return;
    const e = a.escape;

    let path: { lat: number; lng: number }[];
    try {
      const res = await mapplsDirections(`${a.lat},${a.lon}`, `${e.to_lat},${e.to_lon}`);
      path = res.path;
    } catch {
      setRouteError("Mappls could not return a road route for this junction.");
      return;
    }
    if (!path || path.length < 2) {
      setRouteError("No drivable route returned for this junction.");
      return;
    }
    try {
      routeRef.current.push(
        new M.Polyline({
          map,
          path,
          strokeColor: ROUTE_COLOR,
          strokeOpacity: 0.95,
          strokeWeight: 4,
          fitbounds: true,
        })
      );
      routeRef.current.push(
        new M.Circle({ map, center: path[path.length - 1], radius: 140, fillColor: ROUTE_COLOR, fillOpacity: 0.9, strokeColor: "#ffffff", strokeWeight: 2 })
      );
      routeRef.current.push(
        new M.Circle({ map, center: { lat: a.lat, lng: a.lon }, radius: 120, strokeColor: ROUTE_COLOR, strokeWeight: 2, fillOpacity: 0 })
      );
    } catch (err) {
      console.error("[route]", err);
      setRouteError("Map could not render the route.");
    }
  }

  useEffect(() => {
    mapplsStatus()
      .then((s) => setConfigured(s.configured))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (mapRef.current && typeof mapRef.current.resize === "function") {
        mapRef.current.resize();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (configured !== true) return;
    let cancelled = false;

    loadSdk()
      .then(() => waitFor(() => !!(window.mappls && window.mappls.Map) && !!containerRef.current))
      .then(() => {
        if (cancelled || mapRef.current || !containerRef.current) return;
        const map = new window.mappls.Map("mappls-map-container", {
          center: { lat: 12.95, lng: 77.6 },
          zoom: 11,
          zoomControl: true,
        });
        mapRef.current = map;

        if (typeof map.on === "function") {
          map.on("click", (e: any) => {
            const ll = e?.lngLat || e?.latlng || e?.latLng;
            if (!ll || typeof ll.lat !== "number") return;
            let best: AffectedJunction | null = null;
            let bestD = Infinity;
            for (const a of affectedRef.current) {
              if (!a.escape) continue;
              const d = haversineKm(ll.lat, ll.lng, a.lat, a.lon);
              if (d < bestD) {
                bestD = d;
                best = a;
              }
            }
            if (best && bestD <= 0.25) drawRoute(best);
          });
        }

        const triggerReady = () => {
          if (!cancelled) {
            setReady(true);
            setTimeout(() => {
              if (map && typeof map.resize === "function") map.resize();
            }, 100);
          }
        };

        if (typeof map.on === "function") map.on("load", triggerReady);
        else triggerReady();

        setTimeout(triggerReady, 1500);
      })
      .catch((e) => {
        console.error("[Mappls]", e);
        setConfigured(false);
      });

    return () => {
      cancelled = true;
    };
  }, [configured]);

  useEffect(() => {
    if (!ready || !mapRef.current || !window.mappls || !prediction) return;
    const map = mapRef.current;

    if (typeof map.resize === "function") map.resize();

    clearRoute();
    clearCascade();
    setPicked(null);
    setRouteError(null);
    setPlaying(false);
    setClock(0);
    overlaysRef.current.forEach(clearOne);
    overlaysRef.current = [];

    const { latitude, longitude } = prediction.event;
    try {
      overlaysRef.current.push(
        new window.mappls.Circle({
          map,
          center: { lat: latitude, lng: longitude },
          radius: prediction.impact_radius_km * 1000,
          fillColor: "#ef4444",
          fillOpacity: 0.12,
          strokeColor: "#ef4444",
          strokeWeight: 1,
        })
      );
      overlaysRef.current.push(
        new window.mappls.Marker({ map, position: { lat: latitude, lng: longitude } })
      );
      affectedRef.current = prediction.affected_junctions.slice(0, 40);
      renderCascade(0);
      map.setCenter?.({ lat: latitude, lng: longitude });
      map.setZoom?.(13);

      setTimeout(() => {
        if (map && typeof map.resize === "function") map.resize();
      }, 200);
    } catch (e) {
      console.error("[Mappls overlay]", e);
    }
  }, [prediction, ready]);

  useEffect(() => {
    renderCascade(clock);
  }, [clock]);

  useEffect(() => {
    if (!playing) return;
    const max = Math.max(1, ...affectedRef.current.map((a) => a.eta_min ?? 0)) + RAMP_MIN;
    const step = Math.max(0.4, max / 50);
    const id = setInterval(() => {
      setClock((t) => {
        const next = t + step;
        if (next >= max) {
          setPlaying(false);
          return max;
        }
        return next;
      });
    }, 170);
    return () => clearInterval(id);
  }, [playing]);

  if (configured === true) {
    return (
      <div className="glass h-full relative overflow-hidden" style={{ minHeight: 420 }}>
        <div
          id="mappls-map-container"
          ref={containerRef}
          className="absolute inset-0"
          style={{ width: "100%", height: "100%" }}
        />
        {prediction && <JamChips list={jammedList(prediction)} picked={picked} onPick={drawRoute} />}
        {picked?.escape && (
          <RouteCard
            picked={picked}
            error={routeError}
            onClose={() => {
              clearRoute();
              setPicked(null);
              setRouteError(null);
            }}
          />
        )}
        {prediction && affected40.length > 1 && (
          <div
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-3 py-2 rounded-2xl backdrop-blur-xl"
            style={{ background: "var(--overlay-bg)", border: "1px solid var(--border-subtle)", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
          >
            <button
              onClick={togglePlay}
              className="shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold t-accent"
              style={{ background: "var(--accent-glow)" }}
            >
              {playing ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                  Pause
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  {clock > 0 ? "Replay" : "Start"}
                </>
              )}
            </button>
            <input
              type="range"
              min={0}
              max={maxEta + RAMP_MIN}
              step={0.5}
              value={clock}
              onChange={(e) => { setPlaying(false); setClock(Number(e.target.value)); }}
              style={{ width: 150 }}
            />
            <div className="text-[11px] font-bold t-text-2 w-16 text-right shrink-0">T+{Math.round(clock)} min</div>
            <div className="text-[10px] t-text-muted w-14 shrink-0">{litCount} active</div>
          </div>
        )}
        <Badge text={ready ? "Mappls live" : "loading map…"} />
      </div>
    );
  }

  return <FallbackMap prediction={prediction} />;
}

/* ─── Jammed Junctions Navbar ─── */
function JamChips({
  list,
  picked,
  onPick,
}: {
  list: AffectedJunction[];
  picked: AffectedJunction | null;
  onPick: (a: AffectedJunction) => void;
}) {
  if (!list.length) return null;
  return (
    <div className="absolute top-3 left-3 right-28 z-20">
      <div
        className="flex items-center p-2 rounded-2xl backdrop-blur-xl shadow-lg"
        style={{
          background: 'var(--overlay-bg)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        }}
      >
        {/* Live badge */}
        <div
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl mr-2"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
        >
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Jammed</span>
        </div>

        {/* Scrollable chip list */}
        <div
          className="flex-1 flex items-center gap-1.5 overflow-x-auto px-1 py-0.5"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <style>{`.jam-scroll::-webkit-scrollbar { display: none; }`}</style>
          {list.map((a) => {
            const isSelected = picked?.junction === a.junction;
            return (
              <button
                key={a.junction}
                onClick={() => onPick(a)}
                className="jam-scroll shrink-0 px-3 py-1.5 rounded-xl transition-all duration-200 flex items-center gap-2"
                style={{
                  background: isSelected ? 'var(--overlay-chip-active-bg)' : 'var(--overlay-chip-bg)',
                  border: isSelected ? '1px solid var(--overlay-chip-active-border)' : '1px solid transparent',
                  color: isSelected ? 'var(--overlay-chip-active-text)' : 'var(--overlay-chip-text)',
                }}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${a.risk === 'HIGH' ? 'bg-rose-500' : 'bg-orange-500'}`} />
                <span className="text-xs font-medium whitespace-nowrap">{a.junction}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Route Info Card ─── */
function RouteCard({
  picked,
  error,
  onClose,
}: {
  picked: AffectedJunction;
  error: string | null;
  onClose: () => void;
}) {
  const e = picked.escape!;
  return (
    <div
      className="absolute bottom-3 left-3 z-20 rounded-2xl backdrop-blur-xl shadow-2xl w-80 overflow-hidden"
      style={{
        background: 'var(--overlay-bg)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div>
          <div className="text-sm font-bold t-text">{picked.junction}</div>
          <div className={`text-[11px] font-semibold risk-${picked.risk} mt-0.5`}>
            {picked.risk} congestion · {(picked.congestion * 100).toFixed(0)}%
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center t-text-muted transition-colors"
          style={{ background: 'var(--bg-card-inner)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {error && (
          <div className="text-[11px] text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-lg">
            {error}
          </div>
        )}

        {/* Direction */}
        <div
          className="flex items-start gap-2.5 p-3 rounded-xl"
          style={{ background: 'rgba(0, 200, 83, 0.06)', border: '1px solid rgba(0, 200, 83, 0.12)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00C853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <div className="text-[12px] font-medium" style={{ color: '#00C853' }}>
            Divert traffic {e.direction} toward {e.to_label}
          </div>
        </div>

        {/* Avoid */}
        {e.avoid.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-red-400 font-semibold mb-1.5">Avoid</div>
            <div className="flex flex-wrap gap-1">
              {e.avoid.map((a, i) => (
                <span key={i} className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-md font-medium">
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Reasons */}
        {e.reason.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider t-text-muted font-semibold mb-1.5">Reasoning</div>
            <ul className="space-y-1">
              {e.reason.map((r, i) => (
                <li key={i} className="text-[11px] t-text-3 flex items-start gap-1.5">
                  <span className="t-text-muted mt-1">·</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Confidence footer */}
        <div
          className="flex items-center justify-between text-[11px] pt-2"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <span className="t-text-muted font-medium">Confidence</span>
          <span className="text-emerald-400 font-bold text-sm">{e.confidence}%</span>
        </div>
      </div>
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <div
      className="absolute top-2 right-2 z-10 text-[10px] px-2.5 py-1 rounded-lg backdrop-blur-sm"
      style={{ background: 'var(--badge-bg)', color: 'var(--badge-text)', border: '1px solid var(--border-subtle)' }}
    >
      {text}
    </div>
  );
}

function FallbackMap({ prediction }: { prediction: Prediction | null }) {
  const [picked, setPicked] = useState<AffectedJunction | null>(null);

  useEffect(() => {
    setPicked(null);
  }, [prediction]);

  if (!prediction) {
    return (
      <div className="glass h-full flex items-center justify-center t-text-muted text-sm">
        Map preview appears here after a simulation.
      </div>
    );
  }
  const size = 440;
  const cx = size / 2;
  const cy = size / 2;
  const ringPx = size * 0.42;
  const R = Math.max(prediction.impact_radius_km, 0.1);
  const kmToPx = ringPx / R;
  const cLat = prediction.event.latitude;
  const cLon = prediction.event.longitude;
  const cosLat = Math.cos((cLat * Math.PI) / 180);

  const project = (lat: number, lon: number): [number, number] => {
    const dxKm = (lon - cLon) * 111 * cosLat;
    const dyKm = (lat - cLat) * 111;
    return [cx + dxKm * kmToPx, cy - dyKm * kmToPx];
  };

  const pe = picked?.escape || null;
  const pj = picked ? project(picked.lat, picked.lon) : null;
  const pt = pe ? project(pe.to_lat, pe.to_lon) : null;

  return (
    <div className="glass h-full relative overflow-hidden">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
        <rect width={size} height={size} fill="#0b1220" />
        {[1, 2 / 3, 1 / 3].map((f, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={ringPx * f}
            fill={["#ef4444", "#f97316", "#eab308"][i]}
            fillOpacity={0.06}
            stroke={["#ef4444", "#f97316", "#eab308"][i]}
            strokeOpacity={0.3}
          />
        ))}
        {pj && pt && (
          <g>
            <line
              x1={pj[0]}
              y1={pj[1]}
              x2={pt[0]}
              y2={pt[1]}
              stroke={ROUTE_COLOR}
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
            <circle cx={pt[0]} cy={pt[1]} r={5} fill={ROUTE_COLOR} />
            <circle cx={pj[0]} cy={pj[1]} r={8} fill="none" stroke={ROUTE_COLOR} strokeWidth={2} />
          </g>
        )}
        {prediction.affected_junctions.map((a) => {
          const [x, y] = project(a.lat, a.lon);
          const clickable = !!a.escape;
          return (
            <circle
              key={a.junction}
              cx={x}
              cy={y}
              r={clickable ? 5 : 4}
              fill={RISK_FILL[a.risk] || "#64748b"}
              opacity={0.85}
              style={{ cursor: clickable ? "pointer" : "default" }}
              onClick={() => clickable && setPicked(a)}
            >
              <title>
                {a.junction} · {a.risk} · {(a.congestion * 100).toFixed(0)}%
                {clickable ? " · click to route out" : ""}
              </title>
            </circle>
          );
        })}
        <circle cx={cx} cy={cy} r={6} fill="#ffffff" stroke="#ef4444" strokeWidth={2} />
      </svg>
      <JamChips list={jammedList(prediction)} picked={picked} onPick={setPicked} />
      {picked?.escape && (
        <RouteCard
          picked={picked}
          error={"offline preview — straight-line direction only (no road geometry)"}
          onClose={() => setPicked(null)}
        />
      )}
      <Badge text={`offline preview · ${prediction.impact_radius_km} km`} />
    </div>
  );
}
