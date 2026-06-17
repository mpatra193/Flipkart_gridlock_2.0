import type { Overview } from "../types";

export default function OverviewView({ overview }: { overview: Overview | null }) {
  if (!overview) return <div className="text-slate-400 text-sm">Loading overview…</div>;

  const cards = [
    { label: "Total events", value: overview.total_events },
    { label: "Mean ESI", value: overview.mean_esi },
    { label: "Junctions", value: overview.junction_count },
    { label: "Corridors", value: overview.corridor_count },
  ];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="grid grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="glass p-4">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{c.label}</div>
            <div className="text-2xl font-bold text-slate-100">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="glass p-4">
        <div className="text-sm font-semibold text-slate-200 mb-2">Events by risk level</div>
        <div className="space-y-2">
          {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((k) => {
            const n = overview.by_risk[k] || 0;
            const pct = (100 * n) / overview.total_events;
            return (
              <div key={k} className="flex items-center gap-3 text-xs">
                <span className={`w-20 risk-${k}`}>{k}</span>
                <div className="flex-1 h-3 bg-slate-700/40 rounded">
                  <div className={`h-full rounded bg-current risk-${k}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-24 text-right text-slate-400">
                  {n} ({pct.toFixed(1)}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass p-4">
        <div className="text-sm font-semibold text-slate-200 mb-2">Top risk junctions</div>
        <div className="grid grid-cols-2 gap-2">
          {overview.top_junctions.map((j) => (
            <div key={j.junction} className="flex items-center justify-between text-xs glass px-3 py-1.5">
              <span className="truncate text-slate-300">{j.junction}</span>
              <span className="text-slate-400">
                {j.incident_count} · <span className="text-orange-300">{j.risk_score}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
