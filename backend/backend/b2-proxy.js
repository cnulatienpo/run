// backend/b2-proxy.js
// Runtime B2 proxy is DISABLED by design.
// UI and core APIs must never block on Backblaze.

export async function proxyB2Request(path) {
  return {
    disabled: true,
    reason: 'B2 proxy disabled. Use offline or precomputed assets.',
    path
  };
}

export function getAuthToken() {
  throw new Error(
    'B2 auth is disabled at runtime. No auth tokens are issued in server paths.'
  );
}
