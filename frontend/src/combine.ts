import type {
  AffectedJunction,
  DiversionCorridor,
  Prediction,
  RiskLevel,
  SimilarMatch,
} from "./types";

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

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? round1(s[m]) : round1((s[m - 1] + s[m]) / 2);
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

function mergeEsiComponents(preds: Prediction[]): Record<string, number> {
  const keys = new Set<string>();
  preds.forEach((p) => Object.keys(p.esi_components || {}).forEach((k) => keys.add(k)));
  const out: Record<string, number> = {};
  for (const k of keys) {
    out[k] = Math.max(...preds.map((p) => p.esi_components?.[k] ?? 0));
  }
  return out;
}

function mergeSimilar(preds: Prediction[]): Prediction["similar"] {
  const byId = new Map<string, SimilarMatch>();
  for (const p of preds) {
    for (const m of p.similar?.matches ?? []) {
      const prev = byId.get(m.id);
      if (!prev || m.similarity > prev.similarity) byId.set(m.id, m);
    }
  }
  const matches = [...byId.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 30);

  const durations = matches
    .map((m) => m.duration_hours)
    .filter((d): d is number => d != null);

  const min = durations.length ? round1(Math.min(...durations)) : null;
  const max = durations.length ? round1(Math.max(...durations)) : null;
  const mean = durations.length
    ? round1(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;
  const score = Math.min(...preds.map((p) => p.similar?.confidence?.score ?? 0));

  return {
    match_count: byId.size,
    matches,
    stats: { mean, median: median(durations), min, max },
    confidence: { score },
  };
}

function mergeDiversions(preds: Prediction[]): Prediction["diversions"] {
  const blocked = [
    ...new Set(
      preds.map((p) => p.diversions?.blocked_corridor).filter((c): c is string => !!c)
    ),
  ];
  const blockedSet = new Set(blocked);

  const byCorridor = new Map<string, DiversionCorridor>();
  for (const p of preds) {
    for (const c of p.diversions?.recommended ?? []) {
      const prev = byCorridor.get(c.corridor);
      if (!prev || c.confidence > prev.confidence) byCorridor.set(c.corridor, c);
    }
  }
  const recommended = [...byCorridor.values()]
    .filter((c) => !blockedSet.has(c.corridor))
    .sort((a, b) => b.confidence - a.confidence || b.score - a.score)
    .slice(0, 6);

  const avoid_junctions = [...new Set(preds.flatMap((p) => p.diversions?.avoid_junctions ?? []))];
  const caution_junctions = [
    ...new Set(preds.flatMap((p) => p.diversions?.caution_junctions ?? [])),
  ].filter((j) => !avoid_junctions.includes(j));

  return {
    blocked_corridor: blocked.length ? blocked.join(" + ") : null,
    recommended,
    avoid_junctions,
    caution_junctions,
  };
}

function mergeDelayFactors(preds: Prediction[]): Prediction["top_delay_factors"] {
  const m = new Map<string, number>();
  for (const p of preds) {
    for (const d of p.top_delay_factors ?? []) {
      m.set(d.factor, (m.get(d.factor) ?? 0) + d.count);
    }
  }
  if (m.size === 0) return undefined;
  return [...m.entries()]
    .map(([factor, count]) => ({ factor, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function mergePastReports(preds: Prediction[]): Prediction["past_reports"] {
  if (!preds.some((p) => p.past_reports)) return undefined;
  let count = 0;
  let weightedSum = 0;
  let weightN = 0;
  for (const p of preds) {
    const pr = p.past_reports;
    if (!pr) continue;
    count += pr.count;
    if (pr.avg_actual_hours != null) {
      weightedSum += pr.avg_actual_hours * pr.count;
      weightN += pr.count;
    }
  }
  return { count, avg_actual_hours: weightN ? round1(weightedSum / weightN) : null };
}

const CONF_RANK: Record<string, number> = {
  high: 3,
  strong: 3,
  medium: 2,
  moderate: 2,
  low: 1,
  limited: 1,
  sparse: 1,
  none: 0,
};

function weakest(
  preds: Prediction[],
  pick: (p: Prediction) => string | undefined | null
): string | undefined {
  let best: string | undefined;
  let bestRank = Infinity;
  for (const p of preds) {
    const v = pick(p);
    if (!v) continue;
    const r = CONF_RANK[v.toLowerCase()] ?? 1;
    if (r < bestRank) {
      bestRank = r;
      best = v;
    }
  }
  return best;
}

export function combinePredictions(preds: Prediction[]): Prediction {
  if (preds.length === 1) return preds[0];

  const base = structuredClone(preds[0]);

  // Combined severity via probabilistic OR — two events together are worse than either alone.
  const esi = round1(100 * (1 - preds.reduce((acc, p) => acc * (1 - p.esi / 100), 1)));
  const affected = mergeAffected(preds);
  const similar = mergeSimilar(preds);

  const longProbs = preds
    .map((p) => p.long_event_probability)
    .filter((x): x is number => x != null);

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
    esi_components: mergeEsiComponents(preds),
    impact_radius_km: Math.max(...preds.map((p) => p.impact_radius_km)),
    duration_hours: Math.max(...preds.map((p) => p.duration_hours)),
    planning_duration_hours: Math.max(
      ...preds.map((p) => p.planning_duration_hours ?? p.duration_hours)
    ),
    duration_p90: Math.max(...preds.map((p) => p.duration_p90 ?? p.duration_hours)),
    duration_p10: Math.min(...preds.map((p) => p.duration_p10 ?? p.duration_hours)),
    long_event_probability: longProbs.length ? Math.max(...longProbs) : null,
    confidence: Math.min(...preds.map((p) => p.confidence)),
    duration_source: preds.every((p) => p.duration_source === base.duration_source)
      ? base.duration_source
      : "combined",
    // A single-event calibration factor is meaningless once events are merged.
    calibration: undefined,
    data_support: weakest(preds, (p) => p.data_support) ?? base.data_support,
    location_confidence:
      weakest(preds, (p) => p.location_confidence) ?? base.location_confidence,
    past_reports: mergePastReports(preds),
    top_delay_factors: mergeDelayFactors(preds),
    similar_event_count: similar.match_count,
    similar,
    diversions: mergeDiversions(preds),
    affected_junctions: affected,
    resources: mergeResources(preds),
    incidents,
    event_count: preds.length,
  };
}
