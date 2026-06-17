import type { Prediction } from "../types";

export default function DiversionPanel({ d }: { d: Prediction["diversions"] }) {
  return (
    <div className="glass p-4">
      <div className="text-sm font-semibold text-slate-200 mb-1">Diversions</div>
      <div className="text-[11px] text-slate-400 mb-2">
        Blocked corridor: <span className="text-slate-200">{d.blocked_corridor || "—"}</span>
      </div>

      <div className="space-y-2">
        {d.recommended.map((c, i) => (
          <div key={c.corridor} className="glass px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-100">
                {i === 0 ? "★ " : ""}
                {c.corridor}
              </span>
              <span className="text-emerald-300 text-sm font-semibold">{c.confidence}%</span>
            </div>
            <div className="text-[11px] text-slate-400">
              {c.distance_km} km · safety {(c.spillover_safety * 100).toFixed(0)}% · cap{" "}
              {(c.capacity * 100).toFixed(0)}%
            </div>
          </div>
        ))}
        {d.recommended.length === 0 && (
          <div className="text-[11px] text-slate-500">No alternate corridors in range.</div>
        )}
      </div>

      {d.avoid_junctions.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wide text-red-400 mb-1">Avoid</div>
          <div className="flex flex-wrap gap-1">
            {d.avoid_junctions.slice(0, 8).map((j) => (
              <span key={j} className="text-[10px] bg-red-500/15 text-red-300 px-2 py-0.5 rounded">
                {j}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
