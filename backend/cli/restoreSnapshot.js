#!/usr/bin/env node
import { writeFile } from 'fs/promises';
import path from 'path';
import process from 'process';

import { loadEnv } from '../config/loadEnv.js';
import { loadSnapshot, listSnapshotFiles } from '../utils/snapshots.js';
import { uploadToB2 } from '../uploadToB2.js';
import { logInfo } from '../log.js';

loadEnv();

function parseArgs(argv) {
  const args = { upload: false };
  argv.slice(2).forEach((arg, index, array) => {
    if (arg === '--upload') {
      args.upload = true;
    } else if (arg === '--id') {
      args.id = array[index + 1];
    }
  });
  return args;
}

async function resolveSnapshot(id) {
  try {
    return await loadSnapshot(id, {});
  } catch (error) {
    const files = await listSnapshotFiles();
    const candidate = files.find((file) => path.basename(file).startsWith(`${id}-`));
    if (!candidate) {
      throw error;
    }
    const suffix = candidate.includes('-synthetic.json');
    return loadSnapshot(id, { synthetic: suffix });
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.id) {
    console.error('Usage: restoreSnapshot --id <sessionId> [--upload]');
    process.exit(1);
  }

  try {
    const snapshot = await resolveSnapshot(options.id);
    const noodle = snapshot?.body ?? snapshot;
    const fileName = `${options.id}-restored.json`;
    await writeFile(fileName, `${JSON.stringify(noodle, null, 2)}\n`);
    logInfo('RESTORE', 'Snapshot restored locally', { fileName });

    if (options.upload) {
      await uploadToB2(noodle, { synthetic: Boolean(snapshot.synthetic) });
      logInfo('RESTORE', 'Snapshot re-uploaded to Backblaze B2', { sessionId: options.id });
    }
  } catch (error) {
    console.error(`Failed to restore snapshot: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
