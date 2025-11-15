#!/usr/bin/env node
/**
 * CLI utility for generating noodles based on a schema version and
 * optional partial JSON input.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { logError, logInfo } from '../log.js';
import { assertSchemaVersion, loadSchema, validateNoodle } from '../schemas/index.js';
import { buildNoodle } from '../utils/buildNoodle.js';
import { syntheticPass } from '../syntheticPass.js';

/**
 * Parses CLI arguments, returning the schema version, partial input path,
 * optional output location, synthetic flag, and anonymisation profile.
 *
 * @returns {{ version?: string, inputPath?: string, output?: string, synthetic: boolean, profile?: string }} Parsed arguments.
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const result = { synthetic: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!result.version) {
      result.version = arg;
      continue;
    }
    if (arg === '--input') {
      result.inputPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--output') {
      result.output = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--synthetic') {
      result.synthetic = true;
      continue;
    }
    if (arg === '--profile') {
      result.profile = args[index + 1];
      index += 1;
      continue;
    }
  }

  return result;
}

/**
 * Loads a JSON document from disk if a path is provided.
 *
 * @param {string|undefined} filePath Path to the JSON document.
 * @returns {Promise<any>} Parsed JSON payload or an empty object.
 */
async function loadPartialPayload(filePath) {
  if (!filePath) {
    return {};
  }
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const raw = await readFile(absolute, 'utf8');
  return JSON.parse(raw);
}

/**
 * Determines the output file path. If the provided path points to a
 * directory, a timestamped filename is appended. The directory is created
 * when necessary.
 *
 * @param {string|undefined} basePath Desired output path or directory.
 * @param {string} version Schema version tag.
 * @returns {Promise<string>} Absolute output path for the noodle file.
 */
async function resolveOutputPath(basePath, version) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (!basePath) {
    return path.resolve(process.cwd(), `noodle-${version}-${timestamp}.json`);
  }
  const absolute = path.isAbsolute(basePath) ? basePath : path.resolve(process.cwd(), basePath);
  if (absolute.endsWith('.json')) {
    await mkdir(path.dirname(absolute), { recursive: true });
    return absolute;
  }
  await mkdir(absolute, { recursive: true });
  return path.join(absolute, `noodle-${version}-${timestamp}.json`);
}

/**
 * Generates a noodle payload using defaults defined in the schema.
 *
 * @param {string} version Schema version tag.
 * @param {any} partial Partial noodle payload supplied by the user.
 * @param {boolean} syntheticFlag Indicates synthetic mode.
 * @returns {Promise<any>} Generated noodle payload.
 */
async function generateNoodle(version, partial, syntheticFlag) {
  const schemaVersion = await assertSchemaVersion(version);
  const schema = loadSchema(schemaVersion);
  const ajv = new Ajv({ useDefaults: true, coerceTypes: true, allErrors: true, strict: false });
  addFormats(ajv);
  const validator = ajv.compile(schema);

  const baseData = {
    heartRate: 60,
    steps: 0,
    ...(partial?.data || {}),
  };

  const noodle = buildNoodle({
    ...partial,
    data: baseData,
    schema_version: schemaVersion,
    synthetic: syntheticFlag,
  });

  validator(noodle);
  await validateNoodle(noodle, schemaVersion);
  return noodle;
}

/**
 * Main entry point for generating noodles from schema metadata.
 */
async function run() {
  const args = parseArguments();
  if (!args.version) {
    console.error('Usage: node cli/genNoodleFromSchema.js <schema-version> [--input file] [--output path] [--synthetic] [--profile name]');
    process.exitCode = 1;
    return;
  }

  try {
    const partial = await loadPartialPayload(args.inputPath);
    const noodle = await generateNoodle(args.version, partial, args.synthetic);

    let outputPayload = noodle;
    if (args.synthetic) {
      outputPayload = await syntheticPass(noodle, { anonymizationProfile: args.profile });
    }

    const outputPath = await resolveOutputPath(args.output, args.version);
    await writeFile(outputPath, `${JSON.stringify(outputPayload, null, 2)}\n`);

    logInfo('CLI', 'Generated noodle from schema', {
      version: args.version,
      synthetic: args.synthetic,
      anonymizationProfile: outputPayload.anonymization_profile,
      output: outputPath,
      input: args.inputPath,
    });
  } catch (error) {
    logError('CLI', 'Failed to generate noodle from schema', {
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
