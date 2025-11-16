import { ExperienceSettings } from "../rv/types/experience";
import { createClient } from "./index";

export interface SelectedClip {
  id: string;
  url: string;
  startSeconds: number;
  endSeconds: number;
}

export async function selectClipsForExperience(
  settings: ExperienceSettings
): Promise<SelectedClip[]> {
  const client = createClient();
  return client.post<SelectedClip[]>("/api/clips/select", { experienceSettings: settings });
}
