import { access, readFile, writeFile, mkdir } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { logError, logInfo } from '../log.js';

const fileUrl = new URL('./sessions.json', import.meta.url);
const filePath = fileURLToPath(fileUrl);
const directoryPath = path.dirname(filePath);

async function ensureStore() {
  await mkdir(directoryPath, { recursive: true });
  try {
    await access(filePath, constants.F_OK);
  } catch (error) {
    await writeFile(filePath, JSON.stringify([], null, 2));
    logInfo('SESSIONS', 'Created new session registry store', { filePath });
  }
}

async function loadSessionsInternal() {
  await ensureStore();
  const raw = await readFile(filePath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    logError('SESSIONS', 'Session registry file is not an array. Resetting store.');
  } catch (error) {
    logError('SESSIONS', 'Failed to parse session registry file. Resetting store.', {
      message: error.message,
    });
  }
  await writeFile(filePath, JSON.stringify([], null, 2));
  return [];
}

export async function loadSessions() {
  return loadSessionsInternal();
}

export async function appendSessionEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Session registry entry must be an object.');
  }

  const sessions = await loadSessionsInternal();
  sessions.push(entry);
  await writeFile(filePath, `${JSON.stringify(sessions, null, 2)}\n`);
  logInfo('SESSIONS', 'Appended session metadata entry', {
    sessionId: entry.session_id,
    schemaVersion: entry.schema_version,
  });
  return entry;
}

export function getSessionsFilePath() {
  return filePath;
}
