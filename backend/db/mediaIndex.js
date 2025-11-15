/**
 * Lightweight media metadata index to track how noodles relate to
 * specific media tracks. The store is file-backed for now and will be
 * replaced with a database in the future.
 */

import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { logDebug, logInfo } from '../log.js';

const defaultFileUrl = new URL('./mediaIndex.json', import.meta.url);

function resolveIndexPath() {
  if (process.env.MEDIA_INDEX_PATH) {
    return path.resolve(process.cwd(), process.env.MEDIA_INDEX_PATH);
  }
  return fileURLToPath(defaultFileUrl);
}

async function ensureStore() {
  const filePath = resolveIndexPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await access(filePath, constants.F_OK);
  } catch (error) {
    await writeFile(filePath, `${JSON.stringify({}, null, 2)}\n`);
    logInfo('MEDIA', 'Created new media index store', { filePath });
  }
  return filePath;
}

async function readStore() {
  const filePath = await ensureStore();
  const raw = await readFile(filePath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    logInfo('MEDIA', 'Unable to parse media index store. Resetting.', { message: error.message });
    await writeFile(filePath, `${JSON.stringify({}, null, 2)}\n`);
    return {};
  }
}

function nextAverage(previousAverage, previousCount, nextValue) {
  if (!Number.isFinite(nextValue)) {
    return previousAverage;
  }
  if (!Number.isFinite(previousAverage)) {
    return Number(nextValue.toFixed(2));
  }
  const numerator = previousAverage * previousCount + nextValue;
  const denominator = previousCount + 1;
  return Number((numerator / denominator).toFixed(2));
}

/**
 * Reads the current media index contents from disk.
 *
 * @returns {Promise<Record<string, any>>} Media index object keyed by track id.
 */
export async function loadMediaIndex() {
  return readStore();
}

/**
 * Records a noodle session against a media track, updating aggregate
 * metrics such as session count and rolling averages.
 *
 * @param {{ trackId: string, bpm?: number, heartRate?: number, speed?: number }} payload
 *  Metadata describing the media usage.
 * @returns {Promise<Record<string, any>>} The updated media index entry.
 */
export async function recordMediaSession(payload) {
  if (!payload || typeof payload !== 'object' || !payload.trackId) {
    throw new Error('A media track id is required when recording media session data.');
  }

  const filePath = await ensureStore();
  const store = await readStore();
  const key = String(payload.trackId);
  const existing = store[key] || {
    track_id: key,
    bpm: null,
    number_of_sessions: 0,
    avg_heart_rate: null,
    avg_speed: null,
  };

  const previousSessions = existing.number_of_sessions ?? 0;
  const nextSessions = previousSessions + 1;

  if (Number.isFinite(payload.bpm)) {
    existing.bpm = Number(payload.bpm);
  }

  existing.avg_heart_rate = nextAverage(existing.avg_heart_rate, previousSessions, payload.heartRate);
  existing.avg_speed = nextAverage(existing.avg_speed, previousSessions, payload.speed);
  existing.number_of_sessions = nextSessions;

  store[key] = existing;
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`);

  logDebug('MEDIA', 'Updated media index entry', existing);
  return existing;
}

/**
 * Returns the absolute file path for the media index store. Useful for
 * debugging and CLI tooling output.
 *
 * @returns {string} Media index file path.
 */
export function getMediaIndexFilePath() {
  return resolveIndexPath();
}
