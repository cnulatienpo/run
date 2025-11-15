/**
 * Utilities for loading anonymization profile metadata used by the
 * synthetic noodle transformation pipeline.
 */

import { access, readFile } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { logWarn } from '../log.js';

const profileFileUrl = new URL('./anonymizationProfiles.json', import.meta.url);
const profileFilePath = fileURLToPath(profileFileUrl);

let cache;

/**
 * Merges two anonymisation profile definitions respecting nested objects.
 *
 * @param {Record<string, any>} base Base profile definition.
 * @param {Record<string, any>} extension Extending profile definition.
 * @returns {Record<string, any>} Combined profile definition.
 */
function mergeProfileDefinitions(base = {}, extension = {}) {
  return {
    ...base,
    ...extension,
    time_jitter_ms: {
      ...(base.time_jitter_ms ?? {}),
      ...(extension.time_jitter_ms ?? {}),
    },
    biometric_noise_percent: {
      ...(base.biometric_noise_percent ?? {}),
      ...(extension.biometric_noise_percent ?? {}),
    },
  };
}

/**
 * Resolves profile inheritance chains, producing a merged definition.
 *
 * @param {Record<string, any>} profiles Profile registry map.
 * @param {string} profileName Profile to compose.
 * @param {Set<string>} visited Profiles visited to detect cycles.
 * @returns {Record<string, any>|undefined} Composed profile definition.
 */
function composeProfile(profiles, profileName, visited = new Set()) {
  const definition = profiles[profileName];
  if (!definition) {
    return undefined;
  }
  if (!definition.extends) {
    return definition;
  }
  if (visited.has(profileName)) {
    throw new Error(`Circular anonymization profile inheritance detected for ${profileName}`);
  }
  visited.add(profileName);
  const { extends: parentName, ...rest } = definition;
  const parent = composeProfile(profiles, parentName, visited) || {};
  return mergeProfileDefinitions(parent, rest);
}

/**
 * Reads the anonymization profile configuration file from disk.
 * The configuration is cached after the first read and re-used on
 * subsequent calls to avoid unnecessary filesystem access.
 *
 * @returns {Promise<Record<string, any>>} Resolved anonymization profile map.
 */
export async function loadAnonymizationProfiles() {
  if (cache) {
    return cache;
  }

  try {
    await access(profileFilePath, constants.F_OK);
  } catch (error) {
    throw new Error(`Anonymization profile configuration missing at ${profileFilePath}`);
  }

  const raw = await readFile(profileFilePath, 'utf8');
  const parsed = JSON.parse(raw);
  cache = parsed && typeof parsed === 'object' ? parsed : {};
  return cache;
}

/**
 * Resolves an anonymization profile definition by name, returning
 * the default profile if the provided name cannot be found.
 *
 * @param {string|undefined} profileName Requested profile identifier.
 * @param {string} [fallback='default'] Name of the fallback profile.
 * @returns {Promise<{name: string, definition: any}>} The resolved profile payload.
 */
export async function resolveAnonymizationProfile(profileName, fallback = 'default') {
  const profiles = await loadAnonymizationProfiles();
  const requested = typeof profileName === 'string' && profileName.length > 0
    ? profileName
    : fallback;
  if (profiles[requested]) {
    return { name: requested, definition: composeProfile(profiles, requested) };
  }
  if (profiles[fallback]) {
    if (requested !== fallback) {
      logWarn('SYNTHETIC', 'Unknown anonymization profile requested. Falling back to default.', {
        requestedProfile: requested,
        fallbackProfile: fallback,
      });
    }
    return { name: fallback, definition: composeProfile(profiles, fallback) };
  }
  throw new Error(`No anonymization profile named "${requested}" and fallback "${fallback}" missing.`);
}

/**
 * Exposes the absolute filesystem path to the anonymization profile store.
 * Useful for tooling and documentation output.
 *
 * @returns {string} Absolute file path of the profile configuration file.
 */
export function getAnonymizationProfilePath() {
  return path.normalize(profileFilePath);
}
