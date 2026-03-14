/**
 * DATA MODEL DIVERGENCE WARNING:
 * rv-app uses Deck + Mnemonic objects stored in IndexedDB.
 * backend/clip library uses ClipMetadata stored in JSON.
 * These models DO NOT align and are NOT synced.
 * No mapping exists; no transformation layer implemented.
 * High-risk architectural mismatch.
 */
export {};
