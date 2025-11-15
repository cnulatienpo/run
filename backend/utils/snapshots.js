import { mkdir, writeFile, readFile, readdir } from 'fs/promises';
import path from 'path';

import { getSnapshotsDir } from './paths.js';

function formatDateSegment(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function saveSnapshot(sessionId, schemaVersion, payload, { synthetic = false } = {}) {
  if (!sessionId) {
    throw new Error('sessionId is required to save a snapshot');
  }
  const baseDir = getSnapshotsDir();
  const folder = path.join(baseDir, formatDateSegment());
  await mkdir(folder, { recursive: true });
  const fileName = synthetic ? `${sessionId}.synthetic.json` : `${sessionId}.json`;
  const filePath = path.join(folder, fileName);
  const snapshot = {
    session_id: sessionId,
    schema_version: schemaVersion,
    synthetic,
    body: payload,
    saved_at: new Date().toISOString(),
  };
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return filePath;
}

export async function loadSnapshot(sessionId, { synthetic } = {}) {
  if (!sessionId) {
    throw new Error('sessionId is required to load a snapshot');
  }
  const baseDir = getSnapshotsDir();
  const segments = await listSnapshotFiles();
  const targetSynthetic = synthetic;
  const orderedSegments = segments.sort((a, b) => {
    const aSynthetic = a.includes('.synthetic.');
    const bSynthetic = b.includes('.synthetic.');
    if (aSynthetic === bSynthetic) {
      return a.localeCompare(b);
    }
    return aSynthetic - bSynthetic;
  });
  for (const filePath of orderedSegments) {
    const fileName = path.basename(filePath);
    const matchesId = fileName === `${sessionId}.json`
      || fileName === `${sessionId}.synthetic.json`
      || fileName.startsWith(`${sessionId}-`);
    if (!matchesId) {
      continue;
    }
    const fileIsSynthetic = fileName.includes('.synthetic.');
    if (targetSynthetic === true && !fileIsSynthetic) {
      continue;
    }
    if (targetSynthetic === false && fileIsSynthetic) {
      continue;
    }
    const content = JSON.parse(await readFile(filePath, 'utf8'));
    return content;
  }
  throw new Error(`Snapshot not found for session ${sessionId}`);
}

export async function listSnapshotFiles() {
  const baseDir = getSnapshotsDir();
  try {
    const dateFolders = await readdir(baseDir);
    const files = [];
    await Promise.all(
      dateFolders.map(async (folder) => {
        const folderPath = path.join(baseDir, folder);
        const entries = await readdir(folderPath);
        entries.forEach((entry) => {
          files.push(path.join(folderPath, entry));
        });
      }),
    );
    return files;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
