/**
 * Synthetic noodle generation utilities that apply anonymisation
 * policies and watermark synthetic payloads for later auditing.
 */

import crypto from 'crypto';

import { logDebug } from './log.js';
import { resolveAnonymizationProfile } from './config/loadAnonymizationProfiles.js';
import { isSessionBlocked } from './config/noFlyList.js';
import { logAudit } from './utils/auditLogger.js';

/**
 * Clones a plain data structure by JSON serialisation, ensuring we
 * never mutate the original noodle payload during processing.
 *
 * @param {unknown} data The input data structure.
 * @returns {any} A deep clone of the provided input object.
 */
function cloneData(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }
  return JSON.parse(JSON.stringify(data));
}

/**
 * Generates a jitter offset respecting the configured anonymisation
 * profile range. A magnitude is chosen between the configured minimum
 * and maximum, and the sign is randomly flipped to yield +/- behaviour.
 *
 * @param {{min?: number, max?: number}} range Range configuration.
 * @returns {number} Milliseconds to add to the reference timestamp.
 */
function resolveJitterOffset(range = {}) {
  const minimum = Number.isFinite(range.min) ? Number(range.min) : 0;
  const maximumSource = Number.isFinite(range.max) ? Number(range.max) : minimum;
  const maximum = Math.max(maximumSource, minimum);
  const magnitude = minimum + Math.random() * (maximum - minimum);
  const sign = Math.random() < 0.5 ? -1 : 1;
  return magnitude * sign;
}

/**
 * Applies the jitter offset to a timestamp value, providing a sensible
 * fallback when the input is invalid or missing.
 *
 * @param {string|undefined} value Timestamp string.
 * @param {{min?: number, max?: number}} range Jitter range metadata.
 * @returns {string} ISO timestamp string with jitter applied.
 */
function jitterDateTime(value, range) {
  const reference = value ? new Date(value) : new Date();
  if (Number.isNaN(reference.getTime())) {
    return new Date().toISOString();
  }
  const offset = resolveJitterOffset(range);
  return new Date(reference.getTime() + offset).toISOString();
}

/**
 * Applies anonymisation noise to numeric biometric readings using the
 * provided spread percentage.
 *
 * @param {number} value Original biometric value.
 * @param {number} spread Maximum fractional offset to apply.
 * @returns {number} The perturbed biometric value.
 */
function perturbNumericValue(value, spread) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return value;
  }
  if (!Number.isFinite(spread) || spread <= 0) {
    return Number(value.toFixed(2));
  }
  const factor = 1 + (Math.random() * 2 - 1) * spread;
  const result = Math.max(0, value * factor);
  return Number(result.toFixed(2));
}

/**
 * Applies biometric noise configuration to the noodle data object.
 * Only numeric properties explicitly referenced in the profile are
 * modified to ensure deterministic fields remain untouched.
 *
 * @param {Record<string, any>} source Source data object.
 * @param {Record<string, number>} noiseMap Noise configuration map.
 * @returns {Record<string, any>} Data object with perturbations applied.
 */
function applyBiometricNoise(source, noiseMap = {}) {
  const mutated = cloneData(source);
  Object.entries(noiseMap).forEach(([field, spread]) => {
    if (Object.prototype.hasOwnProperty.call(mutated, field)) {
      mutated[field] = perturbNumericValue(mutated[field], spread);
    }
  });
  return mutated;
}

/**
 * Generates a deterministic-yet-lightweight watermark for synthetic
 * payloads to support later audits.
 *
 * @param {string} sessionId Session identifier.
 * @param {string} profileName Profile name applied to the noodle.
 * @param {string} timestamp Synthetic timestamp used.
 * @returns {string} Base64 encoded watermark.
 */
function deriveSyntheticHash(sessionId, profileName, timestamp) {
  const hash = crypto.createHash('sha256');
  hash.update(String(sessionId ?? '')); // guard against undefined
  hash.update('|');
  hash.update(String(profileName ?? ''));
  hash.update('|');
  hash.update(String(timestamp ?? ''));
  return hash.digest('base64').slice(0, 24);
}

/**
 * Generates a synthetic noodle variant using the configured
 * anonymisation profile settings. Metadata describing the chosen
 * profile is embedded in the synthetic noodle payload along with a
 * synthetic watermark.
 *
 * @param {Record<string, any>} noodle Fully validated noodle payload.
 * @param {{ anonymizationProfile?: string }} options Synthetic options.
 * @returns {Promise<Record<string, any>>} Synthetic noodle payload.
 */
export async function syntheticPass(noodle, options = {}) {
  if (!noodle || typeof noodle !== 'object') {
    throw new Error('A noodle object must be provided to synthesise.');
  }

  if (await isSessionBlocked(noodle.sessionId)) {
    throw new Error(`Session ${noodle.sessionId} is restricted and cannot be synthesised.`);
  }

  const { anonymizationProfile } = options;
  const { name: resolvedProfileName, definition: profileDefinition } = await resolveAnonymizationProfile(
    anonymizationProfile,
    'default',
  );

  const synthetic = cloneData(noodle);
  synthetic.synthetic = true;
  synthetic.synthetic_flag = true;
  synthetic.anonymization_profile = resolvedProfileName;
  synthetic.anonymization_profile_tag = profileDefinition?.tag ?? resolvedProfileName;

  const jitterRange = profileDefinition?.time_jitter_ms ?? {};
  synthetic.timestamp = jitterDateTime(noodle.timestamp, jitterRange);

  if (Array.isArray(noodle.events)) {
    synthetic.events = noodle.events.map((event) => ({
      ...event,
      time: jitterDateTime(event.time, jitterRange),
    }));
  }

  if (noodle?.data) {
    synthetic.data = applyBiometricNoise(noodle.data, profileDefinition?.biometric_noise_percent);
  }

  synthetic._synthetic_hash = deriveSyntheticHash(
    synthetic.sessionId,
    synthetic.anonymization_profile,
    synthetic.timestamp,
  );

  logDebug('SYNTHETIC', 'Generated synthetic noodle variant', {
    sessionId: synthetic.sessionId,
    anonymization_profile: synthetic.anonymization_profile,
    anonymization_profile_tag: synthetic.anonymization_profile_tag,
  });

  await logAudit('GENERATION', `synthetic profile used: '${synthetic.anonymization_profile}'`);

  return synthetic;
}
