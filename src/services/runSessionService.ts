import { randomUUID } from "crypto";
import { CreateRunSessionInput, RunSession } from "../models/runSession";

const runs: RunSession[] = [
  {
    id: randomUUID(),
    userId: "demo-user",
    steps: 13245,
    places: ["Boston", "Tokyo"],
    fakeMiles: 2352,
    createdAt: new Date().toISOString(),
  },
  {
    id: randomUUID(),
    userId: "demo-user",
    steps: 8450,
    places: ["Paris", "Stormwind"],
    fakeMiles: 1640,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: randomUUID(),
    userId: "demo-user",
    steps: 4200,
    places: [
      "Roadblocks",
      "New York",
      "World of Warcraft Castles",
      "St. Louis",
    ],
    fakeMiles: 912,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
  },
];

function generateFakeMiles(steps: number): number {
  const variance = 0.4 + Math.random() * 0.6;
  const miles = Math.max(120, Math.round(steps * variance));
  const magnitude = Math.pow(10, Math.max(0, `${miles}`.length - 2));
  return Math.round(miles / magnitude) * magnitude;
}

export function listRunsForUser(userId: string): RunSession[] {
  return runs
    .filter((run) => run.userId === userId)
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export function createRunSession(
  userId: string,
  input: CreateRunSessionInput
): RunSession {
  const fakeMiles = generateFakeMiles(input.steps);
  const session: RunSession = {
    id: randomUUID(),
    userId,
    steps: Math.round(input.steps),
    places: input.places,
    fakeMiles,
    createdAt: new Date().toISOString(),
  };

  runs.push(session);
  return session;
}
