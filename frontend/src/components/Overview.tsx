import type { Overview } from "../types";

export default function OverviewView({ overview }: { overview: Overview | null }) {
  if (!overview) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="t-text-muted text-sm flex items-center gap-2">
          <svg className="animate-spin h-4 w-4 text-cyan-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          Loading overview…
        </div>
      </div>
    );
  }

  const cards = [
    { label: "Total events", value: overview.total_events, color: "text-cyan-400" },
    { label: "Mean ESI", value: overview.mean_esi, color: "text-amber-400" },
    { label: "Junctions", value: overview.junction_count, color: "text-emerald-400" },
    { label: "Corridors", value: overview.corridor_count, color: "text-violet-400" },
  ];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="grid grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="glass p-5 transition-colors duration-200">
            <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-2">{c.label}</div>
            <div className={`text-3xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="glass p-5">
        <div className="text-sm font-semibold t-text mb-4">Events by Risk Level</div>
        <div className="space-y-3">
          {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((k) => {
            const n = overview.by_risk[k] || 0;
            const pct = (100 * n) / overview.total_events;
            return (
              <div key={k} className="flex items-center gap-3 text-xs">
                <span className={`w-20 risk-${k} font-semibold`}>{k}</span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-card-inner)' }}>
                  <div
                    className={`h-full rounded-full bg-current risk-${k} transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-24 text-right t-text-muted font-medium">
                  {n} ({pct.toFixed(1)}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass p-5">
        <div className="text-sm font-semibold t-text mb-4">Top Risk Junctions</div>
        <div className="grid grid-cols-2 gap-2">
          {overview.top_junctions.map((j) => (
            <div
              key={j.junction}
              className="flex items-center justify-between text-xs rounded-xl px-3 py-2.5 transition-colors duration-200"
              style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)' }}
            >
              <span className="truncate t-text-2 font-medium">{j.junction}</span>
              <span className="t-text-muted shrink-0 ml-2">
                {j.incident_count} · <span className="text-orange-400 font-semibold">{j.risk_score}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
