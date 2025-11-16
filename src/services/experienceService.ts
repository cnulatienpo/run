import {
  DEFAULT_EXPERIENCE_SETTINGS,
  ExperienceSettings,
} from "../models/experience";

const experienceStore: Map<string, ExperienceSettings> = new Map();

function cloneSettings(settings: ExperienceSettings): ExperienceSettings {
  return JSON.parse(JSON.stringify(settings));
}

export function getExperienceSettings(userId: string): ExperienceSettings {
  const stored = experienceStore.get(userId);
  return stored ? cloneSettings(stored) : cloneSettings(DEFAULT_EXPERIENCE_SETTINGS);
}

export function saveExperienceSettings(
  userId: string,
  settings: ExperienceSettings
): ExperienceSettings {
  experienceStore.set(userId, cloneSettings(settings));
  return getExperienceSettings(userId);
}
