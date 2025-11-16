import { ExperienceSettings } from "./experience";

export interface ExperienceProfile {
  id: string;
  userId: string;
  name: string;
  settings: ExperienceSettings;
  createdAt: string;
  updatedAt: string;
}
