// src/uploadToB2.js
// This file is intentionally inert.
// All Backblaze uploads must go through backend/uploadToB2.js.

export async function uploadToB2() {
  throw new Error(
    'uploadToB2 is disabled in src/. Use backend/uploadToB2.js instead.'
  );
}

export default uploadToB2;
