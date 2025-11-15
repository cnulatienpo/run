const fs = require('fs');
const path = require('path');

const parquet = require('parquetjs-lite');

const { ensurePrivacyLedger } = require('../src/privacyLedger');

const SUPPORTED_FORMATS = new Set(['noodle', 'ghost', 'timeline']);
const FIELD_ALIAS_MAP = {
  sid: 'session_id',
  dt: 't_ms',
  spd: 'speed',
  cad: 'cadence',
  str: 'stride_length',
  hb: 'heart_bpm',
  syn: 'synthetic_flag',
  cue: 'cue_event',
};
const NUMERIC_FIELDS = new Set(['t_ms', 'speed', 'cadence', 'stride_length', 'heart_bpm']);

function parseArgs(argv) {
  const args = {
    formats: ['noodle'],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const next = argv[i + 1];
    switch (token) {
      case '--input':
      case '--in':
      case '--i':
        args.input = next;
        i += 1;
        break;
      case '--output':
      case '--out':
      case '--o':
        args.output = next;
        i += 1;
        break;
      case '--format':
      case '--formats':
      case '--f':
        if (next) {
          args.formats = next
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean);
          i += 1;
        }
        break;
      case '--inject-track':
        args.injectTrack = next;
        i += 1;
        break;
      case '--rebuild-synthetic':
        args.rebuildSynthetic = true;
        break;
      case '--remix':
        args.remixSessionId = next;
        i += 1;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        console.warn(`Unknown flag: ${token}`);
        break;
    }
  }
  return args;
}

function printUsage() {
  console.log(`Usage: node parquetToNoodle.js --input <file.parquet> [--output <dir>] [--format noodle|ghost|timeline]

Options:
  --input <file>             Path to the parquet file to rehydrate
  --output <dir>             Destination directory for restored files (defaults to the parquet directory)
  --format <list>            Comma-separated list of output formats (noodle, ghost, timeline)
  --inject-track <id>        Attach a known track identifier to the noodle output
  --rebuild-synthetic        Mark the output as synthetic and rebuild the privacy ledger
  --remix <session_id>       Emit the noodle with a new session identifier
  --help                     Show this help message
`);
}

async function readParquetRows(inputPath) {
  const reader = await parquet.ParquetReader.openFile(inputPath);
  try {
    const cursor = reader.getCursor();
    const rows = [];
    let record;
    // eslint-disable-next-line no-cond-assign
    while ((record = await cursor.next())) {
      rows.push(record);
    }
    return rows;
  } finally {
    await reader.close();
  }
}

function canonicaliseRow(row) {
  const normalised = {};
  Object.entries(row).forEach(([key, value]) => {
    const canonicalKey = FIELD_ALIAS_MAP[key] || key;
    if (value == null) {
      return;
    }
    if (NUMERIC_FIELDS.has(canonicalKey)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        normalised[canonicalKey] = numeric;
      }
      return;
    }
    if (canonicalKey === 'synthetic_flag') {
      if (typeof value === 'boolean') {
        normalised.synthetic_flag = value;
      } else if (typeof value === 'number') {
        normalised.synthetic_flag = value !== 0;
      } else if (typeof value === 'string') {
        normalised.synthetic_flag = !['0', 'false', 'no'].includes(value.toLowerCase());
      }
      return;
    }
    normalised[canonicalKey] = value;
  });
  return normalised;
}

function buildTimeline(rows) {
  const timeline = [];
  let sessionId = null;
  let synthetic = null;
  let cumulativeTime = 0;

  rows.forEach((row, index) => {
    const canonical = canonicaliseRow(row);
    if (canonical.session_id && !sessionId) {
      sessionId = canonical.session_id;
    }
    if (typeof canonical.synthetic_flag === 'boolean') {
      synthetic = canonical.synthetic_flag;
    }

    const delta = Number(canonical.t_ms ?? 0);
    if (Number.isFinite(delta)) {
      if (index === 0) {
        cumulativeTime = delta;
      } else {
        cumulativeTime += delta;
      }
    }

    const event = { t_ms: cumulativeTime };
    if (Number.isFinite(canonical.speed)) {
      event.speed = canonical.speed;
    }
    if (Number.isFinite(canonical.cadence)) {
      event.cadence = canonical.cadence;
    }
    if (Number.isFinite(canonical.stride_length)) {
      event.stride_length = canonical.stride_length;
    }
    if (Number.isFinite(canonical.heart_bpm)) {
      event.heart_bpm = canonical.heart_bpm;
    }
    if (typeof canonical.cue_event === 'string' && canonical.cue_event.length > 0) {
      event.cue_event = canonical.cue_event;
    }

    timeline.push(event);
  });

  return { timeline, sessionId, synthetic: Boolean(synthetic) };
}

function readSidecarMetadata(inputPath) {
  const metaPath = `${inputPath}.meta.json`;
  if (!fs.existsSync(metaPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Warning: Failed to parse sidecar metadata (${metaPath}): ${error.message}`);
    return null;
  }
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildRehydrationMetadata(meta, inputPath, rowCount, warnings) {
  const metadata = {
    source_parquet: path.resolve(inputPath),
    restored_at: new Date().toISOString(),
    rows: rowCount,
  };
  if (meta) {
    const {
      session_id: metaSession,
      source_file,
      privacy_score,
      fields,
      compression,
      compression_settings: compressionSettings,
      redacted_fields: redactedFields,
      generated_at,
    } = meta;
    if (metaSession) {
      metadata.sidecar_session_id = metaSession;
    }
    if (source_file) {
      metadata.source_file = source_file;
    }
    if (privacy_score != null) {
      metadata.privacy_score = privacy_score;
    }
    if (Array.isArray(fields)) {
      metadata.fields = fields;
    }
    if (compression) {
      metadata.compression = compression;
    }
    if (compressionSettings) {
      metadata.compression_settings = compressionSettings;
    }
    if (Array.isArray(redactedFields)) {
      metadata.redacted_fields = redactedFields;
    }
    if (generated_at) {
      metadata.generated_at = generated_at;
    }
  }
  if (warnings.length > 0) {
    metadata.warnings = warnings;
  }
  return metadata;
}

function buildNoodlePayload(baseSessionId, timeline, synthetic, options) {
  const noodle = {
    session_id: baseSessionId,
    synthetic: Boolean(synthetic),
    timeline,
  };
  if (options.injectTrack) {
    noodle.track_id = options.injectTrack;
  }
  if (options.rebuildSynthetic) {
    noodle.synthetic = true;
    ensurePrivacyLedger(noodle, {
      inputType: 'synthetic',
      syntheticProfile: 'rehydrated',
      biometricsSource: 'transformed',
    });
  }
  if (options.remixSessionId) {
    noodle.remixed_from = baseSessionId;
    noodle.session_id = options.remixSessionId;
  }
  return noodle;
}

function buildGhostPayload(sessionId, timeline) {
  return {
    session_id: sessionId,
    events: timeline.map((event) => {
      const ghostEvent = { t_ms: event.t_ms };
      if (event.speed != null) {
        ghostEvent.speed = event.speed;
      }
      if (event.cadence != null) {
        ghostEvent.cadence = event.cadence;
      }
      if (event.heart_bpm != null) {
        ghostEvent.heart_bpm = event.heart_bpm;
      }
      if (event.stride_length != null) {
        ghostEvent.stride_length = event.stride_length;
      }
      if (event.cue_event) {
        ghostEvent.cue_event = event.cue_event;
      }
      return ghostEvent;
    }),
  };
}

function writeJson(targetPath, payload) {
  ensureDirectory(path.dirname(targetPath));
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

function logResult(inputPath, outputPath, format, rows) {
  const message = `[REHYDRATE] ${path.basename(inputPath)} → ${outputPath} (format: ${format}, rows: ${rows})`;
  console.log(message);
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.input) {
    console.error('Error: --input <file.parquet> is required.');
    printUsage();
    process.exit(1);
  }

  const resolvedInput = path.resolve(args.input);
  if (!fs.existsSync(resolvedInput)) {
    console.error(`Error: Input parquet not found at ${resolvedInput}`);
    process.exit(1);
  }

  const outputDir = args.output ? path.resolve(args.output) : path.dirname(resolvedInput);
  const baseName = path.basename(resolvedInput, path.extname(resolvedInput));
  const requestedFormats = args.formats.length > 0 ? args.formats : ['noodle'];

  const formats = new Set();
  requestedFormats.forEach((format) => {
    if (format === 'all') {
      SUPPORTED_FORMATS.forEach((supported) => formats.add(supported));
      return;
    }
    if (!SUPPORTED_FORMATS.has(format)) {
      console.warn(`Warning: Unsupported format requested: ${format}`);
      return;
    }
    formats.add(format);
  });

  if (formats.size === 0) {
    console.error('Error: No valid output formats requested.');
    process.exit(1);
  }

  const sidecar = readSidecarMetadata(resolvedInput);
  const parquetRows = await readParquetRows(resolvedInput);
  if (parquetRows.length === 0) {
    console.error('Error: No rows found in parquet file.');
    process.exit(1);
  }

  const { timeline, sessionId, synthetic } = buildTimeline(parquetRows);
  const warnings = [];

  if (sidecar && typeof sidecar.rows === 'number' && sidecar.rows !== parquetRows.length) {
    warnings.push(`Row count mismatch (parquet: ${parquetRows.length}, meta: ${sidecar.rows})`);
    console.warn(`Warning: ${warnings[warnings.length - 1]}`);
  }

  const resolvedSessionId = (() => {
    if (args.remixSessionId) {
      return args.remixSessionId;
    }
    if (sidecar?.session_id) {
      return sidecar.session_id;
    }
    return sessionId || baseName;
  })();

  const noodlePayload = buildNoodlePayload(resolvedSessionId, timeline, synthetic, args);
  noodlePayload.rehydration_metadata = buildRehydrationMetadata(sidecar, resolvedInput, parquetRows.length, warnings);
  if (!noodlePayload.synthetic && synthetic) {
    noodlePayload.synthetic = true;
  }
  if (args.injectTrack && typeof noodlePayload.track_id !== 'string') {
    noodlePayload.track_id = args.injectTrack;
  }

  const outputs = [];

  if (formats.has('noodle')) {
    const noodlePath = path.join(outputDir, `${baseName}.noodle.json`);
    writeJson(noodlePath, noodlePayload);
    outputs.push({ format: 'noodle', path: noodlePath });
  }

  if (formats.has('ghost')) {
    const ghostPayload = buildGhostPayload(resolvedSessionId, timeline);
    const ghostPath = path.join(outputDir, `${baseName}.ghost.json`);
    writeJson(ghostPath, ghostPayload);
    outputs.push({ format: 'ghost', path: ghostPath });
  }

  if (formats.has('timeline')) {
    const timelinePath = path.join(outputDir, `${baseName}.timeline.json`);
    writeJson(timelinePath, timeline);
    outputs.push({ format: 'timeline', path: timelinePath });
  }

  outputs.forEach((result) => {
    logResult(resolvedInput, result.path, result.format, parquetRows.length);
  });
}

main().catch((error) => {
  console.error(`Failed to rehydrate parquet: ${error.message}`);
  process.exit(1);
});

