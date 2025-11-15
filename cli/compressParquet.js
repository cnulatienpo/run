#!/usr/bin/env node

const path = require('path');

const { compressDirectory } = require('../tools/compressToParquet');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) {
      // treat standalone positional argument as input directory
      if (!args.input) {
        args.input = current;
      }
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

function printHelp() {
  /* eslint-disable no-console */
  console.log(`Usage: node cli/compressParquet.js --input <dir> --output <dir> [options]

Options:
  --input <dir>            Directory containing noodle JSON files (required)
  --output <dir>           Destination directory for Parquet exports (required)
  --filter <mode>          Filter sessions (synthetic_only|real_only|consented)
  --round <precision>      Decimal rounding precision for float fields (default: 2)
  --drop <fields>          Comma-separated list of fields to exclude
  --compression <codec>    Compression codec (snappy|zstd) default: snappy
  --alias                  Enable short field aliases (e.g., session_id → sid)
  --dry-run                Perform a dry run without writing files
  --privacy-check          Evaluate privacy score before export
  --privacy-threshold <n>  Override privacy score threshold (default: 0.6)
  --features               Emit companion feature vector JSON files
  --heart-jitter <n>       Max jitter to apply to heart_bpm (default: 1.5)
  --help                   Show this help message
`);
  /* eslint-enable no-console */
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const inputDir = args.input || args.i || args.dir || args.directory;
  const outputDir = args.output || args.o;

  if (!inputDir || !outputDir) {
    printHelp();
    process.exit(1);
  }

  const options = {
    filter: args.filter,
    roundPrecision: args.round ? Number(args.round) : undefined,
    dropFields: args.drop ? args.drop.split(',').map((value) => value.trim()) : undefined,
    compression: args.compression ? args.compression.toUpperCase() : undefined,
    alias: Boolean(args.alias),
    dryRun: Boolean(args['dry-run'] || args.dryRun),
    privacyCheck: Boolean(args['privacy-check'] || args.privacyCheck),
    privacyThreshold: args['privacy-threshold'] ? Number(args['privacy-threshold']) : undefined,
    writeFeatures: Boolean(args.features),
    heartJitterAmplitude: args['heart-jitter'] ? Number(args['heart-jitter']) : undefined,
  };

  if (Number.isNaN(options.roundPrecision)) {
    options.roundPrecision = undefined;
  }

  if (!options.roundPrecision) {
    options.roundPrecision = undefined;
  }

  if (Number.isNaN(options.privacyThreshold)) {
    options.privacyThreshold = undefined;
  }

  if (Number.isNaN(options.heartJitterAmplitude)) {
    options.heartJitterAmplitude = undefined;
  }

  const resolvedOutput = path.resolve(outputDir);
  try {
    const summary = await compressDirectory(inputDir, resolvedOutput, options);
    /* eslint-disable no-console */
    console.log(`Processed: ${summary.processed}`);
    console.log(`Compressed: ${summary.compressed}`);
    console.log(`Skipped: ${summary.skipped}`);
    console.log(`Errors: ${summary.errors}`);
    if (summary.results.length > 0) {
      console.log('\nExports:');
      summary.results.forEach((result) => {
        console.log(` - ${result.sessionId}: ${result.parquetPath}`);
      });
    }
    /* eslint-enable no-console */
  } catch (error) {
    console.error(`Compression failed: ${error.message}`);
    process.exit(1);
  }
}

main();

