import { randomUUID } from "crypto";
import { ExperienceSettings } from "../models/experience";
import { ExperienceProfile } from "../models/profile";

const profileStore: Map<string, ExperienceProfile[]> = new Map();

function cloneProfile(profile: ExperienceProfile): ExperienceProfile {
  return {
    ...profile,
    settings: JSON.parse(JSON.stringify(profile.settings)),
  };
}

function getUserProfiles(userId: string): ExperienceProfile[] {
  if (!profileStore.has(userId)) {
    profileStore.set(userId, []);
  }
  return profileStore.get(userId)!;
}

export function listProfiles(userId: string): ExperienceProfile[] {
  return getUserProfiles(userId).map(cloneProfile);
}

export function getProfile(
  userId: string,
  profileId: string
): ExperienceProfile | undefined {
  const profile = getUserProfiles(userId).find(
    (item) => item.id === profileId
  );
  return profile ? cloneProfile(profile) : undefined;
}

export function createProfile(
  userId: string,
  name: string,
  settings: ExperienceSettings
): ExperienceProfile {
  const now = new Date().toISOString();
  const profile: ExperienceProfile = {
    id: randomUUID(),
    userId,
    name,
    settings: JSON.parse(JSON.stringify(settings)),
    createdAt: now,
    updatedAt: now,
  };
  const profiles = getUserProfiles(userId);
  profiles.push(profile);
  return cloneProfile(profile);
}

export function updateProfile(
  userId: string,
  profileId: string,
  partial: { name?: string; settings?: ExperienceSettings }
): ExperienceProfile | null {
  const profiles = getUserProfiles(userId);
  const index = profiles.findIndex((profile) => profile.id === profileId);
  if (index === -1) {
    return null;
  }

  const updated: ExperienceProfile = {
    ...profiles[index],
    ...partial,
    settings: partial.settings
      ? JSON.parse(JSON.stringify(partial.settings))
      : profiles[index].settings,
    name: partial.name ?? profiles[index].name,
    updatedAt: new Date().toISOString(),
  };

  profiles[index] = updated;
  return cloneProfile(updated);
}

export function deleteProfile(userId: string, profileId: string): boolean {
  const profiles = getUserProfiles(userId);
  const index = profiles.findIndex((profile) => profile.id === profileId);
  if (index === -1) {
    return false;
  }
  profiles.splice(index, 1);
  return true;
}
