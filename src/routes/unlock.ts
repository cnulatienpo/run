import { PassportStamp } from "../passport/types";
import { RouteDefinition } from "./types";
import { tallyCities } from "./analysis";

export function getUnlockedRoutes(
  stamps: PassportStamp[],
  routes: RouteDefinition[]
): string[] {
  const unlocked: string[] = [];
  const cityCounts = tallyCities(stamps, routes);
  const totalMiles = stamps.reduce((s, r) => s + (r.miles || 0), 0);

  for (const route of routes) {
    if (route.unlockedByDefault) {
      unlocked.push(route.id);
      continue;
    }

    const cond = route.unlockCondition;
    if (!cond) continue;

    if (cond.type === "sessions") {
      if (stamps.length >= cond.target) unlocked.push(route.id);
    }

    if (cond.type === "miles") {
      if (totalMiles >= cond.target) unlocked.push(route.id);
    }

    if (cond.type === "city_sessions") {
      if (cityCounts[cond.city!] >= cond.target)
        unlocked.push(route.id);
    }

    if (cond.type === "badge") {
      // Later, when badge tracking is stored persistently
      // unlocked.push(route.id)
    }
  }

  return unlocked;
}
