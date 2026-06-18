import type { Prediction } from "../types";

export default function SimilarPanel({ s }: { s: Prediction["similar"] }) {
  return (
    <div className="glass p-5">
      <div className="text-sm font-semibold t-text mb-3">Similar Past Events</div>

      <div className="text-[11px] t-text-muted mb-3 leading-relaxed">
        {s.match_count} matches · confidence <span className="text-cyan-400 font-semibold">{s.confidence.score}%</span>
        {s.stats.median != null && (
          <>
            {" "} · median {s.stats.median}h (min {s.stats.min}h, max {s.stats.max}h)
          </>
        )}
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scroll">
        {s.matches.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between text-[11px] rounded-lg px-3 py-2 transition-colors"
            style={{ background: 'var(--bg-card-inner)' }}
          >
            <span className="text-cyan-400 w-10 font-bold">{m.similarity}%</span>
            <span className="flex-1 px-2 truncate t-text-2">
              {m.event_cause.replace(/_/g, " ")}
              {m.junction ? ` · ${m.junction}` : ""}
            </span>
            <span className="t-text-muted font-medium">{m.duration_hours}h</span>
          </div>
        ))}
        {s.matches.length === 0 && <div className="text-[11px] t-text-muted text-center py-3">No similar events found.</div>}
      </div>
    </div>
  );
}
