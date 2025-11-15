require('dotenv').config();
const B2 = require('backblaze-b2');

const {
  B2_APPLICATION_KEY_ID,
  B2_APPLICATION_KEY,
  B2_BUCKET_ID,
  B2_BUCKET_NAME,
} = process.env;

const { ensurePrivacyLedger } = require('./privacyLedger');

let b2Client;
let cachedBucketId = B2_BUCKET_ID || null;
let lastAuthorization = 0;
const AUTH_VALIDITY_MS = 1000 * 60 * 60 * 23; // 23 hours

function ensureClient() {
  if (!B2_APPLICATION_KEY_ID || !B2_APPLICATION_KEY) {
    throw new Error('Backblaze B2 credentials are not set. Please provide B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY environment variables.');
  }

  if (!b2Client) {
    b2Client = new B2({
      applicationKeyId: B2_APPLICATION_KEY_ID,
      applicationKey: B2_APPLICATION_KEY,
    });
  }

  return b2Client;
}

async function authorizeIfNeeded(client) {
  const now = Date.now();
  if (now - lastAuthorization > AUTH_VALIDITY_MS) {
    await client.authorize();
    lastAuthorization = now;
  }
}

async function resolveBucketId(client) {
  if (cachedBucketId) {
    return cachedBucketId;
  }

  if (!B2_BUCKET_NAME) {
    throw new Error('Backblaze bucket information is missing. Provide B2_BUCKET_ID or B2_BUCKET_NAME in environment variables.');
  }

  const response = await client.getBucket({ bucketName: B2_BUCKET_NAME });
  if (response?.data?.bucketId) {
    cachedBucketId = response.data.bucketId;
  } else if (Array.isArray(response?.data?.buckets) && response.data.buckets.length > 0) {
    cachedBucketId = response.data.buckets[0].bucketId;
  }

  if (!cachedBucketId) {
    throw new Error(`Unable to resolve bucket ID for bucket name: ${B2_BUCKET_NAME}`);
  }

  return cachedBucketId;
}

function deriveDateSegment(timestamp) {
  if (!timestamp) {
    return new Date().toISOString().slice(0, 10);
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

function buildFileName(noodleObject, syntheticFlag) {
  const dateSegment = deriveDateSegment(noodleObject.timestamp);
  const prefix = syntheticFlag ? 'synthetic' : 'clean';
  const sessionId = noodleObject.sessionId || `session-${Date.now()}`;
  const version = noodleObject.version || 1;
  return `${prefix}/${dateSegment}/${sessionId}_v${version}.json`;
}

async function uploadToB2(noodleObject, options = {}) {
  if (!noodleObject || typeof noodleObject !== 'object') {
    throw new Error('A noodle object must be provided for upload.');
  }

  ensurePrivacyLedger(noodleObject);

  const client = ensureClient();
  await authorizeIfNeeded(client);
  const bucketId = await resolveBucketId(client);

  const syntheticFlag = options.synthetic ?? noodleObject.synthetic === true;
  const fileName = buildFileName(noodleObject, syntheticFlag);
  const fileBuffer = Buffer.from(JSON.stringify(noodleObject, null, 2));

  const uploadUrlResponse = await client.getUploadUrl({ bucketId });
  const { uploadUrl, authorizationToken } = uploadUrlResponse.data;

  const uploadResponse = await client.uploadFile({
    uploadUrl,
    uploadAuthToken: authorizationToken,
    fileName,
    data: fileBuffer,
    mime: 'application/json',
    info: {
      synthetic: syntheticFlag ? 'true' : 'false',
      version: String(noodleObject.version || 1),
    },
  });

  return {
    fileName,
    synthetic: syntheticFlag,
    version: noodleObject.version || 1,
    response: uploadResponse.data,
  };
}

module.exports = {
  uploadToB2,
};
