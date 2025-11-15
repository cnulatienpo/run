import { v4 as uuidv4 } from 'uuid';

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

export function buildNoodle(rawData = {}) {
  const schemaVersion = rawData.schema_version || rawData.schemaVersion;

  const noodle = {
    version: rawData.version ?? 1,
    sessionId: rawData.sessionId ?? uuidv4(),
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

  return noodle;
}
