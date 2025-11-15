#!/usr/bin/env node
import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';

import { logError, logInfo } from '../log.js';
import { buildNoodle } from '../utils/buildNoodle.js';
import { syntheticPass } from '../syntheticPass.js';
import { uploadToB2 } from '../uploadToB2.js';
import { resolveSchemaVersion, validateNoodle, assertSchemaVersion } from '../schemas/index.js';

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
    const schemaVersion = resolveSchemaVersion(rawPayload, 'v1.0.0');
    const safeVersion = assertSchemaVersion(schemaVersion);

    const noodle = buildNoodle({ ...rawPayload, synthetic: false, schema_version: safeVersion });
    validateNoodle(noodle, safeVersion);
    logInfo('CLI', 'Validated local noodle payload', {
      sessionId: noodle.sessionId,
      schemaVersion: safeVersion,
    });

    const synthetic = syntheticPass(noodle);
    synthetic.schema_version = safeVersion;
    validateNoodle(synthetic, safeVersion);
    logInfo('CLI', 'Validated synthetic noodle payload', {
      sessionId: synthetic.sessionId,
      schemaVersion: safeVersion,
    });

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
