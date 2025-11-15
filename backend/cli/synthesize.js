#!/usr/bin/env node
/**
 * CLI utility for generating synthetic noodles from existing noodle files.
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';

import { logError, logInfo } from '../log.js';
import { resolveSchemaVersion, validateNoodle, assertSchemaVersion } from '../schemas/index.js';
import { buildNoodle } from '../utils/buildNoodle.js';
import { syntheticPass } from '../syntheticPass.js';

/**
 * Reads and parses a JSON file from disk.
 *
 * @param {string} filePath Path to the JSON file.
 * @returns {Promise<any>} Parsed JSON payload.
 */
async function readJson(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const raw = await readFile(absolute, 'utf8');
  return JSON.parse(raw);
}

/**
 * Writes a JSON payload to disk with pretty formatting.
 *
 * @param {string} filePath Destination path.
 * @param {any} data Data to serialise.
 * @returns {Promise<string>} Absolute output path.
 */
async function writeJson(filePath, data) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  await writeFile(absolute, `${JSON.stringify(data, null, 2)}\n`);
  return absolute;
}

/**
 * Parses CLI arguments capturing optional profile flag alongside input and
 * output file paths.
 *
 * @returns {{ inputPath?: string, outputPath?: string, profile?: string }} Parsed arguments.
 */
function parseArguments() {
  const args = process.argv.slice(2);
  let inputPath;
  let outputPath;
  let profile;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--profile') {
      profile = args[index + 1];
      index += 1;
      continue;
    }
    if (!inputPath) {
      inputPath = arg;
    } else if (!outputPath) {
      outputPath = arg;
    }
  }

  return { inputPath, outputPath, profile };
}

/**
 * Main entry point for the CLI utility.
 */
async function run() {
  const { inputPath, outputPath, profile } = parseArguments();
  if (!inputPath) {
    console.error('Usage: node cli/synthesize.js <input-noodle-json> [output-json] [--profile <name>]');
    process.exitCode = 1;
    return;
  }

  try {
    const payload = await readJson(inputPath);
    const schemaVersion = resolveSchemaVersion(payload, 'v1.0.0');
    const safeVersion = assertSchemaVersion(schemaVersion);

    const noodle = buildNoodle({ ...payload, schema_version: safeVersion, synthetic: false });
    validateNoodle(noodle, safeVersion);

    const synthetic = await syntheticPass(noodle, { anonymizationProfile: profile });
    synthetic.schema_version = safeVersion;
    validateNoodle(synthetic, safeVersion);

    const targetPath = outputPath
      ? outputPath
      : path.join(path.dirname(inputPath), `${path.parse(inputPath).name}.synthetic.json`);
    const absoluteOutput = await writeJson(targetPath, synthetic);

    logInfo('CLI', 'Synthetic noodle generated', {
      source: inputPath,
      output: absoluteOutput,
      schemaVersion: safeVersion,
      anonymizationProfile: synthetic.anonymization_profile,
    });
  } catch (error) {
    logError('CLI', 'Failed to synthesise noodle', {
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
