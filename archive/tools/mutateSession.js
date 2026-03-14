const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const { ensurePrivacyLedger } = require('../src/privacyLedger');

function shiftIsoTimestamp(isoString, shiftMs) {
  if (!isoString) {
    return new Date(Date.now() + shiftMs).toISOString();
  }
  const base = new Date(isoString);
  if (Number.isNaN(base.getTime())) {
    return new Date(Date.now() + shiftMs).toISOString();
  }
  return new Date(base.getTime() + shiftMs).toISOString();
}

function overlaySteps(target, ghost) {
  if (!ghost || typeof ghost !== 'object') {
    return;
  }
  if (ghost.data && typeof ghost.data === 'object') {
    if (ghost.data.steps != null) {
      target.data.steps = ghost.data.steps;
    }
    if (Array.isArray(ghost.data.step_series)) {
      target.data.step_series = [...ghost.data.step_series];
    }
  }
}

function mutateSession(noodle, spec, options = {}) {
  if (!noodle || typeof noodle !== 'object') {
    throw new Error('A noodle object is required for mutation.');
  }
  if (!spec || typeof spec !== 'object') {
    throw new Error('A mutation specification is required.');
  }

  const baseDir = options.baseDir || process.cwd();
  const working = JSON.parse(JSON.stringify(noodle));
  if (!working.data || typeof working.data !== 'object') {
    working.data = {};
  }
  let shiftValue = spec.shift_timeline;
  if (typeof shiftValue === 'string') {
    const parsed = Number(shiftValue);
    shiftValue = Number.isNaN(parsed) ? undefined : parsed;
  }
  if (typeof shiftValue === 'number') {
    working.timestamp = shiftIsoTimestamp(working.timestamp, shiftValue);
    if (Array.isArray(working.events)) {
      working.events = working.events.map((event) => ({
        ...event,
        time: shiftIsoTimestamp(event.time, shiftValue),
      }));
    }
  }

  if (spec.zero_heart_bpm) {
    if (working.data && typeof working.data === 'object') {
      ['heart_bpm', 'heartRate', 'peak_heart_bpm'].forEach((key) => {
        if (key in working.data) {
          working.data[key] = 0;
        }
      });
    }
  }

  if (spec.replace_steps) {
    const ghostPath = path.isAbsolute(spec.replace_steps)
      ? spec.replace_steps
      : path.join(baseDir, spec.replace_steps);
    if (!fs.existsSync(ghostPath)) {
      throw new Error(`Ghost session not found: ${ghostPath}`);
    }
    const ghostSession = JSON.parse(fs.readFileSync(ghostPath, 'utf-8'));
    overlaySteps(working, ghostSession);
  }

  if (spec.add_label && typeof spec.add_label === 'object') {
    working.training_labels = {
      ...(working.training_labels || {}),
      ...Object.entries(spec.add_label).reduce((acc, [key, value]) => {
        acc[key] = String(value);
        return acc;
      }, {}),
    };
  }

  ensurePrivacyLedger(working);
  ensurePrivacyLedger(working, {
    inputType: 'transformed',
    syntheticProfile: spec.anonymize || working.privacy_ledger.synthetic_profile,
    biometricsSource: 'transformed',
    movementSource: 'remixed_session',
    sensitiveFields: working.privacy_ledger.sensitive_fields || [],
    exportApproved: false,
  });

  if (spec.anonymize) {
    working.privacy_ledger.synthetic_profile = spec.anonymize;
  }

  working.mutation_id = options.mutationId || spec.mutation_id || randomUUID();

  return working;
}

module.exports = {
  mutateSession,
};
