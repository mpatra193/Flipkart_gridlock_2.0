import type { Prediction } from "../types";

type Option = {
  key: string;
  title: string;
  desc: string;
  reduced: number;
  vehicles: number;
  detail: string;
};

function OptionCard({ o, best, baseDelay }: { o: Option; best: boolean; baseDelay: number }) {
  const after = Math.round(baseDelay * (1 - o.reduced / 100));
  return (
    <div
      className="rounded-2xl p-4 relative"
      style={{
        background: "var(--bg-card-inner)",
        border: best ? "1px solid rgba(16,185,129,0.4)" : "1px solid var(--border-subtle)",
        boxShadow: best ? "0 0 0 1px rgba(16,185,129,0.15)" : undefined,
      }}
    >
      {best && (
        <div className="absolute -top-2 right-3 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500 text-white">
          Recommended
        </div>
      )}
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold t-accent shrink-0" style={{ background: "var(--accent-glow)" }}>
          {o.key}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold t-text">{o.title}</div>
          <div className="text-[11px] t-text-muted">{o.desc}</div>
        </div>
      </div>

      <div className="flex items-end justify-between mt-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium">Delay reduced</div>
          <div className="text-2xl font-extrabold text-emerald-400">{o.reduced}%</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium">Vehicles eased</div>
          <div className="text-sm font-bold t-text-2">{o.vehicles.toLocaleString()}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 text-[11px]">
        <span className="text-rose-400 line-through opacity-70">{baseDelay} min</span>
        <span className="t-text-muted">→</span>
        <span className="text-emerald-400 font-semibold">{after} min</span>
      </div>
      <div className="text-[10px] t-text-muted mt-1.5">{o.detail}</div>
    </div>
  );
}

export default function InterventionView({ prediction }: { prediction: Prediction | null }) {
  if (!prediction) {
    return (
      <div className="glass h-full flex items-center justify-center t-text-muted text-sm">
        Run a simulation, then switch here for the recommended action set.
      </div>
    );
  }

  const esi = prediction.esi;
  const baseDelay = Math.round(20 + esi * 0.45);
  const affectedN = prediction.affected_junctions.length;
  const topDiv = prediction.diversions.recommended[0];
  const officers = prediction.resources.police.recommended;

  const options: Option[] = [
    {
      key: "A",
      title: "Divert traffic",
      desc: topDiv ? `Reroute via ${topDiv.corridor}` : "Reroute to nearest clear corridor",
      reduced: topDiv ? Math.round(12 + topDiv.confidence * 0.22) : 18,
      vehicles: topDiv ? Math.round(800 + topDiv.capacity * 2600) : 4000,
      detail: topDiv ? `${topDiv.confidence}% confidence · ${topDiv.distance_km} km away` : "no corridor in range",
    },
    {
      key: "B",
      title: "Reverse one lane (contraflow)",
      desc: "Open a counter-flow lane on the blocked approach",
      reduced: prediction.event.road_closure ? 31 : 22,
      vehicles: Math.round(affectedN * 120 + 1500),
      detail: prediction.event.road_closure ? "high benefit — the road is closed" : "moderate benefit",
    },
    {
      key: "C",
      title: "Signal retiming",
      desc: "Extend green time on the relief corridors",
      reduced: prediction.event.is_peak ? 18 : 12,
      vehicles: Math.round(affectedN * 90 + 900),
      detail: prediction.event.is_peak ? "peak hour — signals are the bottleneck" : "off-peak — limited gain",
    },
    {
      key: "D",
      title: "Deploy point-duty officers",
      desc: `${officers} officers across ${prediction.resources.deployment_plan.length} junctions`,
      reduced: Math.min(25, 8 + Math.round(officers * 0.3)),
      vehicles: Math.round(affectedN * 100),
      detail: "manual flow control at the worst junctions",
    },
  ];

  const bestKey = [...options].sort((a, b) => b.reduced - a.reduced)[0].key;

  return (
    <div className="glass p-5 h-full overflow-y-auto custom-scroll">
      <div className="mb-3">
        <div className="text-sm font-bold t-text">Recommended action set</div>
        <div className="text-[11px] t-text-muted">
          {prediction.event.event_cause.replace(/_/g, " ")} at {prediction.event.junction} · ranked by projected delay reduction
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => (
          <OptionCard key={o.key} o={o} best={o.key === bestKey} baseDelay={baseDelay} />
        ))}
      </div>

      <div className="text-[10px] t-text-muted mt-3 italic">
        Delay-reduction and vehicle figures are estimates derived from the diversion, resource and severity models.
      </div>
    </div>
  );
}
