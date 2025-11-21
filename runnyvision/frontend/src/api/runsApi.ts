import { RunSession } from "../../../shared/types";

const BASE_URL = "http://localhost:4000/api";

export async function createRun(userId: string, steps: number, places: string[]): Promise<RunSession> {
  const res = await fetch(`${BASE_URL}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, steps, places }),
  });
  if (!res.ok) throw new Error("Failed to create run");
  return res.json();
}

export async function fetchPassport(userId: string): Promise<RunSession[]> {
  const res = await fetch(`${BASE_URL}/passport/${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error("Failed to fetch passport");
  return res.json();
}
