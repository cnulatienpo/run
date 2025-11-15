import { BadgeDefinition } from "./types";

export const BADGES: BadgeDefinition[] = [
  {
    id: "glitch_queen",
    name: "Glitch Queen",
    icon: "✨",
    description: "Unlocked by running 5 Neon or Glitch-style routes.",
  },
  {
    id: "tunnel_walker",
    name: "Tunnel Walker",
    icon: "🚇",
    description: "Completed Berlin Tunnel Walk route.",
  },
  {
    id: "noon_cybermall",
    name: "Noon in the Cybermall",
    icon: "🏙️",
    description: "Unlocked by hitting the Cybermall Noon route.",
  },
];

export { getUnlockedBadges } from "./evaluate";
