#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');

const { buildFeatureVector } = require('../tools/featureVector');
const { ensurePrivacyLedger } = require('../src/privacyLedger');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      if (args[key] === undefined) {
        args[key] = true;
      } else if (Array.isArray(args[key])) {
        args[key].push(true);
      } else {
        args[key] = [args[key], true];
      }
    } else {
      if (args[key] === undefined) {
        args[key] = next;
      } else if (Array.isArray(args[key])) {
        args[key].push(next);
      } else {
        args[key] = [args[key], next];
      }
      i += 1;
    }
  }
  return args;
}

function resolveDirectory(inputPath) {
  if (!inputPath) {
    throw new Error('A source directory of noodles is required.');
  }
  const resolved = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Source directory not found: ${resolved}`);
  }
  return resolved;
}

function listJsonFiles(dirPath) {
  return fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(dirPath, name));
}

function readJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getSessionId(noodle) {
  return (
    noodle.sessionId ||
    noodle.session_id ||
    noodle.metadata?.session_id ||
    noodle.metadata?.sessionId ||
    noodle.id ||
    `session-${crypto.randomBytes(4).toString('hex')}`
  );
}

function getPrivacyScore(noodle) {
  const summary = noodle.privacy_summary || noodle.privacySummary || {};
  const ledger = noodle.privacy_ledger || {};
  const derived =
    typeof summary.score === 'number'
      ? summary.score
      : typeof ledger.privacy_score === 'number'
        ? ledger.privacy_score
        : null;
  return typeof derived === 'number' && Number.isFinite(derived) ? derived : 0;
}

function deriveSourceProfile(noodle) {
  const ledger = noodle.privacy_ledger || {};
  const candidates = [
    noodle.synthetic_profile,
    noodle.syntheticProfile,
    ledger.synthetic_profile,
    ledger.syntheticProfile,
    noodle.profile,
  ].filter((value) => typeof value === 'string' && value.trim().length > 0);
  return candidates.length > 0 ? candidates[0] : null;
}

function deriveSessionTags(noodle) {
  if (Array.isArray(noodle.tags)) {
    return noodle.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0);
  }
  if (Array.isArray(noodle.metadata?.tags)) {
    return noodle.metadata.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0);
  }
  return [];
}

function evaluateConsent(noodle) {
  const ledger = ensurePrivacyLedger(noodle);
  const consentFlag =
    noodle.consent_verified === true ||
    noodle.metadata?.consent_verified === true ||
    ledger.export_approved === true;
  const consentNote = noodle.consent_note || noodle.metadata?.consent_note || null;
  return {
    hasConsent: consentFlag,
    note: consentNote,
    ledger,
  };
}

function autoRedact(noodle) {
  const working = JSON.parse(JSON.stringify(noodle));
  delete working.raw_data;
  delete working.rawData;
  delete working.streams;
  delete working.media;
  delete working.attachments;
  delete working.sensitive_notes;
  delete working.sensitiveNotes;

  if (working.data && typeof working.data === 'object') {
    Object.keys(working.data).forEach((key) => {
      const lower = key.toLowerCase();
      if (lower.includes('biometric') || lower.includes('heart') || lower.includes('gps')) {
        delete working.data[key];
      }
    });
  }

  if (Array.isArray(working.events)) {
    working.events = working.events.map((event) => ({
      type: event.type,
      timestamp: event.timestamp,
    }));
  }

  ensurePrivacyLedger(working, { exportApproved: false });
  working.privacy_ledger.redaction_applied = true;
  return working;
}

function buildFeaturesRecord(noodle, sessionId) {
  try {
    const features = buildFeatureVector(noodle);
    return {
      ...features,
      session_id: sessionId,
    };
  } catch (error) {
    console.warn(`Failed to build feature vector for ${sessionId}: ${error.message}`);
    return null;
  }
}

function serializeCsv(records) {
  if (!records || records.length === 0) {
    return '';
  }
  const headers = Array.from(
    records.reduce((set, record) => {
      Object.keys(record).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );
  const lines = [headers.join(',')];
  records.forEach((record) => {
    const row = headers
      .map((header) => {
        const value = record[header];
        if (value == null) {
          return '';
        }
        if (typeof value === 'number') {
          return Number.isFinite(value) ? value : '';
        }
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      })
      .join(',');
    lines.push(row);
  });
  return `${lines.join('\n')}\n`;
}

function loadPublishers() {
  const projectRoot = path.resolve(__dirname, '..');
  const publisherPath = path.join(projectRoot, 'publishers.json');
  if (!fs.existsSync(publisherPath)) {
    return [];
  }
  try {
    const payload = JSON.parse(fs.readFileSync(publisherPath, 'utf-8'));
    if (Array.isArray(payload)) {
      return payload;
    }
    if (payload && typeof payload === 'object' && Array.isArray(payload.publishers)) {
      return payload.publishers;
    }
    if (payload && typeof payload === 'object') {
      return [payload];
    }
  } catch (error) {
    console.warn('Failed to parse publishers.json:', error.message);
  }
  return [];
}

function resolvePublisher(publisherId) {
  if (!publisherId) {
    return null;
  }
  const publishers = loadPublishers();
  return publishers.find((publisher) => publisher.id === publisherId) || null;
}

function buildLicenseText(licenseCode) {
  switch (licenseCode) {
    case 'CC-BY-4.0':
      return `Creative Commons Attribution 4.0 International (CC BY 4.0)\n\nYou are free to share and adapt the material for any purpose, even commercially, provided you give appropriate credit, provide a link to the license, and indicate if changes were made.\n\nFull license: https://creativecommons.org/licenses/by/4.0/legalcode\n`;
    case 'CC-BY-NC-4.0':
      return `Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)\n\nYou are free to share and adapt the material for non-commercial purposes, provided you give appropriate credit, provide a link to the license, and indicate if changes were made.\n\nFull license: https://creativecommons.org/licenses/by-nc/4.0/legalcode\n`;
    case 'MIT':
      return `MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this dataset to deal in the dataset without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the dataset, and to permit persons to whom the dataset is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the dataset.\n\nTHE DATASET IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.\n`;
    default:
      return `Custom License\n\nThis dataset is distributed under custom terms specified by the publisher. Contact the publisher for details.\n`;
  }
}

function buildReadme({ datasetId, description, totalSessions, tags, licenseCode, consentVerified, publisher }) {
  const lines = [];
  lines.push(`# ${datasetId}`);
  lines.push('');
  if (description) {
    lines.push(description);
    lines.push('');
  }
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total sessions:** ${totalSessions}`);
  lines.push(`- **Consent verified:** ${consentVerified ? 'Yes' : 'Partial / Pending'}`);
  lines.push(`- **License:** ${licenseCode}`);
  if (Array.isArray(tags) && tags.length > 0) {
    lines.push(`- **Tags:** ${tags.join(', ')}`);
  }
  if (publisher) {
    lines.push(`- **Publisher:** ${publisher.display_name || publisher.id}`);
    if (publisher.contact) {
      lines.push(`- **Contact:** ${publisher.contact}`);
    }
  }
  lines.push('');
  lines.push('## Contents');
  lines.push('');
  lines.push('- `sessions/` – packaged noodle sessions with metadata sidecars');
  lines.push('- `features.csv` – feature vectors for downstream ML usage');
  lines.push('- `manifest.json` – dataset manifest metadata');
  lines.push('- `hashes.json` – SHA256 integrity hashes for every file');
  lines.push('- `LICENSE.txt` – licensing terms for downstream usage');
  lines.push('');
  lines.push('Generated by `cli/packageDataset.js`.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function writeText(filePath, text) {
  fs.writeFileSync(filePath, text, 'utf-8');
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

function buildMetaSidecar({ sessionId, datasetId, noodle }) {
  const meta = {
    session_id: sessionId,
    bundle: datasetId,
    remixed_from: noodle.remixed_from || noodle.metadata?.remixed_from || null,
    exported_at: new Date().toISOString(),
  };
  return meta;
}

function normalizePublisherRoot(publisher) {
  if (!publisher || !publisher.upload_root) {
    return '';
  }
  const cleaned = publisher.upload_root
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/^datasets\//, '');
  return cleaned;
}

function deriveOutputRoot(baseDir, datasetId, publisher) {
  const safeId = datasetId.replace(/[^a-zA-Z0-9-_]/g, '_');
  const publisherRoot = normalizePublisherRoot(publisher);
  if (publisherRoot) {
    return path.join(baseDir, publisherRoot, safeId);
  }
  return path.join(baseDir, safeId);
}

function sanitizeDatasetId(datasetId, sourceDir) {
  if (datasetId) {
    return datasetId;
  }
  const fallback = path.basename(sourceDir).replace(/\s+/g, '_');
  return fallback || `dataset_${Date.now()}`;
}

function filterByOptions(noodle, { filter, excludeTag }) {
  if (!filter && !excludeTag) {
    return true;
  }
  const tags = deriveSessionTags(noodle).map((tag) => tag.toLowerCase());
  if (excludeTag && tags.includes(excludeTag.toLowerCase())) {
    return false;
  }
  if (filter === 'synthetic_only') {
    const ledger = noodle.privacy_ledger || {};
    const isSynthetic =
      noodle.synthetic === true ||
      ledger.input_type === 'synthetic' ||
      ledger.synthetic_profile != null;
    return isSynthetic;
  }
  return true;
}

async function zipDirectory(sourceDir, zipPath) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

let uploadBufferToB2 = null;

async function getUploadBufferToB2() {
  if (!uploadBufferToB2) {
    const mod = await import('../backend/uploadToB2.js');
    uploadBufferToB2 = mod.uploadBufferToB2;
  }
  return uploadBufferToB2;
}

async function uploadFileToB2(localPath, remotePath) {
  const uploader = await getUploadBufferToB2();
  const data = fs.readFileSync(localPath);
  const uploadResponse = await uploader({
    buffer: data,
    fileName: remotePath,
    contentType: 'application/zip',
    info: {
      size: String(data.length),
    },
  });

  return {
    fileName: remotePath,
    size: data.length,
    response: uploadResponse.raw,
    url: uploadResponse.url,
  };
}

function updatePublishedIndex(baseDir, entry) {
  const indexPath = path.join(baseDir, 'published_datasets.json');
  let index = [];
  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      if (!Array.isArray(index)) {
        index = [];
      }
    } catch (error) {
      console.warn('Failed to parse existing published_datasets.json:', error.message);
      index = [];
    }
  }
  const filtered = index.filter((item) => item.dataset_id !== entry.dataset_id);
  filtered.push(entry);
  writeJson(indexPath, filtered);
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const sourceDir = resolveDirectory(args.dir || args.directory);
    const datasetId = sanitizeDatasetId(args.id || args.dataset_id, sourceDir);
    const description = args.description || `Dataset packaged from ${sourceDir}`;
    const outputBase = path.resolve(args.output || path.join(process.cwd(), 'datasets'));
    const publisher = resolvePublisher(args.publisher);
    const licenseCode = args.license || publisher?.default_license || 'custom';
    const filterOption = args.filter || null;
    const excludeTag = args.exclude || null;
    const datasetTags = [];
    if (args.tag) {
      const tagValues = Array.isArray(args.tag) ? args.tag : [args.tag];
      tagValues
        .flatMap((value) => String(value).split(','))
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => datasetTags.push(value));
    }
    const includeZip = Boolean(args.zip);
    const consentClean = Boolean(args['consent-clean'] || args.consentClean);

    ensureDir(outputBase);

    const outputRoot = deriveOutputRoot(outputBase, datasetId, publisher);
    ensureDir(outputRoot);

    const sessionsDir = path.join(outputRoot, 'sessions');
    ensureDir(sessionsDir);

    const privacyDir = path.join(outputRoot, 'privacy');
    ensureDir(privacyDir);

    const mutationDir = path.join(outputRoot, 'mutations');
    ensureDir(mutationDir);

    const manifestSessions = [];
    const featureRecords = [];
    const aggregatedTags = new Set();
    const sourceProfiles = new Set();
    let privacyScoreTotal = 0;
    let consentFailures = 0;
    let consentRedactions = 0;

    const files = listJsonFiles(sourceDir);
    if (files.length === 0) {
      throw new Error('No noodle JSON files found in the source directory.');
    }

    files.forEach((filePath) => {
      const noodle = readJson(filePath);
      const filteredIn = filterByOptions(noodle, { filter: filterOption, excludeTag });
      if (!filteredIn) {
        return;
      }
      const consent = evaluateConsent(noodle);
      let workingNoodle = noodle;
      if (!consent.hasConsent) {
        if (consentClean) {
          console.warn(`Consent missing for ${filePath}, applying auto-redaction.`);
          workingNoodle = autoRedact(noodle);
          consentRedactions += 1;
        } else {
          console.warn(`Skipping ${filePath} due to missing consent.`);
          consentFailures += 1;
          return;
        }
      }

      ensurePrivacyLedger(workingNoodle);
      const sessionId = getSessionId(workingNoodle);
      const outputName = `${sessionId}.json`;
      const sessionPath = path.join(sessionsDir, outputName);
      writeJson(sessionPath, workingNoodle);

      const ledgerPath = path.join(privacyDir, `${sessionId}.ledger.json`);
      writeJson(ledgerPath, workingNoodle.privacy_ledger || {});

      if (Array.isArray(workingNoodle.mutation_history) || Array.isArray(workingNoodle.mutations)) {
        const history = workingNoodle.mutation_history || workingNoodle.mutations;
        const mutationPath = path.join(mutationDir, `${sessionId}.mutations.json`);
        writeJson(mutationPath, history);
      }

      const meta = buildMetaSidecar({ sessionId, datasetId, noodle: workingNoodle });
      const metaPath = path.join(sessionsDir, `${sessionId}.meta.json`);
      writeJson(metaPath, meta);

      const features = buildFeaturesRecord(workingNoodle, sessionId);
      if (features) {
        featureRecords.push(features);
      }

      const privacyScore = getPrivacyScore(workingNoodle);
      privacyScoreTotal += privacyScore;

      const profile = deriveSourceProfile(workingNoodle);
      if (profile) {
        sourceProfiles.add(profile);
      }

      const sessionTags = deriveSessionTags(workingNoodle);
      sessionTags.forEach((tag) => aggregatedTags.add(tag));

      const consentStatus = consent.hasConsent ? 'verified' : consentClean ? 'redacted' : 'unknown';
      manifestSessions.push({
        session_id: sessionId,
        source_file: path.basename(filePath),
        consent_status: consentStatus,
        privacy_score: privacyScore,
      });
    });

    if (manifestSessions.length === 0) {
      throw new Error('No sessions qualified for packaging after applying filters and consent checks.');
    }

    const featureCsv = serializeCsv(featureRecords);
    if (featureCsv) {
      writeText(path.join(outputRoot, 'features.csv'), featureCsv);
    }

    const manifest = {
      dataset_id: datasetId,
      description,
      created_at: new Date().toISOString(),
      total_sessions: manifestSessions.length,
      privacy_score_avg: Number((privacyScoreTotal / manifestSessions.length).toFixed(4)),
      source_profiles: Array.from(sourceProfiles),
      features_included: featureRecords.length > 0,
      license: licenseCode,
      tags: Array.from(new Set([...Array.from(aggregatedTags), ...datasetTags])),
      consent_verified: consentFailures === 0 && consentRedactions === 0,
      publisher: publisher
        ? {
            id: publisher.id,
            display_name: publisher.display_name,
            contact: publisher.contact || null,
          }
        : null,
      sessions: manifestSessions,
    };

    writeJson(path.join(outputRoot, 'manifest.json'), manifest);

    const readme = buildReadme({
      datasetId,
      description,
      totalSessions: manifest.total_sessions,
      tags: manifest.tags,
      licenseCode: manifest.license,
      consentVerified: manifest.consent_verified,
      publisher,
    });
    writeText(path.join(outputRoot, 'README.md'), readme);

    const licenseText = buildLicenseText(licenseCode);
    writeText(path.join(outputRoot, 'LICENSE.txt'), licenseText);

    const filesForHash = [];
    function collectFiles(dir) {
      fs.readdirSync(dir).forEach((entry) => {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          collectFiles(fullPath);
        } else {
          filesForHash.push(fullPath);
        }
      });
    }
    collectFiles(outputRoot);

    const hashIndex = {};
    filesForHash.forEach((filePath) => {
      const relative = path.relative(outputRoot, filePath);
      hashIndex[relative] = hashFile(filePath);
    });
    writeJson(path.join(outputRoot, 'hashes.json'), hashIndex);

    let uploadResult = null;
    if (includeZip) {
      const zipPath = `${outputRoot}.zip`;
      console.log(`Creating zip archive at ${zipPath}`);
      await zipDirectory(outputRoot, zipPath);
      const checksum = hashFile(zipPath);
      console.log(`Zip SHA256: ${checksum}`);
      if (!args['skip-upload']) {
        const publisherRoot = normalizePublisherRoot(publisher);
        const remotePath = path.join('datasets', publisherRoot, `${path.basename(outputRoot)}.zip`)
          .split(path.sep)
          .filter(Boolean)
          .join('/');
        console.log(`Uploading ${zipPath} to Backblaze B2 at ${remotePath}`);
        uploadResult = await uploadFileToB2(zipPath, remotePath);
        if (uploadResult.url) {
          console.log(`Uploaded bundle URL: ${uploadResult.url}`);
        }
        uploadResult.checksum = checksum;
      }
    }

    if (uploadResult) {
      updatePublishedIndex(outputBase, {
        dataset_id: datasetId,
        description,
        created_at: manifest.created_at,
        total_sessions: manifest.total_sessions,
        tags: manifest.tags,
        license: manifest.license,
        url: uploadResult.url || null,
        checksum: uploadResult.checksum,
        size_bytes: uploadResult.size || null,
        publisher: publisher ? publisher.id : null,
        usage_stats: null,
      });
    }

    console.log(`Dataset packaged at ${outputRoot}`);
    if (uploadResult) {
      console.log(`Remote bundle URL: ${uploadResult.url || 'N/A'}`);
    }
  } catch (error) {
    console.error('Failed to package dataset:', error.message);
    process.exit(1);
  }
}

main();
