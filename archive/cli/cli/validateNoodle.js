#!/usr/bin/env node
/**
 * CLI tool for validating noodle JSON payloads against the supported schema.
 */

import { readFile } from 'fs/promises';
import path from 'path';

import { logError, logInfo } from '../log.js';
import { resolveSchemaVersion, validateNoodle, assertSchemaVersion } from '../schemas/index.js';
import { buildNoodle } from '../utils/buildNoodle.js';

/**
 * Reads a JSON file from disk and parses it into a JavaScript object.
 *
 * @param {string} filePath Path to the JSON file.
 * @returns {Promise<any>} Parsed JSON payload.
 */
async function loadJson(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const raw = await readFile(absolute, 'utf8');
  return JSON.parse(raw);
}

/**
 * Main entry point for the validation CLI.
 */
async function run() {
  const [, , filePath] = process.argv;
  if (!filePath) {
    console.error('Usage: node cli/validateNoodle.js <path-to-noodle-json>');
    process.exitCode = 1;
    return;
  }

  try {
    const payload = await loadJson(filePath);
    const schemaVersion = resolveSchemaVersion(payload, 'v1.0.0');
    const safeVersion = assertSchemaVersion(schemaVersion);

    const noodle = buildNoodle({ ...payload, schema_version: safeVersion, synthetic: false });
    validateNoodle(noodle, safeVersion);

    logInfo('CLI', 'Validation succeeded', {
      sessionId: noodle.sessionId,
      schemaVersion: safeVersion,
    });
  } catch (error) {
    logError('CLI', 'Validation failed', {
      message: error.message,
      validationErrors: error.validationErrors,
    });
    if (error.validationErrors) {
      error.validationErrors.forEach((validationError) => {
        console.error(JSON.stringify(validationError));
      });
    }
    process.exitCode = 1;
  }
}

run();
