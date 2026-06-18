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

function dotHtml(color: string, size = 13) {
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.6);box-shadow:0 0 5px ${color};cursor:pointer"></div>`;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const routeRef = useRef<any[]>([]);

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
      routeRef.current.push(new M.Marker({ map, position: path[path.length - 1], html: dotHtml(ROUTE_COLOR, 15) }));
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
    setPicked(null);
    setRouteError(null);
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
      prediction.affected_junctions.slice(0, 40).forEach((a) => {
        const color = RISK_FILL[a.risk] || "#64748b";
        const mk = new window.mappls.Marker({
          map,
          position: { lat: a.lat, lng: a.lon },
          html: dotHtml(color),
          popupHtml: `<b>${a.junction}</b><br/>${a.risk} · tap to route traffic out`,
        });
        if (a.escape) {
          if (mk && typeof mk.addListener === "function") mk.addListener("click", () => drawRoute(a));
          else if (mk && typeof mk.on === "function") mk.on("click", () => drawRoute(a));
        }
        overlaysRef.current.push(mk);
      });
      map.setCenter?.({ lat: latitude, lng: longitude });
      map.setZoom?.(13);

      setTimeout(() => {
        if (map && typeof map.resize === "function") map.resize();
      }, 200);
    } catch (e) {
      console.error("[Mappls overlay]", e);
    }
  }, [prediction, ready]);

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
        <Badge text={ready ? "Mappls live" : "loading map…"} />
      </div>
    );
  }

  return <FallbackMap prediction={prediction} />;
}

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
    <div className="absolute top-2 left-2 right-24 z-20 flex items-center gap-1 overflow-x-auto pb-1">
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400 pr-1">Jammed</span>
      {list.map((a) => (
        <button
          key={a.junction}
          onClick={() => onPick(a)}
          className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border transition ${
            picked?.junction === a.junction
              ? "bg-emerald-500/30 border-emerald-400 text-emerald-200"
              : "bg-black/50 border-white/10 text-slate-300 hover:border-emerald-400/60"
          }`}
        >
          {a.junction}
        </button>
      ))}
    </div>
  );
}

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
    <div className="absolute bottom-2 left-2 z-20 glass p-3 w-72 text-xs">
      <div className="flex items-start justify-between">
        <div className="font-semibold text-slate-100">{picked.junction}</div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 leading-none">
          ✕
        </button>
      </div>
      <div className={`text-[10px] risk-${picked.risk}`}>{picked.risk} congestion</div>
      {error && <div className="mt-2 text-rose-400">{error}</div>}
      <div className="mt-2 text-emerald-300 font-medium">
        ➜ Divert traffic {e.direction} toward {e.to_label}
      </div>
      {e.avoid.length > 0 && <div className="mt-1 text-rose-300">Avoid: {e.avoid.join(" / ")}</div>}
      <ul className="mt-2 space-y-0.5 text-slate-400 list-disc list-inside">
        {e.reason.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <div className="mt-2 text-slate-300">
        Confidence: <span className="text-emerald-300 font-semibold">{e.confidence}%</span>
      </div>
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <div className="absolute top-2 right-2 z-10 text-[10px] bg-black/50 text-slate-300 px-2 py-0.5 rounded">
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
      <div className="glass h-full flex items-center justify-center text-slate-500 text-sm">
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
