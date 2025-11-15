#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { applyConsent } = require('../tools/consentUtils');
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
  const consentPath = args.consent;
  const outputPath = args.output;

  if (!noodlePath || !consentPath) {
    console.error('Usage: node cli/applyConsent.js --noodle <path> --consent <manifest> [--output <path>]');
    process.exit(1);
  }

  try {
    const noodle = readJson(noodlePath);
    ensurePrivacyLedger(noodle);
    const consent = readJson(consentPath);

    const { noodle: cleaned, removedFields, violations, exportAllowed } = applyConsent(noodle, consent);

    const result = {
      removedFields,
      violations,
      exportAllowed,
    };

    if (outputPath) {
      fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(cleaned, null, 2)}\n`, 'utf-8');
      console.log(`Cleaned noodle written to ${path.resolve(outputPath)}.`);
    } else {
      console.log(JSON.stringify(cleaned, null, 2));
    }

    if (!exportAllowed) {
      console.warn('Export is disallowed by current consent settings.');
    }

    if (removedFields.length > 0) {
      console.log(`Removed fields: ${removedFields.join(', ')}`);
    }
    if (violations.length > 0) {
      console.log(`Remaining violations: ${violations.join(', ')}`);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Failed to apply consent:', error.message);
    process.exitCode = 1;
  }
}

main();
