import type { Prediction } from "../types";

const LABELS: Record<string, string> = {
  cause: "Cause severity",
  duration: "Expected duration",
  closure: "Road closure",
  time: "Time of day",
  junction: "Junction risk",
};

function magnitude(v: number) {
  if (v >= 60) return { t: "Major", c: "text-rose-400" };
  if (v >= 30) return { t: "Moderate", c: "text-amber-400" };
  return { t: "Minor", c: "t-text-muted" };
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="t-text-muted">{label}</span>
      <span className="t-text-2 font-semibold">{value}</span>
    </div>
  );
}

export default function WhyPanel({ p }: { p: Prediction }) {
  const drivers = Object.entries(p.esi_components).sort((a, b) => b[1] - a[1]);
  const top = drivers.slice(0, 2).map(([k]) => LABELS[k] || k);
  const longRisk = p.long_event_probability != null ? Math.round(p.long_event_probability * 100) : null;

  return (
    <div className="glass p-5">
      <div className="text-sm font-semibold t-text mb-1">Why this prediction</div>
      <div className="text-xs t-text-3 leading-relaxed mb-3">
        Rated <span className={`risk-${p.risk_level} font-semibold`}>{p.risk_level}</span> ({p.esi.toFixed(1)}/100),
        driven mainly by {top.join(" and ").toLowerCase()}.
      </div>

      <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-2">Severity drivers</div>
      <div className="space-y-1.5 mb-4">
        {drivers.map(([k, v]) => {
          const g = magnitude(v);
          return (
            <div key={k} className="flex items-center justify-between text-[11px]">
              <span className="t-text-3">{LABELS[k] || k}</span>
              <span className={`font-semibold ${g.c}`}>{g.t}</span>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-2">Confidence factors</div>
      <div className="space-y-1.5 text-[11px]">
        <Row label="Model confidence" value={`${p.confidence}%`} />
        {longRisk != null && <Row label="Long-event (>6 h) risk" value={`${longRisk}%`} />}
        {p.data_support && <Row label="Historical support" value={cap(p.data_support)} />}
        <Row label="Similar past events" value={`${p.similar_event_count}`} />
        {p.location_confidence && <Row label="Location data" value={p.location_confidence} />}
        {p.past_reports && p.past_reports.count > 0 && (
          <Row
            label="Logged outcomes"
            value={`${p.past_reports.count}${p.past_reports.avg_actual_hours != null ? ` · avg ${p.past_reports.avg_actual_hours} h` : ""}`}
          />
        )}
      </div>

      {p.top_delay_factors && p.top_delay_factors.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-2">Common delay causes</div>
          <div className="flex flex-wrap gap-1.5">
            {p.top_delay_factors.map((d) => (
              <span
                key={d.factor}
                className="text-[10px] px-2 py-0.5 rounded-md t-text-2"
                style={{ background: "var(--bg-card-inner)" }}
              >
                {d.factor.replace(/_/g, " ")}{d.count > 1 ? ` ×${d.count}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
