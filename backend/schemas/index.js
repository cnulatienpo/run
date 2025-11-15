import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import schemaV100 from './v1.0.0.json' assert { type: 'json' };

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

const schemaRegistry = new Map([
  ['v1.0.0', schemaV100],
]);

const compiledValidators = new Map();

function normaliseVersionTag(versionTag) {
  if (typeof versionTag !== 'string' || versionTag.length === 0) {
    return versionTag;
  }
  if (schemaRegistry.has(versionTag)) {
    return versionTag;
  }
  const prefixed = versionTag.startsWith('v') ? versionTag : `v${versionTag}`;
  if (schemaRegistry.has(prefixed)) {
    return prefixed;
  }
  return versionTag;
}

export function resolveSchemaVersion(payload, fallback = 'v1.0.0') {
  if (payload && typeof payload === 'object') {
    if (typeof payload.schema_version === 'string' && payload.schema_version.length > 0) {
      return normaliseVersionTag(payload.schema_version);
    }
    if (typeof payload.schemaVersion === 'string' && payload.schemaVersion.length > 0) {
      return normaliseVersionTag(payload.schemaVersion);
    }
  }
  return normaliseVersionTag(fallback);
}

export function loadSchema(versionTag = 'v1.0.0') {
  const normalised = normaliseVersionTag(versionTag);
  const schema = schemaRegistry.get(normalised);
  if (!schema) {
    throw new Error(`Unsupported noodle schema version: ${versionTag}`);
  }
  return schema;
}

export function assertSchemaVersion(versionTag = 'v1.0.0') {
  const normalised = normaliseVersionTag(versionTag);
  if (!schemaRegistry.has(normalised)) {
    const error = new Error(`Unsupported noodle schema version: ${versionTag}`);
    error.code = 'UNSUPPORTED_SCHEMA_VERSION';
    throw error;
  }
  return normalised;
}

export function getValidator(versionTag = 'v1.0.0') {
  const normalised = assertSchemaVersion(versionTag);
  if (!compiledValidators.has(normalised)) {
    const schema = loadSchema(normalised);
    compiledValidators.set(normalised, ajv.compile(schema));
  }
  return compiledValidators.get(normalised);
}

export function validateNoodle(payload, versionTag = 'v1.0.0') {
  if (!payload || typeof payload !== 'object') {
    throw new Error('A noodle payload must be an object for validation.');
  }

  const validator = getValidator(versionTag);
  const isValid = validator(payload);
  if (!isValid) {
    const validationError = new Error('Noodle validation failed.');
    validationError.validationErrors = validator.errors ?? [];
    throw validationError;
  }
  return true;
}

export function listSupportedVersions() {
  return Array.from(schemaRegistry.keys());
}

export function isSupportedVersion(versionTag) {
  const normalised = normaliseVersionTag(versionTag);
  return schemaRegistry.has(normalised);
}
