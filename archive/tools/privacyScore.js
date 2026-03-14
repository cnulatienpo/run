const { ensurePrivacyLedger } = require('../src/privacyLedger');

function average(values = []) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function detectTemporalPrecision(noodle) {
  if (!Array.isArray(noodle.events) || noodle.events.length === 0) {
    return 0;
  }
  const timestamps = noodle.events
    .map((event) => new Date(event.time).getTime())
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => a - b);

  if (timestamps.length < 2) {
    return 0;
  }

  const deltas = [];
  for (let i = 1; i < timestamps.length; i += 1) {
    deltas.push(Math.abs(timestamps[i] - timestamps[i - 1]));
  }
  const medianDelta = deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)];

  if (medianDelta <= 15 * 1000) {
    return 0.9;
  }
  if (medianDelta <= 60 * 1000) {
    return 0.6;
  }
  if (medianDelta <= 5 * 60 * 1000) {
    return 0.4;
  }
  return 0.2;
}

function detectLocationRisk(noodle) {
  const ledger = noodle.privacy_ledger || {};
  if (Array.isArray(ledger.sensitive_fields) && ledger.sensitive_fields.includes('location')) {
    return 0.9;
  }
  if (noodle.data && (noodle.data.location || noodle.data.location_trace)) {
    return 0.8;
  }
  return 0.2;
}

function detectBiometricsRisk(noodle) {
  const ledger = noodle.privacy_ledger || {};
  const source = ledger.biometrics_source || 'unknown';
  if (source === 'real') {
    return 0.8;
  }
  if (source === 'transformed') {
    return 0.5;
  }
  return 0.2;
}

function recommendActions(riskVector) {
  if (riskVector.location_trace > 0.7) {
    return 'Apply jitter and remove location before export.';
  }
  if (riskVector.biometrics > 0.6) {
    return 'Mask biometric streams or apply percentile encoding.';
  }
  if (riskVector.temporal_precision > 0.5) {
    return 'Bucket timestamps to coarser intervals.';
  }
  return 'Ready for export with current privacy settings.';
}

function privacyScore(noodle) {
  if (!noodle || typeof noodle !== 'object') {
    throw new Error('A noodle object is required.');
  }

  ensurePrivacyLedger(noodle);

  const riskVector = {
    biometrics: detectBiometricsRisk(noodle),
    temporal_precision: detectTemporalPrecision(noodle),
    location_trace: detectLocationRisk(noodle),
  };

  const score = average(Object.values(riskVector));

  return {
    score: Number(score.toFixed(2)),
    risk_vector: riskVector,
    recommendation: recommendActions(riskVector),
  };
}

module.exports = {
  privacyScore,
};
