/**
 * ============================================================
 *  LEGACY NOODLE BACKEND – PROJECT MAP
 * ------------------------------------------------------------
 *  Role:
 *    - Stand-alone Express server for raw noodle ingest.
 *    - Provides:
 *         POST /upload          → Upload noodle payloads
 *         POST /stream          → Real-time stream ingestion
 *         GET  /play/:session   → SSE playback of stored sessions
 *         GET  /rooms/active    → Active relay rooms
 *         GET  /health          → Health check
 *
 *  Server Behavior:
 *    - Listens on process.env.PORT or 4000.
 *    - Handles synthetic pass, anonymization, B2 uploads,
 *      snapshots, metadata, and relay server.
 *
 *  Notes:
 *    - This backend is SEPARATE from the RV API (src/server.ts).
 *    - Intended for legacy session ingestion; not used by rv-app.
 * ============================================================
 */

/**
 * Express application providing noodle upload, streaming ingestion, and
 * health monitoring endpoints.
 */

import http from 'http';
import express from 'express';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadEnv } from './config/loadEnv.js';
import { isSessionBlocked } from './config/noFlyList.js';
import { recordMediaSession } from './db/mediaIndex.js';
import {
  ensureTrack,
  getTrack,
  expandTrackMetadata,
  extractTrackMetadataFromNoodle,
} from './db/mediaTracks.js';
import { appendSessionEntry } from './db/sessionRegistry.js';
import { logDebug, logError, logInfo, logWarn } from './log.js';
import { syntheticPass } from './syntheticPass.js';
import { uploadToB2 } from './uploadToB2.js';
import {
  assertSchemaVersion,
  listSupportedVersions,
  resolveSchemaVersion,
  validateNoodle,
} from './schemas/index.js';
import { buildNoodle } from './utils/buildNoodle.js';
import { logAudit } from './utils/auditLogger.js';
import { saveSnapshot, loadSnapshot } from './utils/snapshots.js';
import { getActiveRooms, startRelayServer } from './realtime/relay.js';
import { TimelinePlayer } from './replay/timelinePlayer.js';

loadEnv();

const app = express();
app.use(express.json({ limit: '1mb' }));

const STREAM_IDLE_TIMEOUT_MS = 15_000;
const STREAM_IDLE_CHECK_MS = 5_000;
const streamBuffers = new Map();
const serverDir = path.dirname(fileURLToPath(new URL('./server.js', import.meta.url)));
const streamOutputDir = path.join(serverDir, 'db', 'stream-output');

/**
 * Determines whether the current request expects a streamed response.
 *
 * @param {express.Request} req Express request instance.
 * @returns {boolean} True when stream output should be used.
 */
function shouldStream(req) {
  const queryFlag = req.query?.stream;
  if (typeof queryFlag === 'string') {
    return queryFlag.toLowerCase() === 'true';
  }
  if (Array.isArray(queryFlag)) {
    return queryFlag.some((value) => String(value).toLowerCase() === 'true');
  }
  return false;
}

/**
 * Writes a line to the streaming response when enabled.
 *
 * @param {express.Response} res Express response instance.
 * @param {string} message Line to emit to the client.
 */
function streamWrite(res, message) {
  res.write(`${message}\n`);
}

/**
 * Picks the anonymisation profile based on query parameters or noodle metadata.
 * Query parameters take precedence over noodle-provided hints.
 *
 * @param {express.Request} req Express request.
 * @param {Record<string, any>} noodle Raw noodle payload.
 * @returns {string|undefined} Resolved profile preference.
 */
function resolveProfilePreference(req, noodle) {
  if (typeof req.query.profile === 'string' && req.query.profile.length > 0) {
    return req.query.profile;
  }
  if (Array.isArray(req.query.profile) && req.query.profile.length > 0) {
    return req.query.profile[0];
  }
  if (noodle && typeof noodle === 'object') {
    if (typeof noodle.anonymization_profile === 'string' && noodle.anonymization_profile.length > 0) {
      return noodle.anonymization_profile;
    }
    if (typeof noodle.profile === 'string' && noodle.profile.length > 0) {
      return noodle.profile;
    }
  }
  return undefined;
}

/**
 * Extracts media metadata from a noodle payload for media index tracking.
 *
 * @param {Record<string, any>} noodle Normalised noodle payload.
 * @returns {{trackId?: string, bpm?: number, heartRate?: number, speed?: number}}
 *  Media metadata descriptor.
 */
/**
 * Coerces a value to a finite number when possible.
 *
 * @param {unknown} value Potential numeric input.
 * @returns {number|undefined} Coerced number or undefined when invalid.
 */
function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function extractMediaStats(noodle) {
  if (!noodle || typeof noodle !== 'object') {
    return {};
  }
  const data = noodle.data || {};
  const trackId = noodle.media_track_id || data.media_track_id;
  if (!trackId) {
    return {};
  }
  const speedCandidates = [data.speed, data.avgSpeed, data.speed_mps];
  const speed = speedCandidates.map(toNumber).find((value) => value !== undefined);

  return {
    trackId,
    bpm: toNumber(data.bpm),
    heartRate: toNumber(data.heartRate),
    speed,
  };
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    supportedVersions: listSupportedVersions(),
  });
});

app.get('/rooms/active', (req, res) => {
  res.json(getActiveRooms());
});

app.get('/media/:track_id', async (req, res) => {
  const trackId = req.params.track_id;
  if (!trackId) {
    return res.status(400).json({ status: 'error', message: 'track_id is required' });
  }
  try {
    const track = await getTrack(trackId);
    if (!track) {
      return res.status(404).json({ status: 'not_found', message: `Track ${trackId} not found` });
    }
    const expandFlag = typeof req.query.expand === 'string'
      ? req.query.expand.toLowerCase() === 'true'
      : Array.isArray(req.query.expand)
        ? req.query.expand.some((value) => String(value).toLowerCase() === 'true')
        : false;
    const payload = expandFlag ? expandTrackMetadata(track) : track;
    return res.json(payload);
  } catch (error) {
    logError('MEDIA', 'Failed to resolve track metadata', { message: error.message, trackId });
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/upload', async (req, res) => {
  const rawNoodle = req.body?.noodle ?? req.body ?? {};

  const baseVersion = resolveSchemaVersion(req.body, 'v1.0.0');
  const versionTag = resolveSchemaVersion(rawNoodle, baseVersion);

  const tagNote = typeof req.query.tag === 'string' && req.query.tag.length > 0
    ? `tag:${req.query.tag}`
    : undefined;
  const combinedNotes = [rawNoodle.notes, tagNote].filter(Boolean).join(' | ') || undefined;

  const streamMode = shouldStream(req);
  if (streamMode) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  }

  let safeVersionTag = versionTag;
  try {
    safeVersionTag = assertSchemaVersion(versionTag);
  } catch (schemaError) {
    logWarn('VALIDATION', 'Unsupported schema version received', {
      requestedVersion: versionTag,
    });
    if (streamMode) {
      res.statusCode = 400;
      streamWrite(res, `[ERROR] ${schemaError.message}`);
      return res.end();
    }
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

    if (await isSessionBlocked(realNoodle.sessionId)) {
      throw new Error(`Session ${realNoodle.sessionId} is flagged and cannot be uploaded.`);
    }
    validateNoodle(realNoodle, safeVersionTag);
    if (streamMode) {
      streamWrite(res, '[VALIDATE] Success');
    }

    const profilePreference = resolveProfilePreference(req, rawNoodle);
    const syntheticNoodle = await syntheticPass(realNoodle, {
      anonymizationProfile: profilePreference,
    });
    syntheticNoodle.schema_version = safeVersionTag;
    validateNoodle(syntheticNoodle, safeVersionTag);
    if (streamMode) {
      streamWrite(
        res,
        `[SYNTHETIC] Generated using profile: ${syntheticNoodle.anonymization_profile}`,
      );
    }

    const realResult = await uploadToB2(realNoodle, { synthetic: false });
    await saveSnapshot(realNoodle.sessionId, safeVersionTag, realNoodle, { synthetic: false });
    await logAudit('UPLOAD', `session:${realNoodle.sessionId} schema:${safeVersionTag} synthetic:false`);
    const syntheticResult = await uploadToB2(syntheticNoodle, { synthetic: true });
    await saveSnapshot(syntheticNoodle.sessionId, safeVersionTag, syntheticNoodle, { synthetic: true });
    await logAudit('UPLOAD', `session:${syntheticNoodle.sessionId} schema:${safeVersionTag} synthetic:true`);

    const sessionRecord = await appendSessionEntry({
      session_id: realNoodle.sessionId,
      upload_date: new Date().toISOString(),
      schema_version: safeVersionTag,
      real_file_url: realResult.url ?? null,
      synthetic_file_url: syntheticResult.url ?? null,
      notes: combinedNotes ?? null,
    });

    const mediaStats = extractMediaStats(realNoodle);
    if (mediaStats.trackId) {
      const trackMetadata = extractTrackMetadataFromNoodle(realNoodle);
      await ensureTrack(mediaStats.trackId, trackMetadata);
      await recordMediaSession(mediaStats);
    }

    if (streamMode) {
      streamWrite(res, `[UPLOAD] Completed: ${realResult.url ?? 'local-only'}`);
      return res.end();
    }

    res.status(201).json({
      status: 'uploaded',
      schemaVersion: safeVersionTag,
      sessionId: realNoodle.sessionId,
      real: realResult,
      synthetic: syntheticResult,
      session: sessionRecord,
      media: mediaStats.trackId ? mediaStats : undefined,
    });
  } catch (error) {
    logError('UPLOAD', 'Failed to upload noodle payload', {
      message: error.message,
      validationErrors: error.validationErrors,
    });

    const statusCode = error.validationErrors ? 400 : 500;
    if (streamMode) {
      res.statusCode = statusCode;
      streamWrite(res, `[ERROR] ${error.message}`);
      return res.end();
    }

    res.status(statusCode).json({
      status: 'error',
      message: error.message,
      validationErrors: error.validationErrors ?? [],
    });
  }
});

/**
 * Ensures a session identifier is available and represented as a string.
 *
 * @param {unknown} sessionId Potential session identifier value.
 * @returns {string} Normalised session identifier.
 */
function normaliseSessionId(sessionId) {
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    return sessionId;
  }
  throw new Error('stream ingestion payload must include sessionId');
}

/**
 * Retrieves or creates the in-memory buffer associated with a streaming
 * session. Buffers keep track of events and contextual metadata until the
 * inactivity timeout flushes them to disk.
 *
 * @param {string} sessionId Session identifier.
 * @returns {object} Mutable buffer reference.
 */
function ensureStreamBuffer(sessionId) {
  const existing = streamBuffers.get(sessionId);
  if (existing) {
    return existing;
  }
  const buffer = {
    events: [],
    lastUpdated: Date.now(),
    baseTimestamp: Date.now(),
    startIso: new Date().toISOString(),
    synthetic: false,
    profile: undefined,
    latestData: {},
    mediaTrackId: undefined,
  };
  streamBuffers.set(sessionId, buffer);
  return buffer;
}

/**
 * Normalises incoming stream payloads into event objects and appends them
 * to the in-memory buffer.
 *
 * @param {object} buffer Target buffer container.
 * @param {Record<string, any>} payload Raw request body.
 */
function ingestEventsIntoBuffer(buffer, payload) {
  const incoming = [];
  if (Array.isArray(payload.events)) {
    incoming.push(...payload.events);
  } else if (payload.event) {
    incoming.push(payload.event);
  } else if (payload.t_ms !== undefined) {
    incoming.push(payload);
  }

  incoming.forEach((event) => {
    if (!event) {
      return;
    }
    const offsetMs = Number.isFinite(event.t_ms) ? Number(event.t_ms) : 0;
    const eventTime = new Date(buffer.baseTimestamp + offsetMs).toISOString();
    buffer.events.push({
      time: eventTime,
      eventType: event.eventType || event.type || 'stream:event',
      value: event.value ?? null,
      metadata: event.metadata ?? undefined,
    });
  });
}

/**
 * Updates buffer-level metadata such as latest metrics, profile hints, and
 * timestamps based on the streaming payload.
 *
 * @param {object} buffer Target buffer container.
 * @param {Record<string, any>} payload Raw request body.
 */
function updateBufferContext(buffer, payload) {
  buffer.lastUpdated = Date.now();
  if (payload.synthetic === true) {
    buffer.synthetic = true;
  }
  if (typeof payload.profile === 'string' && payload.profile.length > 0) {
    buffer.profile = payload.profile;
  }
  if (payload.baseTimestamp) {
    const baseDate = new Date(payload.baseTimestamp);
    if (!Number.isNaN(baseDate.getTime())) {
      buffer.baseTimestamp = baseDate.getTime();
      buffer.startIso = baseDate.toISOString();
    }
  }
  if (payload.data && typeof payload.data === 'object') {
    buffer.latestData = {
      ...buffer.latestData,
      ...payload.data,
    };
  }
  if (payload.media_track_id || payload.mediaTrackId) {
    buffer.mediaTrackId = payload.media_track_id ?? payload.mediaTrackId;
  }
}

/**
 * Flushes a buffer to disk as a completed noodle file. Synthetic buffers are
 * processed through the synthetic pipeline before persistence.
 *
 * @param {string} sessionId Session identifier.
 * @param {object} buffer Buffer contents to flush.
 */
async function finaliseStreamBuffer(sessionId, buffer) {
  if (!buffer.events.length) {
    streamBuffers.delete(sessionId);
    return;
  }

  const dataBlock = Object.keys(buffer.latestData).length > 0
    ? buffer.latestData
    : { heartRate: 60 };

  const noodle = buildNoodle({
    sessionId,
    timestamp: buffer.startIso,
    events: buffer.events,
    data: dataBlock,
    synthetic: buffer.synthetic,
    media_track_id: buffer.mediaTrackId,
  });

  noodle.schema_version = noodle.schema_version ?? 'v1.0.0';
  await validateNoodle(noodle, noodle.schema_version ?? 'v1.0.0');

  let outputNoodle = noodle;
  if (buffer.synthetic) {
    outputNoodle = await syntheticPass(noodle, { anonymizationProfile: buffer.profile });
    outputNoodle.schema_version = noodle.schema_version;
  }

  await mkdir(streamOutputDir, { recursive: true });
  const filePath = path.join(streamOutputDir, `${sessionId}-${Date.now()}.json`);
  await writeFile(filePath, `${JSON.stringify(outputNoodle, null, 2)}\n`);
  logInfo('STREAM', 'Flushed stream buffer to noodle file', {
    sessionId,
    synthetic: buffer.synthetic,
    filePath,
  });

  if (buffer.mediaTrackId) {
    const stats = extractMediaStats(outputNoodle);
    if (stats.trackId) {
      const trackMetadata = extractTrackMetadataFromNoodle(outputNoodle);
      await ensureTrack(stats.trackId, trackMetadata);
      await recordMediaSession(stats);
    }
  }

  streamBuffers.delete(sessionId);
}

/**
 * Iterates over buffered sessions and flushes those that have exceeded the
 * configured inactivity timeout.
 */
async function flushIdleBuffers() {
  const now = Date.now();
  const flushPromises = [];
  streamBuffers.forEach((buffer, sessionId) => {
    if (now - buffer.lastUpdated >= STREAM_IDLE_TIMEOUT_MS) {
      flushPromises.push(finaliseStreamBuffer(sessionId, buffer).catch((error) => {
        logError('STREAM', 'Failed to flush stream buffer', {
          sessionId,
          message: error.message,
        });
      }));
    }
  });
  await Promise.all(flushPromises);
}

setInterval(() => {
  flushIdleBuffers().catch((error) => {
    logError('STREAM', 'Idle buffer flush failed', { message: error.message });
  });
}, STREAM_IDLE_CHECK_MS);

app.post('/stream', (req, res) => {
  try {
    const sessionId = normaliseSessionId(req.body?.sessionId ?? req.body?.session_id);
    const buffer = ensureStreamBuffer(sessionId);
    updateBufferContext(buffer, req.body ?? {});
    ingestEventsIntoBuffer(buffer, req.body ?? {});
    logDebug('STREAM', 'Buffered streaming event payload', {
      sessionId,
      bufferedEvents: buffer.events.length,
    });

    res.status(202).json({
      status: 'buffered',
      sessionId,
      bufferedEvents: buffer.events.length,
    });
  } catch (error) {
    logWarn('STREAM', 'Invalid streaming payload received', { message: error.message });
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
});

app.get('/play/:session_id', async (req, res) => {
  const sessionId = req.params.session_id;
  if (!sessionId) {
    return res.status(400).json({ status: 'error', message: 'session_id is required' });
  }

  try {
    const syntheticFlag = req.query.synthetic === 'true' ? true : req.query.synthetic === 'false' ? false : undefined;
    const snapshot = await loadSnapshot(sessionId, { synthetic: syntheticFlag });
    const noodle = snapshot?.body ?? snapshot;
    const requestedSpeed = Number(req.query.speed);
    const speed = Number.isFinite(requestedSpeed) && requestedSpeed > 0
      ? requestedSpeed
      : undefined;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const player = new TimelinePlayer(noodle, { speed });
    player.onStep((event) => {
      res.write(`data: ${JSON.stringify({ type: 'event', data: event })}\n\n`);
    });
    player.onNote((note) => {
      res.write(`data: ${JSON.stringify({ type: 'note', data: note })}\n\n`);
    });
    player.onEnd(() => {
      res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
      res.end();
    });

    req.on('close', () => {
      player.stop();
    });

    player.play();
  } catch (error) {
    logWarn('PLAYBACK', 'Failed to initiate playback', { sessionId, message: error.message });
    res.status(404).json({ status: 'error', message: error.message });
  }
  return undefined;
});

const port = Number(process.env.PORT) || 4000;
const httpServer = http.createServer(app);
startRelayServer(httpServer);

httpServer.listen(port, () => {
  logInfo('SERVER', `Noodle backend listening on port ${port}`);
});
