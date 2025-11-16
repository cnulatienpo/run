import { ExperienceSettings } from "../rv/types/experience";
import { createClient } from "./index";

export async function fetchExperienceSettings(): Promise<ExperienceSettings> {
  const client = createClient();
  return client.get<ExperienceSettings>("/api/experience");
}

export async function saveExperienceSettings(
  settings: ExperienceSettings
): Promise<ExperienceSettings> {
  const client = createClient();
  return client.put<ExperienceSettings>("/api/experience", settings);
}
