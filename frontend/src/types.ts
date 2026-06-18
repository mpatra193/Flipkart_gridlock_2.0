export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface EventInput {
  event_cause: string;
  junction?: string | null;
  corridor?: string | null;
  zone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  hour: number;
  weekday: number;
  road_closure: boolean;
  priority_high: boolean;
  duration_override?: number | null;
  veh_type?: string | null;
  event_type?: string | null;
  police_station?: string | null;
}

export interface EscapeRoute {
  to_lat: number;
  to_lon: number;
  to_label: string;
  direction: string;
  avoid: string[];
  confidence: number;
  reason: string[];
}

export interface AffectedJunction {
  junction: string;
  lat: number;
  lon: number;
  congestion: number;
  risk: RiskLevel;
  junction_risk?: number;
  corridor?: string | null;
  escape?: EscapeRoute | null;
}

export interface PoliceBreakdown {
  point_duty: number;
  perimeter: number;
  site: number;
  raw_total: number;
  recommended: number;
  capped: boolean;
  high_junctions: number;
  medium_junctions: number;
  low_junctions: number;
}

export interface Resources {
  police: PoliceBreakdown;
  barricades: { site: number; diversion: number; total: number };
  patrol_vehicles: number;
  deployment_plan: {
    junction: string;
    risk: RiskLevel;
    officers: number;
    barricades: number;
    congestion: number;
  }[];
}

export interface DiversionCorridor {
  corridor: string;
  distance_km: number;
  score: number;
  confidence: number;
  active_incidents: number;
  reliability: number;
  capacity: number;
  spillover_safety: number;
  proximity: number;
}

export interface SimilarMatch {
  id: string;
  similarity: number;
  event_cause: string;
  junction: string | null;
  road_closure: number;
  duration_hours: number;
  esi: number | null;
  start: string | null;
}

export interface Prediction {
  event: {
    event_cause: string;
    junction: string | null;
    corridor: string | null;
    latitude: number;
    longitude: number;
    hour: number;
    weekday: number;
    is_peak: boolean;
    road_closure: boolean;
  };
  esi: number;
  risk_level: RiskLevel;
  esi_components: Record<string, number>;
  duration_hours: number;
  duration_p10?: number;
  duration_p90?: number;
  planning_duration_hours?: number;
  long_event_probability?: number | null;
  duration_source: string;
  impact_radius_km: number;
  confidence: number;
  data_support?: string;
  location_confidence?: string;
  similar_event_count: number;
  affected_junctions: AffectedJunction[];
  similar: {
    match_count: number;
    matches: SimilarMatch[];
    stats: { mean: number | null; median: number | null; min: number | null; max: number | null };
    confidence: { score: number };
  };
  diversions: {
    blocked_corridor: string | null;
    recommended: DiversionCorridor[];
    avoid_junctions: string[];
    caution_junctions: string[];
  };
  resources: Resources;
}

export interface Junction {
  junction: string;
  lat: number;
  lon: number;
  incident_count: number;
  risk_score: number;
  police_station?: string | null;
  zone?: string | null;
}

export interface Overview {
  total_events: number;
  by_risk: Record<RiskLevel, number>;
  mean_esi: number;
  junction_count: number;
  corridor_count: number;
  top_junctions: { junction: string; incident_count: number; risk_score: number }[];
}
