import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { ClipMetadata, ClipSourceType } from "../models/clip";

const DATA_DIR = path.resolve(__dirname, "../../data");
const CLIPS_FILE = path.join(DATA_DIR, "clips.json");

let clipsCache: ClipMetadata[] | null = null;

async function ensureStorage(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(CLIPS_FILE);
  } catch {
    await fs.writeFile(CLIPS_FILE, "[]", "utf-8");
  }
}

async function loadClipsFromDisk(): Promise<ClipMetadata[]> {
  await ensureStorage();
  if (clipsCache) {
    return clipsCache;
  }
  const raw = await fs.readFile(CLIPS_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw) as ClipMetadata[];
    clipsCache = parsed.map((clip) => ({
      ...clip,
      tags: Array.isArray(clip.tags) ? clip.tags : [],
    }));
  } catch {
    clipsCache = [];
  }
  return clipsCache!;
}

async function persist(): Promise<void> {
  if (!clipsCache) {
    return;
  }
  await ensureStorage();
  await fs.writeFile(CLIPS_FILE, JSON.stringify(clipsCache, null, 2), "utf-8");
}

function generateId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

export interface CreateClipInput {
  sourceType: ClipSourceType;
  urlOrPath: string;
  title?: string;
  description?: string;
  durationSeconds?: number;
  tags?: string[];
}

export interface ClipQuery {
  ids?: string[];
  tagsAny?: string[];
  tagsAll?: string[];
  sourceTypes?: ClipSourceType[];
  environment?: "INDOOR" | "OUTDOOR";
  peopleDensity?: "EMPTY" | "FEW" | "CROWDED" | "PACKED";
  urbanity?: "URBAN" | "SUBURBAN" | "RURAL" | "MIXED";
  isNight?: boolean;
  isAnimated?: boolean;
  isGameEnvironment?: boolean;
  isClubLike?: boolean;
  excludeCtaOrSponsor?: boolean;
}

export async function getAllClips(): Promise<ClipMetadata[]> {
  const clips = await loadClipsFromDisk();
  return clips.map((clip) => ({ ...clip, tags: [...clip.tags] }));
}

export async function createClip(
  input: CreateClipInput
): Promise<ClipMetadata> {
  const clips = await loadClipsFromDisk();
  const now = new Date().toISOString();
  const clip: ClipMetadata = {
    id: generateId(),
    sourceType: input.sourceType,
    urlOrPath: input.urlOrPath,
    durationSeconds: input.durationSeconds,
    title: input.title,
    description: input.description,
    tags: input.tags ? [...input.tags] : [],
    createdAt: now,
    updatedAt: now,
  };
  clips.push(clip);
  await persist();
  return { ...clip, tags: [...clip.tags] };
}

export async function getClipById(id: string): Promise<ClipMetadata | null> {
  const clips = await loadClipsFromDisk();
  const found = clips.find((clip) => clip.id === id);
  return found ? { ...found, tags: [...found.tags] } : null;
}

function matchesBooleanField(
  queryValue: boolean | undefined,
  clipValue: boolean | undefined
): boolean {
  if (queryValue === undefined) {
    return true;
  }
  return (clipValue ?? false) === queryValue;
}

function matchesQuery(clip: ClipMetadata, query: ClipQuery): boolean {
  if (query.ids && !query.ids.includes(clip.id)) {
    return false;
  }
  if (query.sourceTypes && !query.sourceTypes.includes(clip.sourceType)) {
    return false;
  }
  if (query.environment && clip.environment && clip.environment !== query.environment) {
    return false;
  }
  if (
    query.peopleDensity &&
    clip.peopleDensity &&
    clip.peopleDensity !== query.peopleDensity
  ) {
    return false;
  }
  if (query.urbanity && clip.urbanity && clip.urbanity !== query.urbanity) {
    return false;
  }
  if (!matchesBooleanField(query.isNight, clip.isNight)) {
    return false;
  }
  if (!matchesBooleanField(query.isAnimated, clip.isAnimated)) {
    return false;
  }
  if (!matchesBooleanField(query.isGameEnvironment, clip.isGameEnvironment)) {
    return false;
  }
  if (!matchesBooleanField(query.isClubLike, clip.isClubLike)) {
    return false;
  }
  if (query.excludeCtaOrSponsor && clip.hasCtaOrSponsor) {
    return false;
  }
  if (query.tagsAny && query.tagsAny.length > 0) {
    const hasAny = query.tagsAny.some((tag) => clip.tags.includes(tag));
    if (!hasAny) {
      return false;
    }
  }
  if (query.tagsAll && query.tagsAll.length > 0) {
    const hasAll = query.tagsAll.every((tag) => clip.tags.includes(tag));
    if (!hasAll) {
      return false;
    }
  }
  return true;
}

export async function listClips(query?: ClipQuery): Promise<ClipMetadata[]> {
  const clips = await loadClipsFromDisk();
  if (!query) {
    return clips.map((clip) => ({ ...clip, tags: [...clip.tags] }));
  }
  return clips
    .filter((clip) => matchesQuery(clip, query))
    .map((clip) => ({ ...clip, tags: [...clip.tags] }));
}

export async function updateClip(
  id: string,
  partial: Partial<ClipMetadata>
): Promise<ClipMetadata | null> {
  const clips = await loadClipsFromDisk();
  const index = clips.findIndex((clip) => clip.id === id);
  if (index === -1) {
    return null;
  }
  const now = new Date().toISOString();
  const updated: ClipMetadata = {
    ...clips[index],
    ...partial,
    id,
    tags: partial.tags ? [...partial.tags] : [...clips[index].tags],
    updatedAt: now,
  };
  clips[index] = updated;
  await persist();
  return { ...updated, tags: [...updated.tags] };
}

export async function deleteClip(id: string): Promise<boolean> {
  const clips = await loadClipsFromDisk();
  const initialLength = clips.length;
  const filtered = clips.filter((clip) => clip.id !== id);
  if (filtered.length === initialLength) {
    return false;
  }
  clipsCache = filtered;
  await persist();
  return true;
}
