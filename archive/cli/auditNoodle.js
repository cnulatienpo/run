#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { applyConsent, findConsentViolations } = require('../tools/consentUtils');
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

function logLedger(ledger) {
  console.log('Privacy Ledger:');
  Object.entries(ledger).forEach(([key, value]) => {
    console.log(`  ${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
  });
}

function main() {
  const args = parseArgs(process.argv);
  const noodlePath = args.noodle || args.input;
  const consentPath = args.consent;
  const shouldFix = Boolean(args.fix);
  const outputPath = args.output;

  if (!noodlePath) {
    console.error('Usage: node cli/auditNoodle.js --noodle <path> [--consent manifest.json] [--fix] [--output <path>]');
    process.exit(1);
  }

  try {
    const noodle = readJson(noodlePath);
    ensurePrivacyLedger(noodle);

    const consent = consentPath ? readJson(consentPath) : null;

    console.log(`Session: ${noodle.sessionId}`);
    console.log(`Synthetic: ${Boolean(noodle.synthetic)}`);
    logLedger(noodle.privacy_ledger);

    if (consent) {
      console.log('Consent Manifest Loaded for auditing.');
    }

    const violations = consent ? findConsentViolations(noodle, consent) : [];

    if (violations.length > 0) {
      console.warn('Consent violations detected:');
      violations.forEach((v) => console.warn(`  - ${v}`));
    } else if (consent) {
      console.log('No consent violations detected.');
    }

    if (shouldFix && consent) {
      const { noodle: cleaned, removedFields, exportAllowed } = applyConsent(noodle, consent);
      const destination = outputPath ? path.resolve(outputPath) : path.resolve(noodlePath);
      fs.writeFileSync(destination, `${JSON.stringify(cleaned, null, 2)}\n`, 'utf-8');
      console.log(`Consent cleaning applied. Output written to ${destination}.`);
      if (removedFields.length > 0) {
        console.log(`Removed fields: ${removedFields.join(', ')}`);
      }
      console.log(`Export allowed: ${exportAllowed}`);
      if (!args.force) {
        const { validateNoodle } = require('../src/validateNoodle');
        validateNoodle(cleaned);
        console.log('Validated cleaned noodle against schema.');
      }
    } else if (shouldFix && !consent) {
      console.warn('Cannot apply --fix without a consent manifest.');
    }
  } catch (error) {
    console.error('Audit failed:', error.message);
    process.exitCode = 1;
  }
}

main();
