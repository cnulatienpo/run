#!/usr/bin/env node
/**
 * Developer sandbox for experimenting with noodle generation and upload
 * flows without starting the HTTP server.
 */

import { readFile } from 'fs/promises';
import path from 'path';

import { loadEnv } from '../config/loadEnv.js';
import { logError, logInfo } from '../log.js';
import { syntheticPass } from '../syntheticPass.js';
import { uploadToB2 } from '../uploadToB2.js';
import { assertSchemaVersion, resolveSchemaVersion, validateNoodle } from '../schemas/index.js';
import { buildNoodle } from '../utils/buildNoodle.js';

loadEnv();

/**
 * Parses CLI arguments for the sandbox runner.
 *
 * @returns {{ from?: string, profile?: string, dryRun: boolean, upload: boolean }} Parsed arguments.
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const options = { dryRun: false, upload: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--from') {
      options.from = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--profile') {
      options.profile = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--upload') {
      options.upload = true;
      continue;
    }
  }

  return options;
}

/**
 * Loads a noodle-like payload from disk when requested.
 *
 * @param {string|undefined} filePath Source JSON path.
 * @returns {Promise<any>} Parsed payload or a default sample.
 */
async function loadPayload(filePath) {
  if (!filePath) {
    return {
      data: {
        heartRate: 65,
        temperature: 36.6,
        steps: 4200,
      },
      events: [],
      notes: 'Sandbox generated sample',
    };
  }
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const raw = await readFile(absolute, 'utf8');
  return JSON.parse(raw);
}

/**
 * Builds and validates a noodle payload in preparation for sandbox actions.
 *
 * @param {any} payload Source payload.
 * @returns {Promise<{ noodle: any, schemaVersion: string }>} Normalised noodle data.
 */
async function prepareNoodle(payload) {
  const requestedVersion = resolveSchemaVersion(payload, 'v1.0.0');
  const schemaVersion = assertSchemaVersion(requestedVersion);
  const noodle = buildNoodle({ ...payload, schema_version: schemaVersion, synthetic: false });
  await validateNoodle(noodle, schemaVersion);
  return { noodle, schemaVersion };
}

/**
 * Main entry point for the sandbox runner.
 */
async function run() {
  const options = parseArguments();

  try {
    const payload = await loadPayload(options.from);
    const { noodle, schemaVersion } = await prepareNoodle(payload);

    logInfo('SANDBOX', 'Prepared real noodle payload', {
      schemaVersion,
      sessionId: noodle.sessionId,
    });

    const synthetic = await syntheticPass(noodle, { anonymizationProfile: options.profile });
    synthetic.schema_version = schemaVersion;
    await validateNoodle(synthetic, schemaVersion);

    logInfo('SANDBOX', 'Prepared synthetic noodle payload', {
      schemaVersion,
      sessionId: synthetic.sessionId,
      profile: synthetic.anonymization_profile,
    });

    if (options.dryRun || !options.upload) {
      logInfo('SANDBOX', 'Dry-run mode active. Skipping upload.', {
        dryRun: options.dryRun,
        uploadRequested: options.upload,
      });
      return;
    }

    const realResult = await uploadToB2(noodle, { synthetic: false });
    const syntheticResult = await uploadToB2(synthetic, { synthetic: true });

    logInfo('SANDBOX', 'Upload complete', {
      realFile: realResult.fileName,
      syntheticFile: syntheticResult.fileName,
    });
  } catch (error) {
    logError('SANDBOX', 'Sandbox execution failed', {
      message: error.message,
      validationErrors: error.validationErrors,
    });
    process.exitCode = 1;
  }
}

run();
