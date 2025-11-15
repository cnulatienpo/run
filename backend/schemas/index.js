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

export function loadSchema(versionTag = 'v1.0.0') {
  const schema = schemaRegistry.get(versionTag);
  if (!schema) {
    throw new Error(`Unsupported noodle schema version: ${versionTag}`);
  }
  return schema;
}

export function getValidator(versionTag = 'v1.0.0') {
  if (!compiledValidators.has(versionTag)) {
    const schema = loadSchema(versionTag);
    compiledValidators.set(versionTag, ajv.compile(schema));
  }
  return compiledValidators.get(versionTag);
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
