/**
 * Media track registry utilities backed by a JSON file. The registry keeps
 * track-level metadata, enabling music-aware analytics and tooling while the
 * project evolves towards a dedicated database.
 */

import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { logDebug, logInfo } from '../log.js';

const defaultFileUrl = new URL('./mediaTracks.json', import.meta.url);

function resolveStorePath() {
  if (process.env.MEDIA_TRACKS_PATH) {
    return path.resolve(process.cwd(), process.env.MEDIA_TRACKS_PATH);
  }
  return fileURLToPath(defaultFileUrl);
}

async function ensureStore() {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  try {
    await access(storePath, constants.F_OK);
  } catch (error) {
    await writeFile(storePath, `${JSON.stringify({}, null, 2)}\n`);
    logInfo('MEDIA', 'Created new media tracks registry', { filePath: storePath });
  }
  return storePath;
}

async function loadStore() {
  const filePath = await ensureStore();
  const raw = await readFile(filePath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    logInfo('MEDIA', 'Failed to parse media tracks registry. Resetting.', { message: error.message });
  }
  await writeFile(filePath, `${JSON.stringify({}, null, 2)}\n`);
  return {};
}

async function saveStore(store) {
  const filePath = await ensureStore();
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`);
}

function normaliseNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normaliseIntensityMap(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalised = value
    .map((entry) => normaliseNumber(entry))
    .filter((entry) => entry !== undefined)
    .map((entry) => Number(entry.toFixed(3)));
  return normalised.length > 0 ? normalised : [];
}

function normaliseStructure(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const structure = {};
  Object.entries(value).forEach(([name, range]) => {
    if (!Array.isArray(range) || range.length < 2) {
      return;
    }
    const start = normaliseNumber(range[0]);
    const end = normaliseNumber(range[1]);
    if (start === undefined || end === undefined || end <= start) {
      return;
    }
    structure[name] = [Math.round(start), Math.round(end)];
  });
  return Object.keys(structure).length > 0 ? structure : {};
}

function normaliseTags(tags, existingTags = []) {
  const combined = new Set();
  existingTags.forEach((tag) => {
    if (typeof tag === 'string' && tag.trim().length > 0) {
      combined.add(tag.trim());
    }
  });
  if (Array.isArray(tags)) {
    tags.forEach((tag) => {
      if (typeof tag === 'string' && tag.trim().length > 0) {
        combined.add(tag.trim());
      }
    });
  }
  return Array.from(combined);
}

function buildTrackSkeleton(trackId, metadata = {}) {
  const nowIso = new Date().toISOString();
  const bpm = normaliseNumber(metadata.bpm);
  const length = normaliseNumber(metadata.length_ms ?? metadata.lengthMs ?? metadata.duration_ms);
  return {
    track_id: trackId,
    bpm: bpm !== undefined ? Number(bpm.toFixed(2)) : null,
    length_ms: length !== undefined ? Math.round(length) : null,
    intensity_map: normaliseIntensityMap(metadata.intensity_map ?? metadata.intensityMap) ?? [],
    structure: normaliseStructure(metadata.structure) ?? {},
    tags: normaliseTags(metadata.tags ?? metadata.media_tags ?? []),
    created_at: nowIso,
    updated_at: nowIso,
  };
}

function mergeTrackMetadata(existing, metadata = {}) {
  const updated = { ...existing };
  const bpm = normaliseNumber(metadata.bpm);
  if (bpm !== undefined) {
    updated.bpm = Number(bpm.toFixed(2));
  }
  const length = normaliseNumber(metadata.length_ms ?? metadata.lengthMs ?? metadata.duration_ms);
  if (length !== undefined) {
    updated.length_ms = Math.round(length);
  }
  const intensity = normaliseIntensityMap(metadata.intensity_map ?? metadata.intensityMap);
  if (intensity !== undefined && intensity.length > 0) {
    if (!Array.isArray(updated.intensity_map) || updated.intensity_map.length === 0) {
      updated.intensity_map = intensity;
    } else {
      const maxLength = Math.max(updated.intensity_map.length, intensity.length);
      const merged = new Array(maxLength).fill(0).map((_, index) => {
        const current = normaliseNumber(updated.intensity_map[index]);
        const next = intensity[index];
        if (next === undefined) {
          return current !== undefined ? Number(current.toFixed(3)) : undefined;
        }
        if (current === undefined) {
          return Number(next.toFixed(3));
        }
        return Number(((current + next) / 2).toFixed(3));
      }).filter((entry) => entry !== undefined);
      updated.intensity_map = merged;
    }
  }
  const structure = normaliseStructure(metadata.structure);
  if (structure !== undefined) {
    updated.structure = { ...updated.structure, ...structure };
  }
  updated.tags = normaliseTags(metadata.tags ?? metadata.media_tags, updated.tags ?? []);
  updated.updated_at = new Date().toISOString();
  return updated;
}

export async function ensureTrack(trackId, metadata = {}) {
  if (!trackId) {
    throw new Error('trackId is required to ensure media track metadata');
  }
  const store = await loadStore();
  const key = String(trackId);
  const existing = store[key];
  const record = existing ? mergeTrackMetadata(existing, metadata) : buildTrackSkeleton(key, metadata);
  store[key] = record;
  await saveStore(store);
  if (!existing) {
    logInfo('MEDIA', 'Registered new media track', { trackId: key });
  } else {
    logDebug('MEDIA', 'Updated media track metadata', { trackId: key });
  }
  return record;
}

export async function updateTrack(trackId, metadata = {}) {
  if (!trackId) {
    throw new Error('trackId is required to update media track metadata');
  }
  const store = await loadStore();
  const key = String(trackId);
  const existing = store[key];
  if (!existing) {
    throw new Error(`Track ${trackId} does not exist in the registry`);
  }
  const updated = mergeTrackMetadata(existing, metadata);
  store[key] = updated;
  await saveStore(store);
  return updated;
}

export async function addTrackTags(trackId, tags = []) {
  if (!trackId) {
    throw new Error('trackId is required to add media track tags');
  }
  const store = await loadStore();
  const key = String(trackId);
  const existing = store[key];
  if (!existing) {
    throw new Error(`Track ${trackId} does not exist in the registry`);
  }
  const updated = {
    ...existing,
    tags: normaliseTags(tags, existing.tags ?? []),
    updated_at: new Date().toISOString(),
  };
  store[key] = updated;
  await saveStore(store);
  return updated;
}

export async function getTrack(trackId) {
  if (!trackId) {
    return undefined;
  }
  const store = await loadStore();
  return store[String(trackId)];
}

export async function listTracks() {
  const store = await loadStore();
  return Object.values(store);
}

function computeBeats(track) {
  const bpm = normaliseNumber(track?.bpm);
  const length = normaliseNumber(track?.length_ms);
  if (bpm === undefined || bpm <= 0 || length === undefined || length <= 0) {
    return [];
  }
  const interval = 60000 / bpm;
  const beats = [];
  for (let t = 0; t <= length; t += interval) {
    beats.push(Number(t.toFixed(2)));
  }
  return beats;
}

function computeSegments(track) {
  const structure = track?.structure && typeof track.structure === 'object' ? track.structure : {};
  const segments = [];
  Object.entries(structure).forEach(([name, range]) => {
    if (!Array.isArray(range) || range.length < 2) {
      return;
    }
    const start = normaliseNumber(range[0]);
    const end = normaliseNumber(range[1]);
    if (start === undefined || end === undefined || end <= start) {
      return;
    }
    segments.push({
      name,
      start_ms: Math.round(start),
      end_ms: Math.round(end),
      duration_ms: Math.round(end - start),
    });
  });
  return segments.sort((a, b) => a.start_ms - b.start_ms);
}

function computeLoopPoints(track) {
  const intensity = Array.isArray(track?.intensity_map) ? track.intensity_map : [];
  const length = normaliseNumber(track?.length_ms);
  if (!intensity.length || length === undefined || length <= 0) {
    return [];
  }
  const segmentDuration = length / intensity.length;
  const loops = [];
  intensity.forEach((value, index) => {
    const current = normaliseNumber(value);
    const next = normaliseNumber(intensity[index + 1]);
    if (current === undefined) {
      return;
    }
    const start = Math.round(index * segmentDuration);
    const end = Math.round((index + 1) * segmentDuration);
    if (next === undefined) {
      loops.push({
        start_ms: start,
        end_ms: end,
        suggested_cue: current >= 0.8 ? 'peak' : current >= 0.5 ? 'push' : 'breathe',
      });
      return;
    }
    const delta = Math.abs(next - current);
    if (delta <= 0.12) {
      loops.push({
        start_ms: start,
        end_ms: Math.round((index + 2) * segmentDuration),
        suggested_cue: current >= 0.75 ? 'drive' : 'flow',
      });
    } else if (next > current) {
      loops.push({
        start_ms: start,
        end_ms: end,
        suggested_cue: 'build',
      });
    } else if (next < current) {
      loops.push({
        start_ms: start,
        end_ms: end,
        suggested_cue: 'release',
      });
    }
  });
  return loops;
}

export function expandTrackMetadata(track) {
  if (!track) {
    return undefined;
  }
  return {
    ...track,
    beats: computeBeats(track),
    segments: computeSegments(track),
    loop_points: computeLoopPoints(track),
  };
}

export function getMediaTracksFilePath() {
  return resolveStorePath();
}

export function extractTrackMetadataFromNoodle(noodle) {
  if (!noodle || typeof noodle !== 'object') {
    return {};
  }
  const metadata = {};
  const dataBlock = noodle.data || {};
  const profile = noodle.playback_profile || {};
  const media = noodle.media || noodle.media_metadata || {};

  const bpm = normaliseNumber(
    dataBlock.track_bpm
    ?? dataBlock.bpm
    ?? profile.bpm
    ?? media.bpm,
  );
  if (bpm !== undefined) {
    metadata.bpm = bpm;
  }

  const length = normaliseNumber(
    dataBlock.track_length_ms
    ?? dataBlock.trackLengthMs
    ?? dataBlock.length_ms
    ?? media.length_ms
    ?? media.duration_ms,
  );
  if (length !== undefined) {
    metadata.length_ms = length;
  }

  const intensity = dataBlock.intensity_map
    ?? dataBlock.intensityMap
    ?? media.intensity_map
    ?? media.intensityMap;
  const normalisedIntensity = normaliseIntensityMap(intensity);
  if (normalisedIntensity && normalisedIntensity.length > 0) {
    metadata.intensity_map = normalisedIntensity;
  }

  const structure = dataBlock.structure
    ?? media.structure
    ?? profile.structure;
  const normalisedStructure = normaliseStructure(structure);
  if (normalisedStructure) {
    metadata.structure = normalisedStructure;
  }

  const tags = [];
  if (Array.isArray(media.tags)) {
    tags.push(...media.tags);
  }
  if (Array.isArray(dataBlock.tags)) {
    tags.push(...dataBlock.tags);
  }
  if (typeof dataBlock.genre === 'string') {
    tags.push(dataBlock.genre);
  }
  if (tags.length > 0) {
    metadata.tags = tags;
  }

  return metadata;
}
