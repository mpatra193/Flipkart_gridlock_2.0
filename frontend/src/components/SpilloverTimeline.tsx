import type { Prediction } from "../types";

const DOT: Record<string, string> = {
  HIGH: "bg-rose-500",
  MEDIUM: "bg-orange-500",
  LOW: "bg-amber-400",
};

export default function SpilloverTimeline({ p }: { p: Prediction }) {
  const items = p.affected_junctions
    .filter((a) => a.eta_min != null)
    .slice()
    .sort((a, b) => a.eta_min! - b.eta_min!)
    .slice(0, 12);

  if (items.length < 2) return null;

  return (
    <div className="glass p-5">
      <div className="text-sm font-semibold t-text mb-1">Spillover timeline</div>
      <div className="text-xs t-text-muted mb-3">Estimated order congestion spreads from the event</div>

      <div className="relative pl-5">
        <div className="absolute left-[6px] top-1.5 bottom-1.5 w-px" style={{ background: "var(--border-subtle)" }} />
        {items.map((a, i) => (
          <div key={a.junction} className="relative flex items-center gap-2 mb-2.5 last:mb-0">
            <div
              className={`absolute -left-5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ${DOT[a.risk] || "bg-slate-500"}`}
              style={{ boxShadow: "0 0 0 2px var(--bg-card)" }}
            />
            <div className="w-12 text-[11px] font-bold t-text-2">
              {i === 0 ? "now" : `+${Math.round(a.eta_min!)}m`}
            </div>
            <div className="flex-1 text-[11px] t-text-3 truncate">{a.junction}</div>
            <div className={`text-[9px] font-bold risk-${a.risk}`}>{a.risk}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
