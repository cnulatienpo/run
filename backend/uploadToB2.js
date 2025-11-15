/**
 * Backblaze B2 upload helper with cached authentication and environment
 * loading support.
 */

import B2 from 'backblaze-b2';

import { loadEnv } from './config/loadEnv.js';
import { logDebug, logInfo, logWarn } from './log.js';

loadEnv();

const KEY_ID = process.env.B2_KEY_ID || process.env.B2_APPLICATION_KEY_ID;
const APP_KEY = process.env.B2_APP_KEY || process.env.B2_APPLICATION_KEY;
const BUCKET_ID = process.env.B2_BUCKET_ID || null;
const BUCKET_NAME = process.env.B2_BUCKET_NAME || null;
const DOWNLOAD_URL = process.env.B2_DOWNLOAD_URL || null;

let client;
let cachedBucketId = BUCKET_ID || null;
let lastAuth = 0;
const AUTH_TTL_MS = 1000 * 60 * 60 * 23; // 23 hours

async function ensureClientContext() {
  const clientInstance = ensureClient();
  await authorise(clientInstance);
  const bucketId = await resolveBucketId(clientInstance);
  return { clientInstance, bucketId };
}

/**
 * Ensures the Backblaze client is instantiated with the configured
 * credentials.
 *
 * @returns {B2} Authenticated Backblaze client instance.
 */
function ensureClient() {
  if (client) {
    return client;
  }

  if (!KEY_ID || !APP_KEY) {
    throw new Error('Missing Backblaze B2 credentials. Set B2_KEY_ID and B2_APP_KEY in your environment.');
  }

  client = new B2({
    applicationKeyId: KEY_ID,
    applicationKey: APP_KEY,
  });
  return client;
}

/**
 * Performs a Backblaze authorisation request if the cached credentials
 * are stale.
 *
 * @param {B2} clientInstance Backblaze client.
 */
async function authorise(clientInstance) {
  const now = Date.now();
  if (now - lastAuth < AUTH_TTL_MS) {
    return;
  }
  await clientInstance.authorize();
  lastAuth = now;
}

/**
 * Resolves the target bucket identifier either from configuration or by
 * querying Backblaze.
 *
 * @param {B2} clientInstance Backblaze client.
 * @returns {Promise<string>} Bucket identifier.
 */
async function resolveBucketId(clientInstance) {
  if (cachedBucketId) {
    return cachedBucketId;
  }

  if (!BUCKET_NAME) {
    throw new Error('Provide either B2_BUCKET_ID or B2_BUCKET_NAME environment variables.');
  }

  const response = await clientInstance.getBucket({ bucketName: BUCKET_NAME });
  const bucketId = response?.data?.bucketId || response?.data?.buckets?.[0]?.bucketId;
  if (!bucketId) {
    throw new Error(`Unable to resolve bucket id for ${BUCKET_NAME}.`);
  }
  cachedBucketId = bucketId;
  return cachedBucketId;
}

/**
 * Builds a storage path for the noodle upload using timestamp and
 * session metadata.
 *
 * @param {Record<string, any>} noodle Noodle payload.
 * @param {boolean} syntheticFlag Indicates synthetic noodle.
 * @returns {string} B2 object key.
 */
function deriveUploadPath(noodle, syntheticFlag) {
  const baseTimestamp = noodle?.timestamp ? new Date(noodle.timestamp) : new Date();
  const dateSegment = Number.isNaN(baseTimestamp.getTime())
    ? new Date().toISOString().slice(0, 10)
    : baseTimestamp.toISOString().slice(0, 10);
  const prefix = syntheticFlag ? 'synthetic' : 'real';
  const sessionId = noodle?.sessionId || `session-${Date.now()}`;
  const version = noodle?.version || 1;
  return `${prefix}/${dateSegment}/${sessionId}_v${version}.json`;
}

/**
 * Derives a publicly accessible URL for the uploaded noodle when a
 * download URL is configured.
 *
 * @param {string} fileName B2 object key.
 * @returns {string|null} Public file URL.
 */
function deriveFileUrl(fileName) {
  if (!DOWNLOAD_URL) {
    return null;
  }
  return `${DOWNLOAD_URL.replace(/\/$/, '')}/${fileName}`;
}

/**
 * Uploads a noodle payload to Backblaze B2, annotating metadata and
 * returning a summary of the upload result.
 *
 * @param {Record<string, any>} noodle Noodle payload to upload.
 * @param {{ synthetic?: boolean }} [options] Upload options.
 * @returns {Promise<{ fileName: string, synthetic: boolean, version: string|number, fileId?: string, url?: string|null }>} Upload response summary.
 */
export async function uploadToB2(noodle, options = {}) {
  if (!noodle || typeof noodle !== 'object') {
    throw new Error('Cannot upload an empty noodle payload.');
  }

  const syntheticFlag = options.synthetic ?? noodle.synthetic === true;
  const fileName = deriveUploadPath(noodle, syntheticFlag);
  const fileBuffer = Buffer.from(JSON.stringify(noodle, null, 2));

  const uploadResponse = await uploadBufferToB2({
    buffer: fileBuffer,
    fileName,
    contentType: 'application/json',
    info: {
      synthetic: syntheticFlag ? 'true' : 'false',
      version: String(noodle.version ?? '1.0.0'),
      schema_version: noodle.schema_version ?? 'v1.0.0',
    },
  });

  const result = {
    fileName,
    synthetic: syntheticFlag,
    version: noodle.version ?? '1.0.0',
    fileId: uploadResponse?.fileId,
    url: uploadResponse?.url,
  };

  logInfo('UPLOAD', 'Uploaded noodle to Backblaze B2', result);
  logDebug('UPLOAD', 'Raw upload response', uploadResponse?.raw);

  return result;
}

export async function uploadBufferToB2({ buffer, fileName, contentType = 'application/octet-stream', info = {} }) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('uploadBufferToB2 expects a Buffer payload.');
  }

  const { clientInstance, bucketId } = await ensureClientContext();
  const { data: uploadData } = await clientInstance.getUploadUrl({ bucketId });
  const uploadResponse = await clientInstance.uploadFile({
    uploadUrl: uploadData.uploadUrl,
    uploadAuthToken: uploadData.authorizationToken,
    fileName,
    data: buffer,
    mime: contentType,
    info,
  });

  const publicUrl = deriveFileUrl(fileName);

  return {
    fileName,
    fileId: uploadResponse?.data?.fileId,
    url: publicUrl,
    raw: uploadResponse?.data,
  };
}

/**
 * Clears cached Backblaze authorisation state. Useful during testing or
 * when credentials change without restarting the process.
 */
export function resetUploadCache() {
  cachedBucketId = BUCKET_ID || null;
  lastAuth = 0;
  client = undefined;
  logWarn('UPLOAD', 'Upload cache cleared.');
}
