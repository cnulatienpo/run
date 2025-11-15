/**
 * Helper utilities for normalising noodle payloads before validation.
 */

import { randomUUID } from 'crypto';

/**
 * Normalises the timestamp used in noodle payloads, applying sensible
 * defaults when the provided value is missing or invalid.
 *
 * @param {string|undefined} value Original timestamp string.
 * @returns {string} ISO timestamp string.
 */
function normalizeTimestamp(value) {
  if (!value) {
    return new Date().toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

/**
 * Normalises noodle event collections ensuring timestamps and event
 * metadata align with schema expectations.
 *
 * @param {Array<Record<string, any>>} events Original event list.
 * @returns {Array<Record<string, any>>} Sanitised event list.
 */
function normalizeEvents(events = []) {
  if (!Array.isArray(events)) {
    return [];
  }
  return events
    .filter(Boolean)
    .map((event) => {
      const normalized = { ...event };
      normalized.time = normalizeTimestamp(event.time || event.timestamp);
      if (typeof normalized.eventType !== 'string' || normalized.eventType.length === 0) {
        normalized.eventType = 'unknown';
      }
      delete normalized.timestamp;
      return normalized;
    });
}

/**
 * Constructs a noodle payload using sane defaults, derived metadata, and
 * schema-aligned property names. This function is used by HTTP handlers
 * and CLI utilities to ensure consistent noodle structures.
 *
 * @param {Record<string, any>} rawData Untrusted noodle-like input.
 * @returns {Record<string, any>} Normalised noodle payload.
 */
export function buildNoodle(rawData = {}) {
  const schemaVersion = rawData.schema_version || rawData.schemaVersion;

  const noodle = {
    version: rawData.version ?? 1,
    sessionId: rawData.sessionId ?? randomUUID(),
    timestamp: normalizeTimestamp(rawData.timestamp ?? rawData.startTime),
    data: { ...(rawData.data ?? rawData.metrics ?? {}) },
    events: normalizeEvents(rawData.events),
    synthetic: Boolean(rawData.synthetic),
  };

  if (schemaVersion) {
    noodle.schema_version = schemaVersion;
  }

  if (!noodle.data || Object.keys(noodle.data).length === 0) {
    throw new Error('Noodle data block cannot be empty.');
  }

  if (rawData.userId) {
    noodle.userId = String(rawData.userId);
  }

  if (rawData.notes) {
    noodle.notes = String(rawData.notes);
  }

  if (rawData.media_track_id || rawData.mediaTrackId) {
    noodle.media_track_id = String(rawData.media_track_id ?? rawData.mediaTrackId);
  }

  return noodle;
}
