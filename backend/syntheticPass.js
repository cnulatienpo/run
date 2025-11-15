import { logDebug } from './log.js';

const MAX_TIMESTAMP_JITTER_MS = 500;
const HEART_RATE_NOISE = 0.03; // +/-3%

function jitterDateTime(value, maxJitterMs = MAX_TIMESTAMP_JITTER_MS) {
  const reference = value ? new Date(value) : new Date();
  if (Number.isNaN(reference.getTime())) {
    return new Date().toISOString();
  }
  const offset = (Math.random() * 2 - 1) * maxJitterMs;
  return new Date(reference.getTime() + offset).toISOString();
}

function perturbHeartRate(heartRate, spread = HEART_RATE_NOISE) {
  if (typeof heartRate !== 'number' || Number.isNaN(heartRate)) {
    return heartRate;
  }
  const factor = 1 + (Math.random() * 2 - 1) * spread;
  const result = Math.max(0, heartRate * factor);
  return Number(result.toFixed(2));
}

function cloneData(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }
  return JSON.parse(JSON.stringify(data));
}

export function syntheticPass(noodle, options = {}) {
  if (!noodle || typeof noodle !== 'object') {
    throw new Error('A noodle object must be provided to synthesise.');
  }

  const { anonymizationProfile = 'standard_v1' } = options;

  const synthetic = cloneData(noodle);
  synthetic.synthetic = true;
  synthetic.synthetic_flag = true;
  synthetic.anonymization_profile = anonymizationProfile;
  synthetic.timestamp = jitterDateTime(noodle.timestamp);

  if (Array.isArray(noodle.events)) {
    synthetic.events = noodle.events.map((event) => ({
      ...event,
      time: jitterDateTime(event.time),
    }));
  }

  if (noodle?.data) {
    synthetic.data = {
      ...cloneData(noodle.data),
    };

    if (typeof noodle.data.heartRate === 'number') {
      synthetic.data.heartRate = perturbHeartRate(noodle.data.heartRate);
    }
  }

  logDebug('SYNTHETIC', 'Generated synthetic noodle variant', {
    sessionId: synthetic.sessionId,
    anonymization_profile: synthetic.anonymization_profile,
  });

  return synthetic;
}
