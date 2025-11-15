const { v4: uuidv4 } = require('uuid');

function normalizeTimestamp(input) {
  if (!input) {
    return new Date().toISOString();
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function normalizeEvents(events = []) {
  if (!Array.isArray(events)) {
    return [];
  }

  return events
    .filter(Boolean)
    .map((event) => {
      const normalized = { ...event };
      if (event.time) {
        const eventTime = new Date(event.time);
        if (!Number.isNaN(eventTime.getTime())) {
          normalized.time = eventTime.toISOString();
        } else {
          normalized.time = new Date().toISOString();
        }
      } else if (event.timestamp) {
        const eventTime = new Date(event.timestamp);
        normalized.time = !Number.isNaN(eventTime.getTime())
          ? eventTime.toISOString()
          : new Date().toISOString();
        delete normalized.timestamp;
      } else {
        normalized.time = new Date().toISOString();
      }

      if (typeof normalized.eventType !== 'string' || normalized.eventType.length === 0) {
        normalized.eventType = 'unknown';
      }

      return normalized;
    });
}

function buildDataBlock(rawData = {}) {
  if (rawData.data && typeof rawData.data === 'object' && !Array.isArray(rawData.data)) {
    return { ...rawData.data };
  }

  if (rawData.metrics && typeof rawData.metrics === 'object' && !Array.isArray(rawData.metrics)) {
    return { ...rawData.metrics };
  }

  return {};
}

function buildNoodle(rawData = {}) {
  const version = 1;
  const sessionId = rawData.sessionId || uuidv4();
  const timestamp = normalizeTimestamp(rawData.timestamp || rawData.startTime);

  const noodle = {
    version,
    sessionId,
    timestamp,
    data: buildDataBlock(rawData),
    events: normalizeEvents(rawData.events),
    synthetic: Boolean(rawData.synthetic),
  };

  if (rawData.userId) {
    noodle.userId = String(rawData.userId);
  }

  if (rawData.notes) {
    noodle.notes = String(rawData.notes);
  }

  if (Object.keys(noodle.data).length === 0) {
    throw new Error('Noodle data block cannot be empty. Provide metrics or data fields.');
  }

  return noodle;
}

module.exports = {
  buildNoodle,
};
