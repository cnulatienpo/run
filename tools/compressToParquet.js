const fs = require('fs');
const path = require('path');

const parquet = require('parquetjs-lite');

const { ensurePrivacyLedger } = require('../src/privacyLedger');
const { privacyScore } = require('./privacyScore');
const { buildFeatureVector } = require('./featureVector');

const LOG_PATH = path.resolve(__dirname, '..', 'logs', 'compression.log');
const DEFAULT_ROUND_PRECISION = 2;
const DEFAULT_COMPRESSION = 'SNAPPY';
const PRIVACY_THRESHOLD = 0.6;

const BASE_FIELD_DEFINITIONS = [
  { key: 'session_id', type: 'UTF8' },
  { key: 't_ms', type: 'INT32', encoding: 'DELTA_BINARY_PACKED' },
  { key: 'speed', type: 'FLOAT', optional: true },
  { key: 'cadence', type: 'FLOAT', optional: true },
  { key: 'stride_length', type: 'FLOAT', optional: true },
  { key: 'heart_bpm', type: 'FLOAT', optional: true },
  { key: 'synthetic_flag', type: 'BOOLEAN' },
  { key: 'cue_event', type: 'UTF8', optional: true },
];

const FIELD_ALIASES = {
  session_id: 'sid',
  t_ms: 'dt',
  speed: 'spd',
  cadence: 'cad',
  stride_length: 'str',
  heart_bpm: 'hb',
  synthetic_flag: 'syn',
  cue_event: 'cue',
};

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function appendLog(message) {
  ensureDirectory(path.dirname(LOG_PATH));
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_PATH, `[${timestamp}] ${message}\n`, 'utf-8');
}

function toNumber(value) {
  if (value == null) {
    return null;
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    if (['true', 'yes', '1'].includes(lowered)) {
      return true;
    }
    if (['false', 'no', '0'].includes(lowered)) {
      return false;
    }
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return false;
}

function sanitizeFloat(value, precision) {
  if (value == null) {
    return null;
  }
  const numeric = toNumber(value);
  if (numeric == null) {
    return null;
  }
  if (typeof precision === 'number' && precision >= 0) {
    return Number(numeric.toFixed(precision));
  }
  return numeric;
}

function deriveSessionId(noodle, fallbackPath) {
  if (noodle.sessionId) {
    return noodle.sessionId;
  }
  if (noodle.session_id) {
    return noodle.session_id;
  }
  return path.basename(fallbackPath, path.extname(fallbackPath));
}

function parseTime(value) {
  if (!value) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    return numeric;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function buildBaseRow(noodle, sessionId, event, options) {
  const metadata = event.metadata || {};
  const eventType = (event.eventType || '').toLowerCase();
  const row = {
    session_id: sessionId,
    t_ms: parseTime(event.time),
    synthetic_flag: Boolean(noodle.synthetic),
  };

  const metadataSpeed = sanitizeFloat(metadata.speed ?? metadata.velocity ?? event.speed, options.roundPrecision);
  const metadataCadence = sanitizeFloat(metadata.cadence ?? metadata.steps_per_min ?? event.cadence, options.roundPrecision);
  const metadataStride = sanitizeFloat(
    metadata.stride_length ?? metadata.strideLength ?? metadata.step_length ?? event.stride_length,
    options.roundPrecision,
  );
  const metadataHeart = sanitizeFloat(
    metadata.heart_bpm ?? metadata.heartRate ?? metadata.hr ?? event.heart_bpm ?? event.heartRate,
    options.roundPrecision,
  );

  const numericValue = toNumber(event.value);

  if (metadataSpeed != null) {
    row.speed = metadataSpeed;
  } else if (numericValue != null && eventType.includes('speed')) {
    row.speed = sanitizeFloat(numericValue, options.roundPrecision);
  }

  if (metadataCadence != null) {
    row.cadence = metadataCadence;
  } else if (numericValue != null && eventType.includes('cadence')) {
    row.cadence = sanitizeFloat(numericValue, options.roundPrecision);
  }

  if (metadataStride != null) {
    row.stride_length = metadataStride;
  }

  if (metadataHeart != null) {
    row.heart_bpm = metadataHeart;
  } else if (numericValue != null && (eventType.includes('heart') || eventType.includes('bpm'))) {
    row.heart_bpm = sanitizeFloat(numericValue, options.roundPrecision);
  }

  if (!row.speed && numericValue != null && eventType.includes('pace')) {
    row.speed = sanitizeFloat(numericValue, options.roundPrecision);
  }

  if (!row.cadence && metadata.steps != null) {
    row.cadence = sanitizeFloat(metadata.steps, options.roundPrecision);
  }

  const cueCandidate = metadata.cue || metadata.event || metadata.label;
  if (typeof cueCandidate === 'string' && cueCandidate.length > 0) {
    row.cue_event = cueCandidate;
  } else if (eventType.includes('cue') || eventType.includes('callout')) {
    row.cue_event = event.eventType;
  } else if (typeof event.value === 'string' && !row.cue_event && !eventType.includes('metric')) {
    row.cue_event = event.value;
  }

  if (metadata.synthetic_flag != null) {
    row.synthetic_flag = toBoolean(metadata.synthetic_flag);
  }

  return row;
}

function buildRowsFromSamples(noodle, sessionId, options) {
  const rows = [];
  const data = noodle.data || {};
  const speeds = Array.isArray(data.speed_samples || data.speedSamples) ? data.speed_samples || data.speedSamples : [];
  const cadence = Array.isArray(data.cadence_samples || data.cadenceSamples)
    ? data.cadence_samples || data.cadenceSamples
    : [];
  const stride = Array.isArray(data.stride_samples || data.strideSamples) ? data.stride_samples || data.strideSamples : [];
  const heart = Array.isArray(data.heart_samples || data.heartSamples) ? data.heart_samples || data.heartSamples : [];

  const maxLength = Math.max(speeds.length, cadence.length, stride.length, heart.length);
  if (maxLength === 0) {
    return rows;
  }

  const startMs = parseTime(noodle.timestamp) || Date.now();
  const cadenceInterval = toNumber(data.sample_interval_ms || data.sampleIntervalMs) || 1000;

  for (let i = 0; i < maxLength; i += 1) {
    const row = {
      session_id: sessionId,
      t_ms: startMs + i * cadenceInterval,
      synthetic_flag: Boolean(noodle.synthetic),
    };
    if (speeds[i] != null) {
      row.speed = sanitizeFloat(speeds[i], options.roundPrecision);
    }
    if (cadence[i] != null) {
      row.cadence = sanitizeFloat(cadence[i], options.roundPrecision);
    }
    if (stride[i] != null) {
      row.stride_length = sanitizeFloat(stride[i], options.roundPrecision);
    }
    if (heart[i] != null) {
      row.heart_bpm = sanitizeFloat(heart[i], options.roundPrecision);
    }
    rows.push(row);
  }

  return rows;
}

function normalizeEvents(noodle, filePath, options) {
  const sessionId = deriveSessionId(noodle, filePath);
  const events = Array.isArray(noodle.events) ? [...noodle.events] : [];
  const rows = events.map((event) => buildBaseRow(noodle, sessionId, event, options));

  if (rows.length === 0) {
    rows.push(...buildRowsFromSamples(noodle, sessionId, options));
  }

  const filteredRows = rows.filter((row) => row.t_ms != null);
  filteredRows.sort((a, b) => a.t_ms - b.t_ms);

  const sessionStart = parseTime(noodle.timestamp);
  let previous = null;
  filteredRows.forEach((row) => {
    const absolute = row.t_ms;
    let relative = absolute;
    if (sessionStart != null) {
      relative = Math.max(0, absolute - sessionStart);
    }
    if (previous == null) {
      row.t_ms = relative;
    } else {
      row.t_ms = Math.max(0, absolute - previous);
    }
    previous = absolute;
  });

  return { sessionId, rows: filteredRows };
}

function sanitizeHeartRates(rows, options) {
  if (!options || !options.jitterHeart) {
    return rows;
  }
  return rows.map((row) => {
    if (row.heart_bpm == null) {
      return row;
    }
    const jitter = (Math.random() - 0.5) * 2 * (options.heartJitterAmplitude || 1.5);
    return {
      ...row,
      heart_bpm: sanitizeFloat(row.heart_bpm + jitter, options.roundPrecision),
    };
  });
}

function buildFieldList(options) {
  const dropSet = new Set((options.dropFields || []).map((field) => field.trim()).filter(Boolean));
  const fields = BASE_FIELD_DEFINITIONS.filter((field) => !dropSet.has(field.key));
  return fields.map((field) => ({ ...field, name: options.alias ? FIELD_ALIASES[field.key] || field.key : field.key }));
}

function transformRow(row, options) {
  const dropSet = new Set((options.dropFields || []).map((field) => field.trim()).filter(Boolean));
  const transformed = {};
  Object.keys(row).forEach((key) => {
    if (dropSet.has(key)) {
      return;
    }
    const targetKey = options.alias ? FIELD_ALIASES[key] || key : key;
    if (row[key] != null) {
      transformed[targetKey] = row[key];
    }
  });
  return transformed;
}

function buildSchemaDefinition(fields, compression) {
  const schema = {};
  fields.forEach((field) => {
    schema[field.name] = {
      type: field.type,
      optional: Boolean(field.optional),
      compression,
    };
    if (field.encoding) {
      schema[field.name].encoding = field.encoding;
    }
  });
  return schema;
}

async function writeParquet(rows, fields, outputPath, compression) {
  const schema = new parquet.ParquetSchema(buildSchemaDefinition(fields, compression));
  const writer = await parquet.ParquetWriter.openFile(schema, outputPath, {
    useDataPageV2: false,
  });
  for (const row of rows) {
    await writer.appendRow(row);
  }
  await writer.close();
}

function writeMetadata(outputPath, metadata) {
  const metaPath = `${outputPath}.meta.json`;
  fs.writeFileSync(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
}

function collectCadenceVariance(noodle) {
  const data = noodle.data || {};
  const samples = Array.isArray(data.cadence_samples || data.cadenceSamples)
    ? data.cadence_samples || data.cadenceSamples
    : [];
  if (samples.length === 0) {
    return 0;
  }
  const numeric = samples.map(toNumber).filter((value) => value != null);
  if (numeric.length === 0) {
    return 0;
  }
  const mean = numeric.reduce((acc, value) => acc + value, 0) / numeric.length;
  const variance = numeric.reduce((acc, value) => acc + (value - mean) ** 2, 0) / numeric.length;
  return Number(variance.toFixed(4));
}

function buildFeatureCompanion(noodle, sessionId, rows) {
  const features = buildFeatureVector(noodle);
  const cadenceVariance = collectCadenceVariance(noodle);
  const tempoAlignment = Number((features.tempo_alignment_score || 0).toFixed(2));
  const flowScore = (() => {
    const flowDrops = features.flow_drops || 0;
    const denominator = Math.max(rows.length, 1);
    const raw = 1 - flowDrops / denominator;
    return Number(Math.max(0, Math.min(1, raw)).toFixed(2));
  })();

  return {
    session_id: sessionId,
    avg_speed: Number((features.avg_speed || 0).toFixed(2)),
    cadence_variance: cadenceVariance,
    tempo_alignment: tempoAlignment,
    flow_score: flowScore,
  };
}

function passesFilter(noodle, filter) {
  if (!filter) {
    return true;
  }
  const normalized = filter.toLowerCase();
  if (normalized === 'synthetic_only' || normalized === 'synthetic') {
    return Boolean(noodle.synthetic);
  }
  if (normalized === 'real_only' || normalized === 'real') {
    return !Boolean(noodle.synthetic);
  }
  if (normalized === 'consented' || normalized === 'consented_only') {
    return Boolean(noodle.privacy_ledger && noodle.privacy_ledger.export_approved);
  }
  if (normalized === 'approved') {
    return Boolean(noodle.privacy_ledger && noodle.privacy_ledger.export_approved);
  }
  return true;
}

function extractOverlayRows(noodle, sessionId) {
  const overlays = [];
  const ghostOverlays = noodle.ghost_overlays || noodle.ghostOverlays || [];
  if (Array.isArray(ghostOverlays) && ghostOverlays.length > 0) {
    overlays.push({ type: 'ghost', rows: ghostOverlays });
  }
  const movementOverlays = noodle.movement_overlays || noodle.movementOverlays || [];
  if (Array.isArray(movementOverlays) && movementOverlays.length > 0) {
    overlays.push({ type: 'movement', rows: movementOverlays });
  }
  const generalOverlays = noodle.overlays || [];
  if (Array.isArray(generalOverlays) && generalOverlays.length > 0) {
    overlays.push({ type: 'overlay', rows: generalOverlays });
  }

  return overlays.map((overlay) => {
    const normalizedRows = overlay.rows
      .map((item, index) => {
        const start = parseTime(item.start) ?? parseTime(item.start_time);
        const end = parseTime(item.end) ?? parseTime(item.end_time);
        return {
          source_session_id: sessionId,
          overlay_id: item.id || item.name || `${overlay.type}_${index + 1}`,
          overlay_type: overlay.type,
          start_ms: start ?? 0,
          end_ms: end ?? start ?? 0,
          intensity: sanitizeFloat(item.intensity ?? item.weight, DEFAULT_ROUND_PRECISION),
        };
      })
      .filter((row) => row.overlay_id);

    return {
      type: overlay.type,
      rows: normalizedRows,
      fields: [
        { name: 'source_session_id', type: 'UTF8' },
        { name: 'overlay_id', type: 'UTF8' },
        { name: 'overlay_type', type: 'UTF8' },
        { name: 'start_ms', type: 'INT32' },
        { name: 'end_ms', type: 'INT32' },
        { name: 'intensity', type: 'FLOAT', optional: true },
      ],
    };
  });
}

async function processOverlayExports(overlays, sessionId, outputDir, compression, options) {
  const results = [];
  for (const overlay of overlays) {
    if (!overlay.rows || overlay.rows.length === 0) {
      continue;
    }
    const fileName = `${sessionId}.${overlay.type}.parquet`;
    const filePath = path.join(outputDir, fileName);
    const meta = {
      session_id: sessionId,
      source_file: `${sessionId}.json`,
      parquet_file: fileName,
      rows: overlay.rows.length,
      fields: overlay.fields.map((field) => field.name),
      compression,
      generated_at: new Date().toISOString(),
    };

    if (!options.dryRun) {
      ensureDirectory(path.dirname(filePath));
      const schema = new parquet.ParquetSchema(
        buildSchemaDefinition(overlay.fields.map((field) => ({ ...field, key: field.name })), compression),
      );
      const writer = await parquet.ParquetWriter.openFile(schema, filePath, { useDataPageV2: false });
      for (const row of overlay.rows) {
        await writer.appendRow(row);
      }
      await writer.close();
      writeMetadata(filePath, meta);
    }

    appendLog(
      `[${options.dryRun ? 'DRY-RUN' : 'COMPRESS'}] overlay:${overlay.type} ${sessionId} → ${fileName} (rows: ${overlay.rows.length})`,
    );

    results.push({ filePath, metadata: meta });
  }
  return results;
}

async function compressSession(filePath, outputDir, options = {}) {
  try {
    const normalizedOptions = {
      ...options,
      roundPrecision:
        typeof options.roundPrecision === 'number' && !Number.isNaN(options.roundPrecision)
          ? options.roundPrecision
          : DEFAULT_ROUND_PRECISION,
    };

    const raw = fs.readFileSync(filePath, 'utf-8');
    const noodle = JSON.parse(raw);
    ensurePrivacyLedger(noodle);

    if (!passesFilter(noodle, normalizedOptions.filter)) {
      appendLog(`[SKIPPED] ${path.basename(filePath)} (filter)`);
      return { status: 'skipped', reason: 'filter' };
    }

    const normalization = normalizeEvents(noodle, filePath, normalizedOptions);
    let { rows } = normalization;
    const { sessionId } = normalization;

    if (!rows || rows.length === 0) {
      appendLog(`[SKIPPED] ${path.basename(filePath)} (no time-series data)`);
      return { status: 'skipped', reason: 'empty' };
    }

    const privacy = normalizedOptions.privacyCheck ? privacyScore(noodle) : null;
    const redactedFields = [];
    const dropFields = new Set(normalizedOptions.dropFields || []);
    let jitterHeart = false;

    if (normalizedOptions.privacyCheck && privacy) {
      if (privacy.score > (normalizedOptions.privacyThreshold ?? PRIVACY_THRESHOLD)) {
        dropFields.add('heart_bpm');
        redactedFields.push('heart_bpm');
      } else {
        jitterHeart = true;
      }
    }

    rows = sanitizeHeartRates(rows, {
      jitterHeart,
      heartJitterAmplitude: normalizedOptions.heartJitterAmplitude,
      roundPrecision: normalizedOptions.roundPrecision,
    });

    const fields = buildFieldList({
      alias: normalizedOptions.alias,
      dropFields: Array.from(dropFields),
    });

    const transformedRows = rows.map((row) => transformRow(row, {
      alias: normalizedOptions.alias,
      dropFields: Array.from(dropFields),
    }));

    const compression = (normalizedOptions.compression || DEFAULT_COMPRESSION).toUpperCase();
    const fileName = `${sessionId}.parquet`;
    const outputPath = path.join(outputDir, fileName);
    const metadata = {
      session_id: sessionId,
      source_file: path.basename(filePath),
      parquet_file: fileName,
      rows: transformedRows.length,
      fields: fields.map((field) => field.name),
      compression,
      privacy_score: privacy ? privacy.score : null,
      redacted_fields: redactedFields,
      generated_at: new Date().toISOString(),
    };

    if (!normalizedOptions.dryRun) {
      ensureDirectory(outputDir);
      await writeParquet(transformedRows, fields, outputPath, compression);
      writeMetadata(outputPath, metadata);

      if (normalizedOptions.writeFeatures) {
        const companion = buildFeatureCompanion(noodle, sessionId, rows);
        const featurePath = path.join(outputDir, `${sessionId}.features.json`);
        fs.writeFileSync(featurePath, `${JSON.stringify(companion, null, 2)}\n`, 'utf-8');
      }
    }

    const overlays = extractOverlayRows(noodle, sessionId);
    if (overlays.length > 0) {
      await processOverlayExports(overlays, sessionId, outputDir, compression, normalizedOptions);
    }

    const logLabel = normalizedOptions.dryRun ? 'DRY-RUN' : 'COMPRESS';
    appendLog(`[${logLabel}] ${path.basename(filePath)} → ${fileName} (rows: ${transformedRows.length}, fields: ${fields.length})`);

    return {
      status: 'success',
      sessionId,
      parquetPath: outputPath,
      metadata,
    };
  } catch (error) {
    appendLog(`[ERROR] ${path.basename(filePath)}: ${error.message}`);
    return { status: 'error', error };
  }
}

function listJsonFiles(inputDir) {
  return fs
    .readdirSync(inputDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(inputDir, name));
}

async function compressDirectory(inputDir, outputDir, options = {}) {
  const resolvedInput = path.resolve(inputDir);
  const resolvedOutput = path.resolve(outputDir);

  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`Input directory not found: ${resolvedInput}`);
  }

  ensureDirectory(resolvedOutput);

  const files = listJsonFiles(resolvedInput);
  const summary = {
    processed: files.length,
    compressed: 0,
    skipped: 0,
    errors: 0,
    results: [],
  };

  for (const file of files) {
    const result = await compressSession(file, resolvedOutput, options);
    if (result.status === 'success') {
      summary.compressed += 1;
      summary.results.push(result);
    } else if (result.status === 'skipped') {
      summary.skipped += 1;
    } else {
      summary.errors += 1;
    }
  }

  return summary;
}

module.exports = {
  compressSession,
  compressDirectory,
  normalizeEvents,
  buildFeatureCompanion,
};

