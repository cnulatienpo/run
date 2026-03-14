const { ensurePrivacyLedger } = require('../src/privacyLedger');

function sanitizeApprovedFields(consent = {}) {
  if (!consent || typeof consent !== 'object') {
    return new Set();
  }
  const approved = Array.isArray(consent.approved_fields) ? consent.approved_fields : [];
  return new Set(approved.map((field) => String(field)));
}

function applyConsent(noodle, consent, { mutate = false } = {}) {
  if (!noodle || typeof noodle !== 'object') {
    throw new Error('A noodle object is required.');
  }
  if (!consent || typeof consent !== 'object') {
    throw new Error('A consent manifest is required.');
  }

  const working = mutate ? noodle : JSON.parse(JSON.stringify(noodle));
  const approvedFields = sanitizeApprovedFields(consent);
  const hasRestrictions = approvedFields.size > 0;
  const removed = [];

  if (working.data && typeof working.data === 'object') {
    Object.keys(working.data).forEach((key) => {
      if (hasRestrictions && !approvedFields.has(key)) {
        removed.push(`data.${key}`);
        delete working.data[key];
      }
    });
  }

  if (Array.isArray(working.events) && hasRestrictions) {
    working.events = working.events.map((event) => {
      const cloned = { ...event };
      if (cloned.metadata && typeof cloned.metadata === 'object') {
        Object.keys(cloned.metadata).forEach((metaKey) => {
          if (!approvedFields.has(metaKey)) {
            removed.push(`events.metadata.${metaKey}`);
            delete cloned.metadata[metaKey];
          }
        });
      }
      return cloned;
    });
  }

  ensurePrivacyLedger(working);
  const ledger = working.privacy_ledger;
  const sensitive = Array.isArray(ledger.sensitive_fields) ? ledger.sensitive_fields : [];
  const violations = hasRestrictions
    ? sensitive.filter((field) => !approvedFields.has(field)).map((field) => `sensitive.${field}`)
    : [];

  const exportAllowed = Boolean(ledger.export_approved) && Array.isArray(consent.allowed_uses)
    ? consent.allowed_uses.includes('export')
    : Boolean(ledger.export_approved);

  working.privacy_ledger.export_approved = exportAllowed;

  return {
    noodle: working,
    removedFields: removed,
    violations,
    exportAllowed,
  };
}

function findConsentViolations(noodle, consent) {
  if (!consent || typeof consent !== 'object') {
    return [];
  }
  const approvedFields = sanitizeApprovedFields(consent);
  if (approvedFields.size === 0) {
    return [];
  }
  const violations = [];

  if (noodle.data && typeof noodle.data === 'object') {
    Object.keys(noodle.data).forEach((key) => {
      if (!approvedFields.has(key)) {
        violations.push(`data.${key}`);
      }
    });
  }

  const ledger = noodle.privacy_ledger || {};
  const sensitive = Array.isArray(ledger.sensitive_fields) ? ledger.sensitive_fields : [];
  sensitive.forEach((field) => {
    if (!approvedFields.has(field)) {
      violations.push(`sensitive.${field}`);
    }
  });

  return violations;
}

module.exports = {
  applyConsent,
  findConsentViolations,
};
