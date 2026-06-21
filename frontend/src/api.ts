import axios from "axios";
import type { EventInput, FeedbackInput, Junction, Overview, Prediction } from "./types";

const api = axios.create({ 
  baseURL: "/api", 
  timeout: 20000,
  headers: {
    "ngrok-skip-browser-warning": "69420"
  }
});

export async function predict(input: EventInput): Promise<Prediction> {
  const { data } = await api.post<Prediction>("/predict", input);
  return data;
}

export async function postFeedback(fb: FeedbackInput) {
  const { data } = await api.post("/feedback", fb);
  return data as {
    saved: boolean;
    insight?: { delay_factors?: string[]; inferred_effective?: string; inferred_hours?: number; notes_summary?: string };
    structured?: { event_cause?: string; requires_road_closure?: boolean; veh_type?: string; priority?: string; description?: string; duration_hours?: number } | null;
    ingested?: boolean;
    retraining?: boolean;
    summary: { total: number; by_cause: Record<string, number> };
  };
}

export async function postLiveIncident(payload: {
  junction: string;
  cause?: string;
  hour?: number;
  weekday?: number;
  congestion?: number;
  vehicle_count?: number;
  road_closure?: boolean;
  note?: string;
}): Promise<{ input: EventInput; prediction: Prediction; ingested: boolean }> {
  const { data } = await api.post("/live/incident", payload);
  return data as { input: EventInput; prediction: Prediction; ingested: boolean };
}

export async function getJunctions(): Promise<Junction[]> {
  const { data } = await api.get<Junction[]>("/junctions");
  return data;
}

export async function getOverview(): Promise<Overview> {
  const { data } = await api.get<Overview>("/stats/overview");
  return data;
}

export async function mapplsStatus(): Promise<{ configured: boolean }> {
  const { data } = await api.get<{ configured: boolean }>("/mappls/status");
  return data;
}

export async function mapplsToken(): Promise<string> {
  const { data } = await api.get<{ token: string }>("/mappls/token");
  return data.token;
}

export async function mapplsDirections(source: string, destination: string) {
  const { data } = await api.post("/mappls/directions", { source, destination });
  return data as {
    distance_km: number | null;
    duration_min: number | null;
    path: { lat: number; lng: number }[];
  };
}
