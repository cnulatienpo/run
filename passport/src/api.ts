import { RunSession } from "./types";

export async function fetchSessions(): Promise<RunSession[]> {
  const res = await fetch("/api/run-sessions");
  if (!res.ok) {
    throw new Error("Unable to load sessions");
  }
  return res.json();
}

export async function createSession(input: {
  steps: number;
  places: string[];
}): Promise<RunSession> {
  const res = await fetch("/api/run-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const message = (await res.json().catch(() => null))?.message;
    throw new Error(message || "Unable to save session");
  }

  return res.json();
}
