import { RunStats } from "../rv/types/experience";
import { createClient } from "./index";

export interface StartSessionPayload {
  trainingType?: string;
  goalName?: string;
}

export interface RunClientOverrides {
  baseUrl?: string;
  userId?: string;
}

export interface TelemetryPayload {
  heartRate?: number;
  inTargetZone?: boolean;
  deltaSeconds?: number;
}

export async function startRunSession(
  payload: StartSessionPayload = {},
  overrides?: RunClientOverrides
): Promise<void> {
  const client = createClient(overrides);
  await client.post<void>("/api/run/start", payload);
}

export async function endRunSession(overrides?: RunClientOverrides): Promise<void> {
  const client = createClient(overrides);
  await client.post<void>("/api/run/end");
}

export async function fetchRunStats(overrides?: RunClientOverrides): Promise<RunStats> {
  const client = createClient(overrides);
  return client.get<RunStats>("/api/run/stats");
}

export async function sendTelemetry(
  baseUrl: string,
  payload: TelemetryPayload,
  userId?: string
): Promise<void> {
  const client = createClient({ baseUrl, userId });
  await client.post<void>("/api/run/telemetry", payload);
}
