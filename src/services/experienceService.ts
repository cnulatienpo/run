import path from "path";
import {
  DEFAULT_EXPERIENCE_SETTINGS,
  ExperienceSettings,
} from "../models/experience";
import { ensureFile, readJson, writeJson } from "../utils/jsonStore";

const DATA_DIR = path.resolve(process.cwd(), "data");
const EXPERIENCE_FILE = path.join(DATA_DIR, "experience.json");

const experienceFileReady = ensureFile(EXPERIENCE_FILE, {});

function cloneSettings(settings: ExperienceSettings): ExperienceSettings {
  return JSON.parse(JSON.stringify(settings));
}

async function loadStore(): Promise<Record<string, ExperienceSettings>> {
  await experienceFileReady;
  const data = await readJson<Record<string, ExperienceSettings>>(EXPERIENCE_FILE);
  return data ?? {};
}

async function writeStore(store: Record<string, ExperienceSettings>): Promise<void> {
  await writeJson(EXPERIENCE_FILE, store);
}

export async function getExperienceSettings(
  userId: string
): Promise<ExperienceSettings> {
  const store = await loadStore();
  const stored = store[userId];
  return stored
    ? cloneSettings(stored)
    : cloneSettings(DEFAULT_EXPERIENCE_SETTINGS);
}

export async function saveExperienceSettings(
  userId: string,
  settings: ExperienceSettings
): Promise<ExperienceSettings> {
  const store = await loadStore();
  store[userId] = cloneSettings(settings);
  await writeStore(store);
  return getExperienceSettings(userId);
}
