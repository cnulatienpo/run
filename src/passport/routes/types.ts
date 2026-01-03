export interface RouteDefinition {
  id: string;
  name: string;
  city: string;
  country?: string;
  distanceMiles: number;
  styleTag: string;
  bpmRange?: [number, number];

  unlockedByDefault: boolean;
  unlockCondition?: {
    type: "sessions" | "miles" | "city_sessions" | "badge";
    target: number;
    city?: string;
    badgeId?: string;
  };
}
