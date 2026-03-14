#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { buildFeatureVector } = require('../tools/featureVector');
const { ensurePrivacyLedger } = require('../src/privacyLedger');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) {
      continue;
    }
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readJson(filePath) {
  const resolved = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(resolved, 'utf-8'));
}

function main() {
  const args = parseArgs(process.argv);
  const noodlePath = args.noodle || args.input;
  const outputPath = args.output;

  if (!noodlePath) {
    console.error('Usage: node cli/extractFeatures.js --noodle <path> [--output <path>]');
    process.exit(1);
  }

  try {
    const noodle = readJson(noodlePath);
    ensurePrivacyLedger(noodle);
    const vector = buildFeatureVector(noodle);

    if (outputPath) {
      fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(vector, null, 2)}\n`, 'utf-8');
      console.log(`Feature vector written to ${path.resolve(outputPath)}.`);
    } else {
      console.log(JSON.stringify(vector, null, 2));
    }
  } catch (error) {
    console.error('Feature extraction failed:', error.message);
    process.exitCode = 1;
  }
}

main();
