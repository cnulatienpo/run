const { randomUUID } = require('crypto');

const { mutateSession } = require('./mutateSession');

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function buildRandomSpec(noodle) {
  const shift = Math.round(randomBetween(-300000, 300000));
  const zeroHeart = Math.random() > 0.7;
  const addLabel = Math.random() > 0.5 ? { intent: `remix_${randomUUID().slice(0, 4)}` } : undefined;

  const spec = {
    shift_timeline: shift,
  };

  if (Math.random() > 0.5) {
    spec.anonymize = 'randomized_profile';
  }

  if (zeroHeart) {
    spec.zero_heart_bpm = true;
  }

  if (addLabel) {
    spec.add_label = addLabel;
  }
  return spec;
}

function generateRandomMutations(noodle, count = 3) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('Mutation count must be a positive integer.');
  }
  const results = [];
  for (let i = 0; i < count; i += 1) {
    const spec = buildRandomSpec(noodle);
    const mutationId = `mut-${randomUUID()}`;
    const mutated = mutateSession(noodle, { ...spec, mutation_id: mutationId });
    results.push({
      mutation_id: mutationId,
      spec,
      noodle: mutated,
    });
  }
  return results;
}

module.exports = {
  generateRandomMutations,
};
