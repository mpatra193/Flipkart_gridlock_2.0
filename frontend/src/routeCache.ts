import { mapplsDirections } from "./api";
import type { Prediction } from "./types";

export type RoutePath = { lat: number; lng: number }[];
export type RouteResult = { path: RoutePath; distance_km: number | null; duration_min: number | null };

const cache = new Map<string, Promise<RouteResult>>();

function key(source: string, destination: string) {
  return `${source}__${destination}`;
}

export function cachedDirections(source: string, destination: string): Promise<RouteResult> {
  const k = key(source, destination);
  let p = cache.get(k);
  if (!p) {
    p = mapplsDirections(source, destination).catch((e) => {
      cache.delete(k);
      throw e;
    });
    cache.set(k, p);
  }
  return p;
}

export function peekRoute(source: string, destination: string): Promise<RouteResult> | undefined {
  return cache.get(key(source, destination));
}

export function warmEscapeRoutes(pred: Prediction) {
  const jammed = pred.affected_junctions.filter((a) => a.escape && (a.risk === "HIGH" || a.risk === "MEDIUM"));
  for (const a of jammed) {
    cachedDirections(`${a.lat},${a.lon}`, `${a.escape!.to_lat},${a.escape!.to_lon}`).catch(() => {});
  }
}
