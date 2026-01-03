import { PassportStamp } from "../passport/types";
import { RouteDefinition } from "../passport/routes/types";
import { BadgeDefinition } from "./types";

export function getUnlockedBadges(
  stamps: PassportStamp[],
  routes: RouteDefinition[],
  definitions: BadgeDefinition[]
): string[] {
  const unlocked: string[] = [];

  const routeMap = new Map(routes.map(r => [r.id, r]));

  for (const def of definitions) {
    if (def.id === "glitch_queen") {
      let count = 0;
      for (const s of stamps) {
        const r = routeMap.get(s.routeId);
        if (!r) continue;
        const style = r.styleTag.toLowerCase();
        if (style.includes("neon") || style.includes("glitch")) count++;
      }
      if (count >= 5) unlocked.push(def.id);
    }

    if (def.id === "tunnel_walker") {
      if (stamps.some(s => s.routeId === "berlin_tunnel_walk"))
        unlocked.push(def.id);
    }

    if (def.id === "noon_cybermall") {
      if (stamps.some(s => s.routeId === "cybermall_noon"))
        unlocked.push(def.id);
    }
  }

  return unlocked;
}
