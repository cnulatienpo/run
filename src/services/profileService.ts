import path from "path";
import { randomUUID } from "crypto";
import { ExperienceSettings } from "../models/experience";
import { ExperienceProfile } from "../models/profile";
import { ensureFile, readJson, writeJson } from "../utils/jsonStore";

const DATA_DIR = path.resolve(process.cwd(), "data");
const PROFILE_FILE = path.join(DATA_DIR, "profiles.json");

const profileFileReady = ensureFile(PROFILE_FILE, {});

type ProfileStore = Record<string, ExperienceProfile[]>;

function cloneProfile(profile: ExperienceProfile): ExperienceProfile {
  return {
    ...profile,
    settings: JSON.parse(JSON.stringify(profile.settings)),
  };
}

async function loadStore(): Promise<ProfileStore> {
  await profileFileReady;
  const data = await readJson<ProfileStore>(PROFILE_FILE);
  return data ?? {};
}

async function writeStore(store: ProfileStore): Promise<void> {
  await writeJson(PROFILE_FILE, store);
}

function cloneProfiles(profiles: ExperienceProfile[]): ExperienceProfile[] {
  return profiles.map(cloneProfile);
}

export async function listProfiles(userId: string): Promise<ExperienceProfile[]> {
  const store = await loadStore();
  const profiles = store[userId] ?? [];
  return cloneProfiles(profiles);
}

export async function getProfile(
  userId: string,
  profileId: string
): Promise<ExperienceProfile | undefined> {
  const store = await loadStore();
  const profile = (store[userId] ?? []).find((item) => item.id === profileId);
  return profile ? cloneProfile(profile) : undefined;
}

export async function createProfile(
  userId: string,
  name: string,
  settings: ExperienceSettings
): Promise<ExperienceProfile> {
  const now = new Date().toISOString();
  const store = await loadStore();
  const profiles = store[userId] ?? [];

  const profile: ExperienceProfile = {
    id: randomUUID(),
    userId,
    name,
    settings: JSON.parse(JSON.stringify(settings)),
    createdAt: now,
    updatedAt: now,
  };

  store[userId] = [...profiles, profile];
  await writeStore(store);
  return cloneProfile(profile);
}

export async function updateProfile(
  userId: string,
  profileId: string,
  partial: { name?: string; settings?: ExperienceSettings }
): Promise<ExperienceProfile | null> {
  const store = await loadStore();
  const profiles = store[userId] ?? [];
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

  const nextProfiles = [...profiles];
  nextProfiles[index] = updated;
  store[userId] = nextProfiles;
  await writeStore(store);
  return cloneProfile(updated);
}

export async function deleteProfile(
  userId: string,
  profileId: string
): Promise<boolean> {
  const store = await loadStore();
  const profiles = store[userId] ?? [];
  const index = profiles.findIndex((profile) => profile.id === profileId);
  if (index === -1) {
    return false;
  }
  const nextProfiles = [...profiles];
  nextProfiles.splice(index, 1);
  store[userId] = nextProfiles;
  await writeStore(store);
  return true;
}
