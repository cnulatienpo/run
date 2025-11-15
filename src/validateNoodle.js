const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const schemaV1 = require('./schema/noodle-v1.schema.json');

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

const validators = new Map();
validators.set(1, ajv.compile(schemaV1));

function validateNoodle(noodleObject) {
  if (!noodleObject || typeof noodleObject !== 'object') {
    throw new Error('A noodle object must be provided for validation.');
  }

  const version = noodleObject.version ?? 1;
  const validator = validators.get(version);

  if (!validator) {
    throw new Error(`Unsupported noodle schema version: ${version}`);
  }

  const valid = validator(noodleObject);
  if (!valid) {
    const message = ajv.errorsText(validator.errors, { separator: '\n' });
    const error = new Error(`Noodle validation failed: ${message}`);
    error.validationErrors = validator.errors;
    throw error;
  }

  return true;
}

module.exports = {
  validateNoodle,
};
