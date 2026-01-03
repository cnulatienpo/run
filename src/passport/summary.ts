import { PassportStamp } from "./types";
import { RouteDefinition } from "./routes/types";
import { MILESTONES, evaluateMilestones } from "../milestones/list";
import { BADGES, getUnlockedBadges } from "../badges/list";
import { tallyCities } from "./routes/analysis";
import { getUnlockedRoutes } from "./routes/unlock";

export function buildPassportSummary(
  stamps: PassportStamp[],
  routes: RouteDefinition[]
) {
  const totalMiles = stamps.reduce((t, s) => t + (s.miles || 0), 0);
  const favoriteMood = findMostCommon(stamps.map(s => s.mood));
  const favoritePack = findMostCommon(stamps.map(s => s.pack));

  const cityCounts = tallyCities(stamps, routes);
  const milestones = evaluateMilestones(stamps, routes, MILESTONES);
  const badges = getUnlockedBadges(stamps, routes, BADGES);
  const unlockedRoutes = getUnlockedRoutes(stamps, routes);

  return {
    totalSessions: stamps.length,
    totalMiles,
    favoriteMood,
    favoritePack,
    cityCounts,
    milestones,
    badges,
    unlockedRoutes,
  };
}

function findMostCommon(list: string[]): string | null {
  const map: Record<string, number> = {};
  for (const item of list) {
    map[item] = (map[item] || 0) + 1;
  }
  let best: string | null = null;
  let max = 0;
  for (const [k, v] of Object.entries(map)) {
    if (v > max) {
      best = k;
      max = v;
    }
  }
  return best;
}
