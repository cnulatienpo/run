//**
 * 🦇 THE BATCAVE (Backblaze Edition)
 *
 * ELI5 with Lego Batman:
 * This file is the ONLY place in Gotham allowed to:
 *   - read Backblaze credentials
 *   - talk to Backblaze auth
 *   - remember where the keys are
 *
 * Everyone else:
 *   - asks nicely
 *   - waits
 *   - or gets nothing
 *
 * No surprises. No shadow caves.
 */

import B2 from 'backblaze-b2';

import { loadEnv } from './config/loadEnv.js';
import { logDebug, logInfo, logWarn } from './log.js';

/* ────────────────────────────────────────────── */
/* 🧱 LEVEL 0: LOAD ENV (ONCE, INTENTIONALLY)      */
/* ────────────────────────────────────────────── */

loadEnv();

/* ────────────────────────────────────────────── */
/* 🧱 LEVEL 1: READ THE BAT-KEYS                   */
/* ────────────────────────────────────────────── */

const KEY_ID =
  process.env.B2_KEY_ID ||
  process.env.B2_APPLICATION_KEY_ID ||
  null;

const APP_KEY =
  process.env.B2_APP_KEY ||
  process.env.B2_APPLICATION_KEY ||
  null;

const BUCKET_ID = process.env.B2_BUCKET_ID || null;
const BUCKET_NAME = process.env.B2_BUCKET_NAME || null;
const DOWNLOAD_URL = process.env.B2_DOWNLOAD_URL || null;

/* ────────────────────────────────────────────── */
/* 🧱 LEVEL 2: PRIVATE BATCAVE STATE               */
/* ────────────────────────────────────────────── */

let client = null;
let cachedBucketId = BUCKET_ID;
let lastAuthAt = 0;

// Batman checks his utility belt once per night, not every punch
const AUTH_TTL_MS = 1000 * 60 * 60 * 23; // 23 hours

console.log('🦇 BATCAVE ACTIVE: backend/uploadToB2.js');

/* ────────────────────────────────────────────── */
/* 🧱 LEVEL 3: INTERNAL HELPERS (NO EXPORTS)       */
/* ────────────────────────────────────────────── */

function requireCredentials() {
  if (!KEY_ID || !APP_KEY) {
    throw new Error(
      'Backblaze credentials missing. Set B2_KEY_ID and B2_APP_KEY.'
    );
  }
}

function getClient() {
  if (client) return client;

  requireCredentials();

  client = new B2({
    applicationKeyId: KEY_ID,
    applicationKey: APP_KEY,
  });

  return client;
}

async function ensureAuthorised(clientInstance) {
  const now = Date.now();
  if (now - lastAuthAt < AUTH_TTL_MS) return;

  logInfo('B2', 'Authorising Backblaze client');
  await clientInstance.authorize();
  lastAuthAt = now;
}

async function getBucketId(clientInstance) {
  if (cachedBucketId) return cachedBucketId;

  if (!BUCKET_NAME) {
    throw new Error(
      'Provide B2_BUCKET_ID or B2_BUCKET_NAME to resolve bucket.'
    );
  }

  const res = await clientInstance.getBucket({ bucketName: BUCKET_NAME });
  const bucketId =
    res?.data?.bucketId ||
    res?.data?.buckets?.[0]?.bucketId;

  if (!bucketId) {
    throw new Error(`Unable to resolve bucket ID for ${BUCKET_NAME}`);
  }

  cachedBucketId = bucketId;
  return bucketId;
}

async function getUploadContext() {
  const clientInstance = getClient();
  await ensureAuthorised(clientInstance);
  const bucketId = await getBucketId(clientInstance);
  return { clientInstance, bucketId };
}

/* ────────────────────────────────────────────── */
/* 🧱 LEVEL 4: PATH + URL HELPERS                  */
/* ────────────────────────────────────────────── */

function buildUploadPath(noodle, synthetic) {
  const ts = noodle?.timestamp ? new Date(noodle.timestamp) : new Date();
  const day = Number.isNaN(ts.getTime())
    ? new Date().toISOString().slice(0, 10)
    : ts.toISOString().slice(0, 10);

  const prefix = synthetic ? 'synthetic' : 'real';
  const session = noodle?.sessionId || `session-${Date.now()}`;
  const version = noodle?.version || 1;

  return `${prefix}/${day}/${session}_v${version}.json`;
}

function buildPublicUrl(fileName) {
  if (!DOWNLOAD_URL) return null;
  return `${DOWNLOAD_URL.replace(/\/$/, '')}/${fileName}`;
}

/* ────────────────────────────────────────────── */
/* 🧱 LEVEL 5: PUBLIC API (THE ONLY EXPORTS)       */
/* ────────────────────────────────────────────── */

/**
 * Upload a structured noodle object as JSON.
 */
export async function uploadToB2(noodle, options = {}) {
  if (!noodle || typeof noodle !== 'object') {
    throw new Error('uploadToB2 requires a noodle object.');
  }

  const synthetic =
    options.synthetic ?? noodle.synthetic === true;

  const fileName = buildUploadPath(noodle, synthetic);
  const buffer = Buffer.from(JSON.stringify(noodle, null, 2));

  const upload = await uploadBufferToB2({
    buffer,
    fileName,
    contentType: 'application/json',
    info: {
      synthetic: synthetic ? 'true' : 'false',
      version: String(noodle.version ?? '1'),
      schema_version: noodle.schema_version ?? 'v1',
    },
  });

  logInfo('UPLOAD', 'Noodle uploaded to Backblaze', upload);
  return upload;
}

/**
 * Upload a raw buffer. Used by tools and compressors.
 */
export async function uploadBufferToB2({
  buffer,
  fileName,
  contentType = 'application/octet-stream',
  info = {},
}) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('uploadBufferToB2 expects a Buffer.');
  }

  const { clientInstance, bucketId } = await getUploadContext();

  const { data: uploadData } =
    await clientInstance.getUploadUrl({ bucketId });

  const res = await clientInstance.uploadFile({
    uploadUrl: uploadData.uploadUrl,
    uploadAuthToken: uploadData.authorizationToken,
    fileName,
    data: buffer,
    mime: contentType,
    info,
  });

  return {
    fileName,
    fileId: res?.data?.fileId,
    url: buildPublicUrl(fileName),
    raw: res?.data,
  };
}

/**
 * Reset all cached state.
 * Batman uses this when swapping utility belts.
 */
export function resetUploadCache() {
  cachedBucketId = BUCKET_ID;
  lastAuthAt = 0;
  client = null;
  logWarn('UPLOAD', 'Backblaze upload cache reset');
}
