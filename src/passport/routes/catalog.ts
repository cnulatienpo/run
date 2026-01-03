import { RouteDefinition } from "./types";

export const ROUTES: RouteDefinition[] = [
  {
    id: "tokyo_night_loop",
    name: "Tokyo Night Loop",
    city: "Tokyo",
    country: "Japan",
    distanceMiles: 3.0,
    styleTag: "Neon",
    bpmRange: [130, 145],
    unlockedByDefault: true,
  },
  {
    id: "berlin_tunnel_walk",
    name: "Berlin Tunnel Walk",
    city: "Berlin",
    country: "Germany",
    distanceMiles: 2.5,
    styleTag: "Industrial",
    unlockedByDefault: false,
    unlockCondition: {
      type: "sessions",
      target: 5,
    },
  },
  {
    id: "cybermall_noon",
    name: "Cybermall Noon Route",
    city: "Chicago",
    country: "USA",
    distanceMiles: 1.8,
    styleTag: "Dreamcore",
    unlockedByDefault: false,
    unlockCondition: {
      type: "city_sessions",
      city: "Tokyo",
      target: 3,
    },
  },
];
