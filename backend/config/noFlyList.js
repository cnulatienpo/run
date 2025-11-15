import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(new URL('./noFlyList.js', import.meta.url)));
const dataPath = path.join(currentDir, 'no_fly_sessions.json');
let cache;
let lastLoaded = 0;
const CACHE_TTL_MS = 60_000;

async function loadList() {
  const now = Date.now();
  if (cache && now - lastLoaded < CACHE_TTL_MS) {
    return cache;
  }
  try {
    const raw = await readFile(dataPath, 'utf8');
    cache = JSON.parse(raw);
    lastLoaded = now;
  } catch (error) {
    if (error.code === 'ENOENT') {
      cache = [];
      lastLoaded = now;
    } else {
      throw error;
    }
  }
  if (!Array.isArray(cache)) {
    cache = [];
  }
  return cache;
}

export async function isSessionBlocked(sessionId) {
  if (!sessionId) {
    return false;
  }
  const list = await loadList();
  return list.includes(sessionId);
}

export async function refreshNoFlyCache() {
  lastLoaded = 0;
  await loadList();
}
