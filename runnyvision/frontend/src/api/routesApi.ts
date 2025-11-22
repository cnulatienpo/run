import { RouteConfig } from "../../../shared/types";

const BASE_URL = "http://localhost:4000/api";

export async function fetchRoutes(): Promise<RouteConfig[]> {
  const res = await fetch(`${BASE_URL}/routes`);
  if (!res.ok) throw new Error("Failed to fetch routes");
  return res.json();
}

export async function createRoute(data: { name: string; videoUrl: string; places: string[] }): Promise<RouteConfig> {
  const res = await fetch(`${BASE_URL}/creator/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create route");
  return res.json();
}
