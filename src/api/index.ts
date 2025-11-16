import { HttpClient, HttpClientOptions } from "./httpClient";

let currentUserId: string | undefined;

export function setApiUserId(userId: string | undefined) {
  currentUserId = userId || undefined;
}

function resolveBaseUrl(): string {
  const viteEnv =
    typeof import.meta !== "undefined" && (import.meta as any)?.env
      ? ((import.meta as any).env as Record<string, string | undefined>)
      : undefined;
  return (
    viteEnv?.VITE_API_BASE_URL ||
    (typeof process !== "undefined" ? process.env.VITE_API_BASE_URL : undefined) ||
    (typeof process !== "undefined" ? process.env.RUN_API_BASE_URL : undefined) ||
    "http://localhost:3001"
  );
}

export function createClient(overrides?: Partial<HttpClientOptions>) {
  return new HttpClient({
    baseUrl: overrides?.baseUrl ?? resolveBaseUrl(),
    userId: overrides?.userId ?? currentUserId,
  });
}

export type { HttpClient, HttpClientOptions };
