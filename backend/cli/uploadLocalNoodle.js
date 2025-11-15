#!/usr/bin/env node
import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';

import { logError, logInfo } from '../log.js';
import { buildNoodle } from '../utils/buildNoodle.js';
import { syntheticPass } from '../syntheticPass.js';
import { uploadToB2 } from '../uploadToB2.js';
import { validateNoodle } from '../schemas/index.js';

async function loadSample(relativePath) {
  const absolutePath = path.isAbsolute(relativePath)
    ? relativePath
    : path.resolve(process.cwd(), relativePath);
  const raw = await readFile(absolutePath, 'utf8');
  return JSON.parse(raw);
}

async function run() {
  const [, , filePath] = process.argv;
  if (!filePath) {
    console.error('Usage: node cli/uploadLocalNoodle.js <path-to-noodle-json>');
    process.exitCode = 1;
    return;
  }

  try {
    const rawPayload = await loadSample(filePath);
    const noodle = buildNoodle({ ...rawPayload, synthetic: false });
    validateNoodle(noodle);
    logInfo('CLI', 'Validated local noodle payload', { sessionId: noodle.sessionId });

    const synthetic = syntheticPass(noodle);
    validateNoodle(synthetic);
    logInfo('CLI', 'Validated synthetic noodle payload', { sessionId: synthetic.sessionId });

    const realResult = await uploadToB2(noodle, { synthetic: false });
    const syntheticResult = await uploadToB2(synthetic, { synthetic: true });

    logInfo('CLI', 'Upload complete', {
      realFile: realResult.fileName,
      syntheticFile: syntheticResult.fileName,
    });
  } catch (error) {
    logError('CLI', 'Failed to upload noodle from CLI', {
      message: error.message,
      validationErrors: error.validationErrors,
    });
    process.exitCode = 1;
  }
}

run();
