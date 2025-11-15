const { v4: uuidv4 } = require('uuid');

function jitterTimestamp(isoString, jitterMinutes) {
  if (!isoString) {
    return new Date().toISOString();
  }

  const base = new Date(isoString);
  if (Number.isNaN(base.getTime())) {
    return new Date().toISOString();
  }

  const rangeMs = jitterMinutes * 60 * 1000;
  const offset = (Math.random() * 2 - 1) * rangeMs;
  return new Date(base.getTime() + offset).toISOString();
}

function jitterEventTime(isoString, jitterSeconds) {
  if (!isoString) {
    return new Date().toISOString();
  }

  const base = new Date(isoString);
  if (Number.isNaN(base.getTime())) {
    return new Date().toISOString();
  }

  const rangeMs = jitterSeconds * 1000;
  const offset = (Math.random() * 2 - 1) * rangeMs;
  return new Date(base.getTime() + offset).toISOString();
}

function applyNoiseToNumber(value, percentage, { floorZero = true } = {}) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return value;
  }

  const factor = 1 + (Math.random() * 2 - 1) * percentage;
  const noisy = value * factor;
  if (!floorZero) {
    return Number(noisy.toFixed(2));
  }

  return Number(Math.max(0, noisy).toFixed(2));
}

function perturbDataBlock(data, percentage) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  return Object.keys(data).reduce((acc, key) => {
    const value = data[key];

    if (typeof value === 'number') {
      acc[key] = applyNoiseToNumber(value, percentage);
      return acc;
    }

    if (Array.isArray(value)) {
      acc[key] = value.map((item) => applyNoiseToNumber(item, percentage));
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});
}

function scrubUserId(userId) {
  if (!userId) {
    return undefined;
  }

  return `synthetic-${userId}`;
}

function syntheticPass(noodleObject, options = {}) {
  if (!noodleObject || typeof noodleObject !== 'object') {
    throw new Error('A noodle object is required to generate a synthetic pass.');
  }

  const {
    jitterMinutes = 5,
    eventJitterSeconds = 5,
    noisePercentage = 0.05,
    preserveUserId = false,
  } = options;

  const synthetic = JSON.parse(JSON.stringify(noodleObject));

  synthetic.synthetic = true;
  synthetic.sessionId = `${noodleObject.sessionId || uuidv4()}-syn-${uuidv4().slice(0, 8)}`;
  synthetic.timestamp = jitterTimestamp(noodleObject.timestamp, jitterMinutes);
  synthetic.data = perturbDataBlock(noodleObject.data, noisePercentage);

  if (Array.isArray(noodleObject.events)) {
    synthetic.events = noodleObject.events.map((event) => {
      const syntheticEvent = { ...event };
      syntheticEvent.time = jitterEventTime(event.time, eventJitterSeconds);
      return syntheticEvent;
    });
  } else {
    synthetic.events = [];
  }

  if (noodleObject.userId) {
    synthetic.userId = preserveUserId ? noodleObject.userId : scrubUserId(noodleObject.userId);
  }

  return synthetic;
}

module.exports = {
  syntheticPass,
};
