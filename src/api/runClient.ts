export interface StartSessionPayload {
  trainingType?: string;
  goalName?: string;
}

export interface TelemetryPayload {
  heartRate?: number;
  inTargetZone?: boolean;
  deltaSeconds?: number;
}

const defaultHeaders = (userId?: string): HeadersInit => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (userId) {
    headers["x-user-id"] = userId;
  }
  return headers;
};

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Run API request failed: ${response.status} ${body}`);
  }
};

export async function startRunSession(
  baseUrl: string,
  payload: StartSessionPayload = {},
  userId?: string
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/run/start`, {
    method: "POST",
    headers: defaultHeaders(userId),
    body: JSON.stringify(payload),
  });
  await handleResponse(response);
}

export async function sendTelemetry(
  baseUrl: string,
  payload: TelemetryPayload,
  userId?: string
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/run/telemetry`, {
    method: "POST",
    headers: defaultHeaders(userId),
    body: JSON.stringify(payload),
  });
  await handleResponse(response);
}

export async function endRunSession(baseUrl: string, userId?: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/run/end`, {
    method: "POST",
    headers: defaultHeaders(userId),
  });
  await handleResponse(response);
}
