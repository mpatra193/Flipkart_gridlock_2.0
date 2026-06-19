import { useEffect, useRef, useState } from "react";
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

function ComparePanel({
  prediction,
  clock,
  mode,
  label,
  caption,
}: {
  prediction: Prediction;
  clock: number;
  mode: "without" | "with";
  label: string;
  caption: string;
}) {
  const W = 400;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2;
  const ringPx = 132;
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

  const accent = mode === "with" ? "#22c55e" : "#ef4444";

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <div className="text-xs font-bold" style={{ color: accent }}>{label}</div>
        <div className="text-[10px] t-text-muted">{caption}</div>
      </div>
      <div className="relative rounded-xl overflow-hidden flex-1" style={{ border: "1px solid var(--border-subtle)" }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
          <rect width={W} height={H} fill="#0b1220" />
          {[1, 0.66, 0.33].map((f, i) => (
            <circle key={i} cx={cx} cy={cy} r={ringPx * f} fill="none" stroke="#1e293b" strokeWidth={1} />
          ))}

          {mode === "with" &&
            aff.map((a) => {
              if (!a.escape || reachedSince(a, clock) < 0) return null;
              if (a.risk !== "HIGH" && a.risk !== "MEDIUM") return null;
              const [x1, y1] = project(a.lat, a.lon);
              const [x2, y2] = project(a.escape.to_lat, a.escape.to_lon);
              return (
                <line key={`d-${a.junction}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
              );
            })}

          {aff.map((a) => {
            const color = mode === "with" ? colorWith(a, clock) : colorWithout(a, clock);
            if (!color) return null;
            const [x, y] = project(a.lat, a.lon);
            const r = color === "#ef4444" ? 6 : color === "#f97316" ? 5 : 4;
            return <circle key={a.junction} cx={x} cy={y} r={r} fill={color} opacity={0.9} />;
          })}

          <circle cx={cx} cy={cy} r={7} fill="#ffffff" stroke="#ef4444" strokeWidth={2} />
        </svg>
      </div>
    </div>
  );
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

export default function CompareView({ prediction }: { prediction: Prediction | null }) {
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const affRef = useRef<AffectedJunction[]>([]);

  affRef.current = prediction ? prediction.affected_junctions.slice(0, 40) : [];
  const maxEta = Math.max(1, ...affRef.current.map((a) => a.eta_min ?? 0));
  const timelineMax = maxEta + RAMP + RECOVERY;

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

  const aff = affRef.current;
  const congestionOf = (a: AffectedJunction) => a.congestion ?? 0;
  const withoutJammed = aff.filter((a) => congestionOf(a) >= 0.3).length;
  const withoutSevere = aff.filter((a) => congestionOf(a) >= 0.6).length;
  const withJammed = aff.filter((a) => congestionOf(a) * RELIEF >= 0.3).length;
  const withSevere = aff.filter((a) => congestionOf(a) * RELIEF >= 0.6).length;
  const diversions = prediction.diversions.recommended.length;

  function togglePlay() {
    if (playing) { setPlaying(false); return; }
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

      <div className="flex gap-4 flex-1 min-h-0">
        <ComparePanel prediction={prediction} clock={clock} mode="without" label="Without ASTRA" caption="no diversion — jam spreads & holds" />
        <ComparePanel prediction={prediction} clock={clock} mode="with" label="With ASTRA" caption="diversions active — contained & clearing" />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <Metric label="Junctions jammed" without={`${withoutJammed}`} withv={`${withJammed}`} />
        <Metric label="Severe gridlock" without={`${withoutSevere}`} withv={`${withSevere}`} />
        <Metric label="Outcome" without="persists" withv={`${diversions} reroutes`} />
      </div>
    </div>
  );
}
