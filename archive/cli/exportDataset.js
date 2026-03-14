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

function listJsonFiles(dirPath) {
  return fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(dirPath, name));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function loadNormalizationProfiles() {
  const profilePath = path.resolve(__dirname, '..', 'config', 'normProfiles.json');
  if (!fs.existsSync(profilePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
}

function normalizeFeature(value, profile) {
  if (value == null) {
    return null;
  }
  const { mean, std } = profile;
  if (typeof mean !== 'number' || typeof std !== 'number' || std === 0) {
    return null;
  }
  return (value - mean) / std;
}

function buildNormalized(features, profiles) {
  const normalized = {};
  Object.entries(profiles).forEach(([key, profile]) => {
    let sourceValue = features[key];
    if (sourceValue == null && key === 'bpm') {
      sourceValue = features.peak_heart_bpm;
    }
    if (sourceValue == null) {
      return;
    }
    const normValue = normalizeFeature(sourceValue, profile);
    if (normValue != null) {
      normalized[`norm_${key}`] = Number(normValue.toFixed(4));
    }
  });
  return normalized;
}

function toCsv(records) {
  if (records.length === 0) {
    return '';
  }
  const headers = Object.keys(records[0]);
  const lines = [headers.join(',')];
  records.forEach((record) => {
    const row = headers
      .map((header) => {
        const value = record[header];
        if (value == null) {
          return '';
        }
        if (typeof value === 'string') {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(',');
    lines.push(row);
  });
  return `${lines.join('\n')}\n`;
}

function toJsonl(records) {
  return records.map((record) => JSON.stringify(record)).join('\n') + '\n';
}

function main() {
  const args = parseArgs(process.argv);
  const directory = args.dir || args.directory;
  const format = (args.format || 'csv').toLowerCase();
  const output = args.output;

  if (!directory) {
    console.error('Usage: node cli/exportDataset.js --dir <noodle-directory> [--format csv|jsonl] [--output <path>]');
    process.exit(1);
  }

  const dirPath = path.resolve(directory);
  if (!fs.existsSync(dirPath)) {
    console.error(`Directory not found: ${dirPath}`);
    process.exit(1);
  }

  const files = listJsonFiles(dirPath);
  if (files.length === 0) {
    console.error('No noodle JSON files found in the provided directory.');
    process.exit(1);
  }

  const normProfiles = loadNormalizationProfiles();

  const records = files.map((file) => {
    const noodle = readJson(file);
    ensurePrivacyLedger(noodle);
    const features = buildFeatureVector(noodle);
    const normalized = buildNormalized(features, normProfiles);
    const labels = noodle.training_labels || {};

    return {
      session_id: features.session_id,
      avg_speed: features.avg_speed,
      peak_heart_bpm: features.peak_heart_bpm,
      peak_bpm: features.peak_heart_bpm,
      sync_ratio: features.sync_ratio,
      flow_drops: features.flow_drops,
      cadence_stability: features.cadence_stability,
      tempo_alignment_score: features.tempo_alignment_score,
      label: labels.motion_quality || '',
      mood_label: labels.mood || '',
      intent_label: labels.intent || '',
      ...normalized,
    };
  });

  let serialized;
  if (format === 'jsonl') {
    serialized = toJsonl(
      records.map((record) => ({
        features: {
          session_id: record.session_id,
          avg_speed: record.avg_speed,
          peak_heart_bpm: record.peak_heart_bpm,
          sync_ratio: record.sync_ratio,
          flow_drops: record.flow_drops,
          cadence_stability: record.cadence_stability,
          tempo_alignment_score: record.tempo_alignment_score,
        },
        normalized: Object.fromEntries(
          Object.entries(record).filter(([key]) => key.startsWith('norm_')),
        ),
        labels: {
          motion_quality: record.label || undefined,
          mood: record.mood_label || undefined,
          intent: record.intent_label || undefined,
        },
      })),
    );
  } else {
    serialized = toCsv(records);
  }

  if (output) {
    fs.writeFileSync(path.resolve(output), serialized, 'utf-8');
    console.log(`Dataset exported to ${path.resolve(output)}.`);
  } else {
    process.stdout.write(serialized);
  }
}

main();
