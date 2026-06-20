import type { Resources } from "../types";
import { IconOfficer, IconBarrier, IconPatrol } from "./icons";

export default function ResourcePanel({ r }: { r: Resources }) {
  const items = [
    { icon: <IconOfficer className="w-5 h-5 mx-auto mb-1 text-cyan-400 opacity-80" />, label: "Officers", value: r.police.recommended, color: "text-cyan-400" },
    { icon: <IconBarrier className="w-5 h-5 mx-auto mb-1 text-amber-400 opacity-80" />, label: "Barricades", value: r.barricades.total, color: "text-amber-400" },
    { icon: <IconPatrol className="w-5 h-5 mx-auto mb-1 text-emerald-400 opacity-80" />, label: "Patrol", value: r.patrol_vehicles, color: "text-emerald-400" },
  ];

  return (
    <div className="glass p-5">
      <div className="text-sm font-semibold t-text mb-3">Resource Deployment</div>

      <div className="grid grid-cols-3 gap-2">
        {items.map((it) => (
          <div
            key={it.label}
            className="rounded-xl py-3 text-center transition-colors"
            style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)' }}
          >
            {it.icon}
            <div className={`text-xl font-bold ${it.color}`}>{it.value}</div>
            <div className="text-[11px] t-text-2 font-semibold mt-1 tracking-wide">{it.label}</div>
          </div>
        ))}
      </div>

      <div
        className="text-[11px] t-text-3 mt-4 leading-relaxed p-2.5 rounded-lg"
        style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex gap-5 justify-center">
          <span className="font-medium t-text">Point duty: <strong className="text-cyan-400">{r.police.point_duty}</strong></span>
          <span className="font-medium t-text">Perimeter: <strong className="text-cyan-400">{r.police.perimeter}</strong></span>
          <span className="font-medium t-text">Site: <strong className="text-cyan-400">{r.police.site}</strong></span>
        </div>
      </div>

      {r.deployment_plan.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-2">Deployment Plan</div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scroll">
            {r.deployment_plan.slice(0, 12).map((d) => (
              <div
                key={d.junction}
                className="flex items-center justify-between text-[11px] rounded-lg px-2.5 py-2 transition-all"
                style={{ background: 'var(--bg-card-inner)' }}
              >
                <span className={`risk-${d.risk} text-[8px] shrink-0 mr-2`}>●</span>
                <span className="flex-1 truncate t-text-2 pr-2">{d.junction}</span>
                <span className="flex items-center gap-2 t-text-3 font-medium shrink-0">
                  <span className="flex items-center gap-1"><IconOfficer className="w-3.5 h-3.5 text-cyan-400/70" /> {d.officers}</span>
                  <span className="flex items-center gap-1"><IconBarrier className="w-3.5 h-3.5 text-amber-400/70" /> {d.barricades}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
