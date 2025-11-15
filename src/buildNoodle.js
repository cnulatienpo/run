const { randomUUID } = require('crypto');

const { ensurePrivacyLedger } = require('./privacyLedger');

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

function buildTrainingLabels(rawData = {}) {
  const labels = rawData.training_labels || rawData.trainingLabels;
  if (!labels || typeof labels !== 'object') {
    return undefined;
  }

  const normalized = {};
  ['mood', 'intent', 'motion_quality'].forEach((key) => {
    if (labels[key] != null) {
      normalized[key] = String(labels[key]);
    }
  });

  if (labels.confidence_scores && typeof labels.confidence_scores === 'object') {
    const confidence = Object.entries(labels.confidence_scores).reduce((acc, [key, value]) => {
      const numericValue = Number(value);
      if (!Number.isNaN(numericValue)) {
        acc[key] = numericValue;
      }
      return acc;
    }, {});

    if (Object.keys(confidence).length > 0) {
      normalized.confidence_scores = confidence;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function buildNoodle(rawData = {}) {
  const version = 1;
  const sessionId = rawData.sessionId || randomUUID();
  const timestamp = normalizeTimestamp(rawData.timestamp || rawData.startTime);

  const noodle = {
    version,
    sessionId,
    timestamp,
    data: buildDataBlock(rawData),
    events: normalizeEvents(rawData.events),
    synthetic: Boolean(rawData.synthetic),
  };

  const privacyOptions = {
    inputType: rawData.synthetic ? 'synthetic' : 'real',
    syntheticProfile: rawData.syntheticProfile || rawData.synthetic_profile || null,
    biometricsSource: rawData.biometricsSource || rawData.biometrics_source || (rawData.synthetic ? 'transformed' : 'real'),
    movementSource: rawData.movementSource || rawData.movement_source || 'user_recorded',
    sensitiveFields: rawData.sensitiveFields || rawData.sensitive_fields || [],
    exportApproved: rawData.exportApproved ?? rawData.export_approved ?? false,
  };
  ensurePrivacyLedger(noodle, privacyOptions);

  if (rawData.userId) {
    noodle.userId = String(rawData.userId);
  }

  if (rawData.notes) {
    noodle.notes = String(rawData.notes);
  }

  const labels = buildTrainingLabels(rawData);
  if (labels) {
    noodle.training_labels = labels;
  }

  if (Object.keys(noodle.data).length === 0) {
    throw new Error('Noodle data block cannot be empty. Provide metrics or data fields.');
  }

  return noodle;
}

module.exports = {
  buildNoodle,
};
