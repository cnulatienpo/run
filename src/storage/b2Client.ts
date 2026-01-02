// src/storage/b2Client.ts
// ============================================================
// RunnyVision — Sole Backblaze B2 integration point (PRIVATE)
// This file is the ONLY place that:
// - reads B2 credentials
// - authorizes with Backblaze
// - generates signed download URLs
// ============================================================

import B2 from "backblaze-b2";

let b2: B2 | null = null;
let authorized = false;
let apiUrl: string | null = null;
let downloadUrl: string | null = null;

/* ------------------------------------------------------------
 * Credentials (read once, here only)
 * ------------------------------------------------------------ */

const {
  B2_KEY_ID,
  B2_APP_KEY,
  B2_BUCKET_ID,
  B2_BUCKET_NAME,
} = process.env;

if (!B2_KEY_ID || !B2_APP_KEY || !B2_BUCKET_ID || !B2_BUCKET_NAME) {
  throw new Error(
    "Missing Backblaze environment variables. " +
      "Required: B2_KEY_ID, B2_APP_KEY, B2_BUCKET_ID, B2_BUCKET_NAME"
  );
}

/* ------------------------------------------------------------
 * Internal: authorize once
 * ------------------------------------------------------------ */

async function authorizeIfNeeded() {
  if (authorized && b2 && apiUrl && downloadUrl) return;

  b2 = new B2({
    applicationKeyId: B2_KEY_ID,
    applicationKey: B2_APP_KEY,
  });

  const auth = await b2.authorize();

  apiUrl = auth.data.apiUrl;
  downloadUrl = auth.data.downloadUrl;
  authorized = true;
}

/* ------------------------------------------------------------
 * Upload
 * ------------------------------------------------------------ */

export async function uploadVideo(
  buffer: Buffer,
  fileName: string,
  mimeType: string
) {
  await authorizeIfNeeded();
  if (!b2) throw new Error("B2 not initialized");

  const uploadUrlResponse = await b2.getUploadUrl({
    bucketId: B2_BUCKET_ID,
  });

  const { uploadUrl, authorizationToken } =
    uploadUrlResponse.data;

  const result = await b2.uploadFile({
    uploadUrl,
    uploadAuthToken: authorizationToken,
    fileName,
    data: buffer,
    mimeType,
  });

  return result.data;
}

/* ------------------------------------------------------------
 * Private download: signed URL
 * ------------------------------------------------------------ */

export async function getSignedDownloadUrl(
  fileName: string,
  validSeconds = 60
) {
  await authorizeIfNeeded();
  if (!b2 || !downloadUrl) throw new Error("B2 not initialized");

  // Use empty prefix to authorize access to entire bucket
  // This avoids issues with special characters in the fileNamePrefix
  const authResponse = await b2.getDownloadAuthorization({
    bucketId: B2_BUCKET_ID,
    fileNamePrefix: "",
    validDurationInSeconds: validSeconds,
  });

  const token = authResponse.data.authorizationToken;
  const encodedFileName = encodeURIComponent(fileName);

  return `${downloadUrl}/file/${B2_BUCKET_NAME}/${encodedFileName}?Authorization=${token}`;
}

