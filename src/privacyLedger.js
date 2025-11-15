const DEFAULT_SCHEMA_VERSION = 'v1.0.0';

function normalizeArray(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => (item == null ? null : String(item)))
    .filter((value) => Boolean(value))
    .filter((value, index, arr) => arr.indexOf(value) === index);
}

function buildPrivacyLedger(overrides = {}) {
  const {
    schemaVersion = DEFAULT_SCHEMA_VERSION,
    inputType = 'real',
    syntheticProfile = null,
    biometricsSource = inputType === 'real' ? 'real' : 'transformed',
    movementSource = 'user_recorded',
    sensitiveFields = [],
    exportApproved = false,
  } = overrides;

  return {
    schema_version: schemaVersion,
    input_type: inputType,
    synthetic_profile: syntheticProfile,
    biometrics_source: biometricsSource,
    movement_source: movementSource,
    sensitive_fields: normalizeArray(sensitiveFields),
    export_approved: Boolean(exportApproved),
  };
}

function ensurePrivacyLedger(noodle, overrides = {}) {
  if (!noodle || typeof noodle !== 'object') {
    throw new Error('A noodle object is required to ensure privacy metadata.');
  }

  const existing = noodle.privacy_ledger || {};
  const merged = {
    ...buildPrivacyLedger(existing),
    ...buildPrivacyLedger({
      ...existing,
      ...overrides,
      sensitiveFields: overrides.sensitiveFields || existing.sensitive_fields || existing.sensitiveFields,
      schemaVersion: overrides.schemaVersion || existing.schema_version || existing.schemaVersion,
    }),
  };

  noodle.privacy_ledger = merged;
  return merged;
}

module.exports = {
  buildPrivacyLedger,
  ensurePrivacyLedger,
};
