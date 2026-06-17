import { useEffect, useRef, useState } from "react";
import { mapplsStatus, mapplsToken } from "../api";
import type { Prediction } from "../types";

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

export default function MapView({ prediction }: { prediction: Prediction | null }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);

  useEffect(() => {
    mapplsStatus()
      .then((s) => setConfigured(s.configured))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    if (configured !== true || window.mappls || mapRef.current) return;
    let cancelled = false;
    mapplsToken()
      .then((token) => {
        if (cancelled) return;
        const script = document.createElement("script");
        script.src = `https://apis.mappls.com/advancedmaps/api/${token}/map_sdk?layer=vector&v=3.0`;
        script.async = true;
        script.onload = () => initMap();
        document.head.appendChild(script);
      })
      .catch(() => setConfigured(false));
    return () => {
      cancelled = true;
    };
  }, [configured]);

  function initMap() {
    if (!window.mappls || !containerRef.current || mapRef.current) return;
    try {
      mapRef.current = new window.mappls.Map(containerRef.current, {
        center: [12.95, 77.6],
        zoom: 11,
        zoomControl: true,
      });
    } catch {
      setConfigured(false);
    }
  }

  useEffect(() => {
    if (configured !== true || !mapRef.current || !window.mappls || !prediction) return;
    const map = mapRef.current;
    overlaysRef.current.forEach((o) => {
      try {
        o.remove ? o.remove() : map.removeLayer?.(o);
      } catch {
        /* ignore */
      }
    });
    overlaysRef.current = [];
    const { latitude, longitude } = prediction.event;
    try {
      const circle = new window.mappls.Circle({
        map,
        center: { lat: latitude, lng: longitude },
        radius: prediction.impact_radius_km * 1000,
        fillColor: "#ef4444",
        fillOpacity: 0.12,
        strokeColor: "#ef4444",
        strokeWeight: 1,
      });
      overlaysRef.current.push(circle);
      const marker = new window.mappls.Marker({ map, position: { lat: latitude, lng: longitude } });
      overlaysRef.current.push(marker);
      prediction.affected_junctions.slice(0, 40).forEach((a) => {
        const m = new window.mappls.Circle({
          map,
          center: { lat: a.lat, lng: a.lon },
          radius: 120,
          fillColor: RISK_FILL[a.risk] || "#64748b",
          fillOpacity: 0.9,
          strokeWeight: 0,
        });
        overlaysRef.current.push(m);
      });
      map.setCenter?.([latitude, longitude]);
      map.setZoom?.(13);
    } catch {
      /* overlay failures are non-fatal */
    }
  }, [prediction, configured]);

  if (configured === true) {
    return (
      <div className="glass h-full relative overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
        <Badge text="Mappls live" />
      </div>
    );
  }

  return <FallbackMap prediction={prediction} />;
}

function Badge({ text }: { text: string }) {
  return (
    <div className="absolute top-2 right-2 text-[10px] bg-black/40 text-slate-300 px-2 py-0.5 rounded">
      {text}
    </div>
  );
}

function FallbackMap({ prediction }: { prediction: Prediction | null }) {
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
        {prediction.affected_junctions.map((a) => {
          const [x, y] = project(a.lat, a.lon);
          return (
            <circle key={a.junction} cx={x} cy={y} r={4} fill={RISK_FILL[a.risk] || "#64748b"} opacity={0.85}>
              <title>
                {a.junction} · {a.risk} · {(a.congestion * 100).toFixed(0)}%
              </title>
            </circle>
          );
        })}
        <circle cx={cx} cy={cy} r={6} fill="#ffffff" stroke="#ef4444" strokeWidth={2} />
      </svg>
      <Badge text={`offline preview · ${prediction.impact_radius_km} km`} />
    </div>
  );
}
