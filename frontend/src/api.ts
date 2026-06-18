import axios from "axios";
import type { EventInput, FeedbackInput, Junction, Overview, Prediction } from "./types";

const api = axios.create({ baseURL: "/api", timeout: 20000 });

export async function predict(input: EventInput): Promise<Prediction> {
  const { data } = await api.post<Prediction>("/predict", input);
  return data;
}

export async function postFeedback(fb: FeedbackInput) {
  const { data } = await api.post("/feedback", fb);
  return data as { saved: boolean; summary: { total: number; by_cause: Record<string, number> } };
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
