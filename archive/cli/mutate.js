#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { mutateSession } = require('../tools/mutateSession');
const { privacyScore } = require('../tools/privacyScore');
const { anonymizePlan } = require('../tools/anonymizePlan');
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

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function defaultOutputPath(noodle, mutationId) {
  const sessionSegment = noodle.sessionId || 'session';
  const safeId = mutationId ? mutationId.slice(0, 12) : Date.now();
  return path.join('remixes', `${sessionSegment}_${safeId}.json`);
}

function writeRemixMetadata(outputFile, noodle, spec, sourceSessionId) {
  const metadata = {
    source_session: sourceSessionId,
    mutation_id: noodle.mutation_id,
    mutation_spec: spec,
    generated_at: new Date().toISOString(),
    export_status: noodle.privacy_ledger?.export_approved ? 'approved' : 'restricted',
  };

  const metaPath = `${outputFile.replace(/\.json$/, '')}.meta.json`;
  fs.writeFileSync(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
}

function main() {
  const args = parseArgs(process.argv);
  const sourcePath = args.source;
  const specPath = args.spec;
  const outputPath = args.output;
  const dryRun = Boolean(args['dry-run'] || args.dryRun);
  const force = Boolean(args.force);

  if (!sourcePath || !specPath) {
    console.error('Usage: node cli/mutate.js --source <noodle.json> --spec <mutation_spec.json> [--output <path>] [--dry-run] [--force]');
    process.exit(1);
  }

  try {
    const noodle = readJson(sourcePath);
    ensurePrivacyLedger(noodle);
    const spec = readJson(specPath);
    const mutated = mutateSession(noodle, spec, { baseDir: path.dirname(path.resolve(specPath)) });
    ensurePrivacyLedger(mutated);

    const score = privacyScore(mutated);
    const plan = anonymizePlan(mutated);

    if (!force) {
      const { validateNoodle } = require('../src/validateNoodle');
      validateNoodle(mutated);
    }

    console.log(`Mutation applied. New mutation_id: ${mutated.mutation_id}`);
    console.log(`Privacy score: ${score.score}`);
    console.log(`Recommendation: ${score.recommendation}`);
    console.log(`Suggested anonymization steps: ${plan.steps.join('; ')}`);

    if (dryRun) {
      console.log('Dry run enabled. No files were written.');
      return;
    }

    const outputFile = path.resolve(outputPath || defaultOutputPath(mutated, mutated.mutation_id));
    ensureDirectoryExists(path.dirname(outputFile));
    fs.writeFileSync(outputFile, `${JSON.stringify(mutated, null, 2)}\n`, 'utf-8');
    console.log(`Mutated noodle written to ${outputFile}`);

    writeRemixMetadata(outputFile, mutated, spec, noodle.sessionId);
  } catch (error) {
    console.error('Mutation failed:', error.message);
    process.exitCode = 1;
  }
}

main();
