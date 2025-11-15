import { PassportStamp } from "../passport/types";
import { RouteDefinition } from "./types";

export function tallyCities(
  stamps: PassportStamp[],
  routes: RouteDefinition[]
) {
  const cityCounts: Record<string, number> = {};

  const routeMap = new Map(routes.map(r => [r.id, r]));

  for (const stamp of stamps) {
    const def = routeMap.get(stamp.routeId);
    if (!def) continue;

    cityCounts[def.city] = (cityCounts[def.city] || 0) + 1;
  }

  return cityCounts;
}

export function getUniqueRoutesRun(
  stamps: PassportStamp[]
): Set<string> {
  return new Set(stamps.map(s => s.routeId));
}
