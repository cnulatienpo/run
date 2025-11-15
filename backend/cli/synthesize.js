#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

import { logError, logInfo } from '../log.js';
import { resolveSchemaVersion, validateNoodle, assertSchemaVersion } from '../schemas/index.js';
import { buildNoodle } from '../utils/buildNoodle.js';
import { syntheticPass } from '../syntheticPass.js';

async function readJson(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const raw = await readFile(absolute, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  await writeFile(absolute, `${JSON.stringify(data, null, 2)}\n`);
  return absolute;
}

async function run() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath) {
    console.error('Usage: node cli/synthesize.js <input-noodle-json> [output-json]');
    process.exitCode = 1;
    return;
  }

  try {
    const payload = await readJson(inputPath);
    const schemaVersion = resolveSchemaVersion(payload, 'v1.0.0');
    const safeVersion = assertSchemaVersion(schemaVersion);

    const noodle = buildNoodle({ ...payload, schema_version: safeVersion, synthetic: false });
    validateNoodle(noodle, safeVersion);

    const synthetic = syntheticPass(noodle);
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
