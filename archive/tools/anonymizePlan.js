const { privacyScore } = require('./privacyScore');

function anonymizePlan(noodle) {
  const evaluation = privacyScore(noodle);
  const steps = [];

  if (evaluation.risk_vector.temporal_precision >= 0.5) {
    steps.push('Replace timeline with bucketed durations');
  }
  if (evaluation.risk_vector.biometrics >= 0.4) {
    steps.push('Apply percentile encoding to biometric fields');
  }
  if (evaluation.risk_vector.location_trace >= 0.5) {
    steps.push('Clip out event spikes and remove location traces');
  }

  if (steps.length === 0) {
    steps.push('Ledger already indicates low risk. Light jitter recommended only if exporting.');
  }

  return {
    score: evaluation.score,
    recommendation: evaluation.recommendation,
    steps,
  };
}

module.exports = {
  anonymizePlan,
};
