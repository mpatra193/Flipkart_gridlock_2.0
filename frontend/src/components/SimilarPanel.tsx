import type { Prediction } from "../types";

export default function SimilarPanel({ s }: { s: Prediction["similar"] }) {
  return (
    <div className="glass p-4">
      <div className="text-sm font-semibold text-slate-200 mb-1">Similar Past Events</div>
      <div className="text-[11px] text-slate-400 mb-2">
        {s.match_count} matches · confidence {s.confidence.score}%
        {s.stats.median != null && (
          <>
            {" "}
            · median {s.stats.median}h (min {s.stats.min}h, max {s.stats.max}h)
          </>
        )}
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {s.matches.map((m) => (
          <div key={m.id} className="flex items-center justify-between text-[11px] glass px-2 py-1">
            <span className="text-cyan-300 w-10">{m.similarity}%</span>
            <span className="flex-1 px-2 truncate text-slate-300">
              {m.event_cause.replace(/_/g, " ")}
              {m.junction ? ` · ${m.junction}` : ""}
            </span>
            <span className="text-slate-400">{m.duration_hours}h</span>
          </div>
        ))}
        {s.matches.length === 0 && <div className="text-[11px] text-slate-500">No similar events found.</div>}
      </div>
    </div>
  );
}
