import { PassportSummary } from "../rv/types/passport";
import { createClient } from "./index";

export async function fetchPassportSummary(): Promise<PassportSummary> {
  const client = createClient();
  return client.get<PassportSummary>("/api/passport/summary");
}
