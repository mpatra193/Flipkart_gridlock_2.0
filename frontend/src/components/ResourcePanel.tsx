import type { Resources } from "../types";

export default function ResourcePanel({ r }: { r: Resources }) {
  return (
    <div className="glass p-4">
      <div className="text-sm font-semibold text-slate-200 mb-2">Resource Deployment</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="glass py-2">
          <div className="text-2xl font-bold text-cyan-300">{r.police.recommended}</div>
          <div className="text-[10px] text-slate-400">officers{r.police.capped ? " (cap)" : ""}</div>
        </div>
        <div className="glass py-2">
          <div className="text-2xl font-bold text-amber-300">{r.barricades.total}</div>
          <div className="text-[10px] text-slate-400">barricades</div>
        </div>
        <div className="glass py-2">
          <div className="text-2xl font-bold text-emerald-300">{r.patrol_vehicles}</div>
          <div className="text-[10px] text-slate-400">patrol</div>
        </div>
      </div>

      <div className="text-[11px] text-slate-400 mt-2">
        Point duty {r.police.point_duty} · perimeter {r.police.perimeter} · site {r.police.site} ·
        barricades {r.barricades.site} site + {r.barricades.diversion} diversion
      </div>

      {r.deployment_plan.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Deployment plan</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {r.deployment_plan.slice(0, 12).map((d) => (
              <div key={d.junction} className="flex items-center justify-between text-[11px]">
                <span className={`risk-${d.risk}`}>●</span>
                <span className="flex-1 px-2 truncate text-slate-300">{d.junction}</span>
                <span className="text-slate-400">{d.officers}👮 {d.barricades}🚧</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
