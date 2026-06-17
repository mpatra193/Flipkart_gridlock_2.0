import type { Prediction } from "../types";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-100">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

export default function PredictionPanel({ p }: { p: Prediction }) {
  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Event Severity</div>
          <div className={`text-4xl font-bold risk-${p.risk_level}`}>{p.esi.toFixed(1)}</div>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-semibold risk-${p.risk_level} bg-white/5`}>
          {p.risk_level}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <Stat
          label="Duration (P50)"
          value={`${p.duration_hours} h`}
          sub={p.duration_p10 != null && p.duration_p90 != null ? `P10–P90: ${p.duration_p10}–${p.duration_p90} h` : p.duration_source}
        />
        <Stat
          label="Plan for (P90)"
          value={p.planning_duration_hours != null ? `${p.planning_duration_hours} h` : `${p.duration_hours} h`}
          sub="worst-case"
        />
        <Stat label="Impact radius" value={`${p.impact_radius_km} km`} />
        <Stat
          label="Long-event risk"
          value={p.long_event_probability != null ? `${Math.round(p.long_event_probability * 100)}%` : "—"}
          sub=">6 h probability"
        />
        <Stat label="Confidence" value={`${p.confidence}%`} sub="P10–P90 band" />
        <Stat label="Affected" value={`${p.affected_junctions.length}`} sub="junctions" />
      </div>

      <div className="mt-3 space-y-1">
        {Object.entries(p.esi_components).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-[11px]">
            <span className="w-16 text-slate-400 capitalize">{k}</span>
            <div className="flex-1 h-1.5 bg-slate-700/50 rounded">
              <div className="h-full bg-cyan-400/70 rounded" style={{ width: `${v}%` }} />
            </div>
            <span className="w-8 text-right text-slate-300">{v.toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
