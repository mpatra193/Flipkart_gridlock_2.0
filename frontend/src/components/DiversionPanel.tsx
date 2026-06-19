import { useState } from "react";
import type { DiversionCorridor, Prediction } from "../types";
import DiversionDetail from "./DiversionDetail";

export default function DiversionPanel({ d, origin, onHover }: { d: Prediction["diversions"]; origin: { lat: number; lng: number }; onHover?: (c: DiversionCorridor | null) => void }) {
  const [selected, setSelected] = useState<DiversionCorridor | null>(null);
  return (
    <div className="glass p-5">
      <div className="text-sm font-semibold t-text mb-3">Diversions</div>

      <div className="text-[11px] t-text-muted mb-1">
        Blocked corridor: <span className="t-text-2 font-medium">{d.blocked_corridor || "—"}</span>
      </div>
      <div className="text-[10px] t-text-muted mb-3 italic">tap a corridor for the reroute map & impact</div>

      <div className="space-y-2">
        {d.recommended.map((c, i) => (
          <div
            key={c.corridor}
            onClick={() => setSelected(c)}
            onMouseEnter={() => onHover?.(c)}
            onMouseLeave={() => onHover?.(null)}
            className={`rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer hover:brightness-125 ${
              i === 0 ? 'border-emerald-500/20' : ''
            }`}
            style={{
              background: 'var(--bg-card-inner)',
              border: i === 0 ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm t-text font-medium">
                {i === 0 && <span className="text-amber-400 mr-1">*</span>}
                {c.corridor}
              </span>
              <span className="text-emerald-400 text-xs font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md">{c.confidence}%</span>
            </div>
            <div className="text-[11px] t-text-muted mt-1">
              {c.distance_km} km · safety {(c.spillover_safety * 100).toFixed(0)}% · cap{" "}
              {(c.capacity * 100).toFixed(0)}%
            </div>
          </div>
        ))}
        {d.recommended.length === 0 && (
          <div className="text-[11px] t-text-muted text-center py-3">No alternate corridors in range.</div>
        )}
      </div>

      {d.avoid_junctions.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="text-[10px] uppercase tracking-wider text-red-400 font-medium mb-2">Avoid</div>
          <div className="flex flex-wrap gap-1.5">
            {d.avoid_junctions.slice(0, 8).map((j) => (
              <span key={j} className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded-lg border border-red-500/10 font-medium">
                {j}
              </span>
            ))}
          </div>
        </div>
      )}
      {selected && <DiversionDetail diversion={selected} origin={origin} onClose={() => setSelected(null)} />}
    </div>
  );
}
