import { PassportStamp } from "../passport/types";
import { RouteDefinition } from "../routes/types";

export interface MilestoneDefinition {
  id: string;
  name: string;
  description: string;
  condition: (
    stamps: PassportStamp[],
    routes: RouteDefinition[]
  ) => boolean;
}
