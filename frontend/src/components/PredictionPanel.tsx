import type { Prediction } from "../types";

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)' }}>
      <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium">{label}</div>
      <div className={`text-lg font-bold mt-0.5 ${accent || 't-text'}`}>{value}</div>
      {sub && <div className="text-[10px] t-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export default function PredictionPanel({ p }: { p: Prediction }) {
  const severityVars: Record<string, { from: string; to: string; border: string }> = {
    LOW: { from: 'var(--severity-low-from)', to: 'var(--severity-low-to)', border: 'var(--severity-low-border)' },
    MEDIUM: { from: 'var(--severity-medium-from)', to: 'var(--severity-medium-to)', border: 'var(--severity-medium-border)' },
    HIGH: { from: 'var(--severity-high-from)', to: 'var(--severity-high-to)', border: 'var(--severity-high-border)' },
    CRITICAL: { from: 'var(--severity-critical-from)', to: 'var(--severity-critical-to)', border: 'var(--severity-critical-border)' },
  };

  const sv = severityVars[p.risk_level] || severityVars.MEDIUM;

  return (
    <div className="glass p-5">
      {/* Severity Header */}
      <div
        className="flex items-center justify-between p-3 rounded-xl mb-4"
        style={{
          background: `linear-gradient(to right, ${sv.from}, ${sv.to})`,
          border: `1px solid ${sv.border}`,
        }}
      >
        <div>
          <div className="text-[10px] uppercase tracking-wider t-text-3 font-medium">Event Severity</div>
          <div className={`text-3xl font-extrabold risk-${p.risk_level} mt-0.5`}>{p.esi.toFixed(1)}</div>
        </div>
        <div
          className={`px-3 py-1.5 rounded-lg text-xs font-bold risk-${p.risk_level} uppercase tracking-wider`}
          style={{ background: 'var(--bg-card-inner)' }}
        >
          {p.risk_level}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Expected duration"
          value={`${p.duration_hours} h`}
          sub={p.duration_p10 != null && p.duration_p90 != null ? `P10–P90: ${p.duration_p10}–${p.duration_p90} h` : p.duration_source}
        />
        <Stat
          label="Contingency duration"
          value={p.planning_duration_hours != null ? `${p.planning_duration_hours} h` : `${p.duration_hours} h`}
          sub="P90 worst-case"
        />
        <Stat label="Impact radius" value={`${p.impact_radius_km} km`} accent="text-orange-400" />
        <Stat
          label="Long-event risk"
          value={p.long_event_probability != null ? `${Math.round(p.long_event_probability * 100)}%` : "—"}
          sub=">6 h probability"
        />
        <Stat label="Confidence" value={`${p.confidence}%`} sub="P10–P90 band" accent="text-cyan-400" />
        <Stat label="Affected" value={`${p.affected_junctions.length}`} sub="junctions" />
        <Stat label="Location conf" value={p.location_confidence ?? "—"} sub="data completeness" />
        <Stat
          label="Data support"
          value={p.data_support ? p.data_support[0].toUpperCase() + p.data_support.slice(1) : "—"}
          sub="historical sample"
        />
      </div>

      {/* ESI Breakdown */}
      <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-2">ESI Breakdown</div>
        <div className="space-y-2">
          {Object.entries(p.esi_components).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-[11px]">
              <span className="w-16 t-text-3 capitalize font-medium">{k}</span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-card-inner)' }}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-500"
                  style={{ width: `${v}%` }}
                />
              </div>
              <span className="w-8 text-right t-text-2 font-semibold">{v.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
