/**
 * Drift detection utilities comparing real and synthetic session timelines.
 */

import { extractTimelinePoints } from '../utils/timeline.js';

function normaliseTimeline(input) {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input;
  }
  if (typeof input === 'object') {
    return extractTimelinePoints(input);
  }
  return [];
}

function average(values = []) {
  if (!values.length) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function computeTimeDrift(realPoints, syntheticPoints) {
  if (!realPoints.length || !syntheticPoints.length) {
    return 0;
  }
  const minLength = Math.min(realPoints.length, syntheticPoints.length);
  const deltas = [];
  for (let i = 0; i < minLength; i += 1) {
    const real = realPoints[i];
    const synthetic = syntheticPoints[i];
    deltas.push(Math.abs(real.t_ms - synthetic.t_ms));
  }
  return Number(average(deltas).toFixed(2));
}

function computeBiometricDrift(realPoints, syntheticPoints) {
  if (!realPoints.length || !syntheticPoints.length) {
    return 0;
  }
  const minLength = Math.min(realPoints.length, syntheticPoints.length);
  const drifts = [];
  for (let i = 0; i < minLength; i += 1) {
    const real = realPoints[i];
    const synthetic = syntheticPoints[i];
    const realHeart = Number(real.heart_bpm ?? real.heartRate ?? real.hr);
    const syntheticHeart = Number(synthetic.heart_bpm ?? synthetic.heartRate ?? synthetic.hr);
    if (Number.isFinite(realHeart) && Number.isFinite(syntheticHeart) && realHeart > 0) {
      const delta = Math.abs(realHeart - syntheticHeart) / realHeart;
      drifts.push(delta * 100);
    }
  }
  return Number(average(drifts).toFixed(2));
}

function computeIntegrityScore(timeDrift, biometricDrift) {
  const timeScore = Math.max(0, 1 - timeDrift / 1000);
  const biometricScore = Math.max(0, 1 - biometricDrift / 50);
  return Number(((timeScore * 0.6) + (biometricScore * 0.4)).toFixed(2));
}

export function detectDrift(realSession, syntheticSession) {
  const realTimeline = normaliseTimeline(realSession);
  const syntheticTimeline = normaliseTimeline(syntheticSession);

  const timeDriftMsAvg = computeTimeDrift(realTimeline, syntheticTimeline);
  const biometricDriftPercent = computeBiometricDrift(realTimeline, syntheticTimeline);
  const integrityScore = computeIntegrityScore(timeDriftMsAvg, biometricDriftPercent);

  return {
    time_drift_ms_avg: timeDriftMsAvg,
    biometric_drift_percent: biometricDriftPercent,
    synthetic_integrity_score: integrityScore,
  };
}

export default detectDrift;
