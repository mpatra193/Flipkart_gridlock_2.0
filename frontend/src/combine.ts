import type { AffectedJunction, Prediction, RiskLevel } from "./types";

function riskFromEsi(esi: number): RiskLevel {
  if (esi < 30) return "LOW";
  if (esi < 60) return "MEDIUM";
  if (esi < 80) return "HIGH";
  return "CRITICAL";
}

function riskFromCongestion(c: number): RiskLevel {
  if (c > 0.6) return "HIGH";
  if (c >= 0.3) return "MEDIUM";
  return "LOW";
}

function mergeAffected(preds: Prediction[]): AffectedJunction[] {
  const byJunction = new Map<string, AffectedJunction>();
  for (const p of preds) {
    for (const a of p.affected_junctions) {
      const prev = byJunction.get(a.junction);
      if (!prev) {
        byJunction.set(a.junction, { ...a });
        continue;
      }
      const congestion = Math.max(prev.congestion ?? 0, a.congestion ?? 0);
      byJunction.set(a.junction, {
        ...prev,
        congestion,
        risk: riskFromCongestion(congestion),
        eta_min: Math.min(prev.eta_min ?? Infinity, a.eta_min ?? Infinity),
        escape: prev.escape ?? a.escape ?? null,
      });
    }
  }
  return [...byJunction.values()].sort((x, y) => (y.congestion ?? 0) - (x.congestion ?? 0));
}

function mergeResources(preds: Prediction[]): Prediction["resources"] {
  const base = preds[0].resources;
  const sum = (pick: (r: Prediction["resources"]) => number) =>
    preds.reduce((acc, p) => acc + pick(p.resources), 0);

  const plan = new Map<string, Prediction["resources"]["deployment_plan"][number]>();
  for (const p of preds) {
    for (const d of p.resources.deployment_plan) {
      const prev = plan.get(d.junction);
      if (!prev || d.officers > prev.officers) plan.set(d.junction, d);
    }
  }
  const deployment_plan = [...plan.values()]
    .sort((a, b) => b.officers - a.officers || b.congestion - a.congestion)
    .slice(0, 40);

  return {
    ...base,
    police: {
      ...base.police,
      point_duty: sum((r) => r.police.point_duty),
      perimeter: sum((r) => r.police.perimeter),
      site: sum((r) => r.police.site),
      raw_total: sum((r) => r.police.raw_total),
      recommended: Math.min(50, sum((r) => r.police.recommended)),
      capped: sum((r) => r.police.recommended) > 50,
      high_junctions: sum((r) => r.police.high_junctions),
      medium_junctions: sum((r) => r.police.medium_junctions),
      low_junctions: sum((r) => r.police.low_junctions),
    },
    barricades: {
      site: sum((r) => r.barricades.site),
      diversion: sum((r) => r.barricades.diversion),
      total: sum((r) => r.barricades.total),
    },
    patrol_vehicles: Math.min(8, sum((r) => r.patrol_vehicles)),
    deployment_plan,
  };
}

export function combinePredictions(preds: Prediction[]): Prediction {
  if (preds.length === 1) return preds[0];

  const base = structuredClone(preds[0]);
  const esi = Math.round((100 * (1 - preds.reduce((acc, p) => acc * (1 - p.esi / 100), 1))) * 10) / 10;
  const affected = mergeAffected(preds);

  const incidents = preds.map((p) => ({
    lat: p.event.latitude,
    lon: p.event.longitude,
    impact_radius_km: p.impact_radius_km,
    label: p.event.junction || p.event.event_cause.replace(/_/g, " "),
    esi: p.esi,
  }));

  return {
    ...base,
    esi,
    risk_level: riskFromEsi(esi),
    impact_radius_km: Math.max(...preds.map((p) => p.impact_radius_km)),
    duration_hours: Math.max(...preds.map((p) => p.duration_hours)),
    planning_duration_hours: Math.max(
      ...preds.map((p) => p.planning_duration_hours ?? p.duration_hours)
    ),
    duration_p90: Math.max(...preds.map((p) => p.duration_p90 ?? p.duration_hours)),
    duration_p10: Math.min(...preds.map((p) => p.duration_p10 ?? p.duration_hours)),
    affected_junctions: affected,
    resources: mergeResources(preds),
    incidents,
    event_count: preds.length,
  };
}
