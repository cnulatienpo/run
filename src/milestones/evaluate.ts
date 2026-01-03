import { PassportStamp } from "../passport/types";
import { RouteDefinition } from "../passport/routes/types";
import { MilestoneDefinition } from "./types";

export function evaluateMilestones(
  stamps: PassportStamp[],
  routes: RouteDefinition[],
  definitions: MilestoneDefinition[]
) {
  const results: Record<string, boolean> = {};

  for (const def of definitions) {
    results[def.id] = def.condition(stamps, routes);
  }

  return results;
}
