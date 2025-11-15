import 'dotenv/config';
import express from 'express';

import { appendSessionEntry } from './db/sessionRegistry.js';
import { logError, logInfo, logWarn } from './log.js';
import { syntheticPass } from './syntheticPass.js';
import { uploadToB2 } from './uploadToB2.js';
import {
  assertSchemaVersion,
  listSupportedVersions,
  resolveSchemaVersion,
  validateNoodle,
} from './schemas/index.js';
import { buildNoodle } from './utils/buildNoodle.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    supportedVersions: listSupportedVersions(),
  });
});

app.post('/upload', async (req, res) => {
  const rawNoodle = req.body?.noodle ?? req.body ?? {};

  const baseVersion = resolveSchemaVersion(req.body, 'v1.0.0');
  const versionTag = resolveSchemaVersion(rawNoodle, baseVersion);

  const tagNote = typeof req.query.tag === 'string' && req.query.tag.length > 0
    ? `tag:${req.query.tag}`
    : undefined;
  const combinedNotes = [rawNoodle.notes, tagNote].filter(Boolean).join(' | ') || undefined;

  let safeVersionTag = versionTag;
  try {
    safeVersionTag = assertSchemaVersion(versionTag);
  } catch (schemaError) {
    logWarn('VALIDATION', 'Unsupported schema version received', {
      requestedVersion: versionTag,
    });
    return res.status(400).json({
      status: 'error',
      message: schemaError.message,
      validationErrors: [],
    });
  }

  try {
    logInfo('UPLOAD', 'Received noodle upload request', {
      versionTag: safeVersionTag,
      tag: req.query.tag,
    });

    const realNoodle = buildNoodle({
      ...rawNoodle,
      version: rawNoodle.version ?? 1,
      synthetic: false,
      schema_version: safeVersionTag,
      notes: combinedNotes,
    });
    validateNoodle(realNoodle, safeVersionTag);

    const syntheticNoodle = syntheticPass(realNoodle);
    syntheticNoodle.schema_version = safeVersionTag;
    validateNoodle(syntheticNoodle, safeVersionTag);

    const realResult = await uploadToB2(realNoodle, { synthetic: false });
    const syntheticResult = await uploadToB2(syntheticNoodle, { synthetic: true });

    const sessionRecord = await appendSessionEntry({
      session_id: realNoodle.sessionId,
      upload_date: new Date().toISOString(),
      schema_version: safeVersionTag,
      real_file_url: realResult.url ?? null,
      synthetic_file_url: syntheticResult.url ?? null,
      notes: combinedNotes ?? null,
    });

    res.status(201).json({
      status: 'uploaded',
      schemaVersion: safeVersionTag,
      sessionId: realNoodle.sessionId,
      real: realResult,
      synthetic: syntheticResult,
      session: sessionRecord,
    });
  } catch (error) {
    logError('UPLOAD', 'Failed to upload noodle payload', {
      message: error.message,
      validationErrors: error.validationErrors,
    });

    const statusCode = error.validationErrors ? 400 : 500;
    res.status(statusCode).json({
      status: 'error',
      message: error.message,
      validationErrors: error.validationErrors ?? [],
    });
  }
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  logInfo('SERVER', `Noodle backend listening on port ${port}`);
});
