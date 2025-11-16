export interface HttpClientOptions {
  baseUrl: string;
  userId?: string;
}

function resolveUrl(baseUrl: string, path: string): string {
  if (!path) {
    throw new Error("HttpClient path is required");
  }
  try {
    return new URL(path, baseUrl).toString();
  } catch (error) {
    throw new Error(`Failed to resolve URL for path "${path}": ${String(error)}`);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Failed to parse response JSON: ${String(error)}`);
  }
}

async function ensureSuccess(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  let message = response.statusText;
  try {
    const text = await response.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { message?: string; error?: string };
        message = parsed.message ?? parsed.error ?? text;
      } catch {
        message = text;
      }
    }
  } catch (error) {
    message = `Failed to read error response: ${String(error)}`;
  }
  throw new Error(`HTTP ${response.status}: ${message}`);
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  private buildHeaders(extra?: HeadersInit): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(extra ?? {}),
    };
    if (this.options.userId) {
      (headers as Record<string, string>)["x-user-id"] = this.options.userId;
    }
    return headers;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = resolveUrl(this.options.baseUrl, path);
    const response = await fetch(url, { ...init, headers: this.buildHeaders(init.headers) });
    await ensureSuccess(response);
    if (response.status === 204) {
      return undefined as T;
    }
    return parseResponse<T>(response);
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }
}
