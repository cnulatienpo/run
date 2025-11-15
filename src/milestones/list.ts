import { MilestoneDefinition } from "./types";
import { tallyCities } from "../routes/analysis";

export const MILESTONES: MilestoneDefinition[] = [
  {
    id: "first_10km",
    name: "First 10 km",
    description: "Total distance exceeds 10 km.",
    condition: (stamps) =>
      stamps.reduce((sum, s) => sum + (s.miles || 0), 0) >= 6.2,
  },

  {
    id: "three_tokyo_sessions",
    name: "Tokyo Regular",
    description: "Completed 3 sessions on any Tokyo route.",
    condition: (stamps, routes) => {
      const cities = tallyCities(stamps, routes);
      return (cities["Tokyo"] || 0) >= 3;
    },
  },

  {
    id: "first_fog_run",
    name: "Fog Walker",
    description: "Completed a session with Fog mood/pack.",
    condition: (stamps) =>
      stamps.some(s =>
        s.mood.toLowerCase().includes("fog") ||
        s.pack.toLowerCase().includes("fog")
      ),
  },
];

export { evaluateMilestones } from "./evaluate";
