import { useEffect, useRef, useState } from "react";
import { mapplsDirections, mapplsStatus } from "../api";
import { loadSdk, waitFor } from "../mapsdk";
import type { AffectedJunction, Prediction } from "../types";

const RAMP = 6;
const RECOVERY = 12;
const RELIEF = 0.55;

function reachedSince(a: AffectedJunction, t: number) {
  return t - (a.eta_min ?? 0);
}

function colorWithout(a: AffectedJunction, t: number): string | null {
  const since = reachedSince(a, t);
  if (since < 0) return null;
  const intensity = (a.congestion ?? 0.5) * Math.min(1, since / RAMP);
  if (intensity >= 0.6) return "#ef4444";
  if (intensity >= 0.3) return "#f97316";
  return "#eab308";
}

function colorWith(a: AffectedJunction, t: number): string | null {
  const since = reachedSince(a, t);
  if (since < 0) return null;
  const up = Math.min(1, since / RAMP);
  const down = since > RAMP ? Math.max(0, 1 - (since - RAMP) / RECOVERY) : 1;
  const intensity = (a.congestion ?? 0.5) * RELIEF * up * down;
  if (since > RAMP && intensity < 0.12) return "#22c55e";
  if (intensity >= 0.6) return "#ef4444";
  if (intensity >= 0.3) return "#f97316";
  return "#eab308";
}

function CompareMap({ id, prediction, clock, mode }: { id: string; prediction: Prediction; clock: number; mode: "without" | "with" }) {
  const mapRef = useRef<any>(null);
  const circles = useRef<Map<string, { c: any; color: string }>>(new Map());
  const lines = useRef<Map<string, any>>(new Map());
  const [ready, setReady] = useState(false);
  const [routes, setRoutes] = useState<Record<string, { lat: number; lng: number }[]>>({});

  const clearOne = (o: any) => {
    try {
      o.remove ? o.remove() : mapRef.current?.removeLayer?.(o);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadSdk()
      .then(() => waitFor(() => !!((window as any).mappls?.Map) && !!document.getElementById(id)))
      .then(() => {
        if (cancelled || mapRef.current) return;
        const M = (window as any).mappls;
        const map = new M.Map(id, { center: { lat: 12.95, lng: 77.6 }, zoom: 12, zoomControl: false });
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
      .catch((e) => console.error("[compare map]", e));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!ready || !prediction) return;
    const map = mapRef.current;
    circles.current.forEach((v) => clearOne(v.c));
    circles.current = new Map();
    lines.current.forEach((l) => clearOne(l));
    lines.current = new Map();
    setRoutes({});
    map.setCenter?.({ lat: prediction.event.latitude, lng: prediction.event.longitude });
    map.setZoom?.(12.5);
    setTimeout(() => map.resize?.(), 150);

    if (mode === "with") {
      const jammed = prediction.affected_junctions
        .filter((a) => a.escape && (a.risk === "HIGH" || a.risk === "MEDIUM"))
        .slice(0, 5);
      jammed.forEach(async (a) => {
        try {
          const res = await mapplsDirections(`${a.lat},${a.lon}`, `${a.escape!.to_lat},${a.escape!.to_lon}`);
          if (res.path && res.path.length >= 2) {
            setRoutes((prev) => ({ ...prev, [a.junction]: res.path }));
          }
        } catch {
          /* skip */
        }
      });
    }
  }, [ready, prediction, mode]);

  useEffect(() => {
    const map = mapRef.current;
    const M = (window as any).mappls;
    if (!map || !M || !ready || !prediction) return;
    const aff = prediction.affected_junctions.slice(0, 40);

    for (const a of aff) {
      const color = mode === "with" ? colorWith(a, clock) : colorWithout(a, clock);
      const cur = circles.current.get(a.junction);
      if (!color) {
        if (cur) {
          clearOne(cur.c);
          circles.current.delete(a.junction);
        }
        continue;
      }
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

    if (mode === "with") {
      for (const a of aff) {
        const path = routes[a.junction];
        const reached = path && reachedSince(a, clock) >= 0;
        const has = lines.current.has(a.junction);
        if (reached && !has) {
          try {
            const ln = new M.Polyline({ map, path, strokeColor: "#22c55e", strokeOpacity: 0.9, strokeWeight: 3, fitbounds: false });
            lines.current.set(a.junction, ln);
          } catch {
            /* ignore */
          }
        } else if (!reached && has) {
          clearOne(lines.current.get(a.junction));
          lines.current.delete(a.junction);
        }
      }
    }
  }, [clock, ready, prediction, mode, routes]);

  return <div id={id} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />;
}

function Metric({ label, without, withv }: { label: string; without: string; withv: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-subtle)" }}>
      <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1">{label}</div>
      <div className="flex items-center justify-between text-sm font-bold">
        <span className="text-rose-400">{without}</span>
        <span className="t-text-muted text-[10px]">vs</span>
        <span className="text-emerald-400">{withv}</span>
      </div>
    </div>
  );
}

function Side({ label, caption, accent, children }: { label: string; caption: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <div className="text-xs font-bold" style={{ color: accent }}>{label}</div>
        <div className="text-[10px] t-text-muted">{caption}</div>
      </div>
      <div className="relative rounded-xl overflow-hidden flex-1" style={{ border: "1px solid var(--border-subtle)", minHeight: 320 }}>
        {children}
      </div>
    </div>
  );
}

export default function CompareView({ prediction }: { prediction: Prediction | null }) {
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);

  const aff = prediction ? prediction.affected_junctions.slice(0, 40) : [];
  const maxEta = Math.max(1, ...aff.map((a) => a.eta_min ?? 0));
  const timelineMax = maxEta + RAMP + RECOVERY;

  useEffect(() => {
    mapplsStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    setClock(0);
    setPlaying(false);
  }, [prediction]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setClock((t) => {
        const next = t + timelineMax / 55;
        if (next >= timelineMax) {
          setPlaying(false);
          return timelineMax;
        }
        return next;
      });
    }, 170);
    return () => clearInterval(id);
  }, [playing, timelineMax]);

  if (!prediction) {
    return (
      <div className="glass h-full flex items-center justify-center t-text-muted text-sm">
        Run a simulation in the Simulator tab, then switch here to compare with vs without ASTRA.
      </div>
    );
  }

  const congestionOf = (a: AffectedJunction) => a.congestion ?? 0;
  const withoutJammed = aff.filter((a) => congestionOf(a) >= 0.3).length;
  const withoutSevere = aff.filter((a) => congestionOf(a) >= 0.6).length;
  const withJammed = aff.filter((a) => congestionOf(a) * RELIEF >= 0.3).length;
  const withSevere = aff.filter((a) => congestionOf(a) * RELIEF >= 0.6).length;
  const diversions = prediction.diversions.recommended.length;

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    setClock(0);
    setPlaying(true);
  }

  return (
    <div className="glass p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-bold t-text">ASTRA Impact — with vs without</div>
          <div className="text-[11px] t-text-muted">
            {prediction.event.event_cause.replace(/_/g, " ")} at {prediction.event.junction} · same incident, two responses
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold t-accent"
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
            max={timelineMax}
            step={0.5}
            value={clock}
            onChange={(e) => { setPlaying(false); setClock(Number(e.target.value)); }}
            style={{ width: 140 }}
          />
          <div className="text-[11px] font-bold t-text-2 w-16 text-right">T+{Math.round(clock)} min</div>
        </div>
      </div>

      {configured === false ? (
        <div className="flex-1 flex items-center justify-center t-text-muted text-sm">
          Mappls is not configured — add credentials to .env to see the comparison maps.
        </div>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          <Side label="Without ASTRA" caption="no diversion — jam spreads & holds" accent="#ef4444">
            <CompareMap id="astra-cmp-left" prediction={prediction} clock={clock} mode="without" />
          </Side>
          <Side label="With ASTRA" caption="diversions active — contained & clearing" accent="#22c55e">
            <CompareMap id="astra-cmp-right" prediction={prediction} clock={clock} mode="with" />
          </Side>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mt-3">
        <Metric label="Junctions jammed" without={`${withoutJammed}`} withv={`${withJammed}`} />
        <Metric label="Severe gridlock" without={`${withoutSevere}`} withv={`${withSevere}`} />
        <Metric label="Outcome" without="persists" withv={`${diversions} reroutes`} />
      </div>
    </div>
  );
}
