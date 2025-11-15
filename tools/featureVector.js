function toNumber(value) {
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

function average(values = []) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function standardDeviation(values = []) {
  if (!Array.isArray(values) || values.length < 2) {
    return null;
  }
  const mean = average(values);
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function collectNumbers(candidate) {
  if (!Array.isArray(candidate)) {
    return [];
  }
  return candidate.map(toNumber).filter((value) => value !== null);
}

function deriveAvgSpeed(data) {
  const direct = toNumber(data.avg_speed || data.average_speed || data.speed);
  if (direct !== null) {
    return direct;
  }
  const samples = collectNumbers(data.speed_samples || data.speedSamples);
  if (samples.length > 0) {
    return average(samples);
  }
  return 0;
}

function derivePeakHeartBpm(noodle) {
  const data = noodle.data || {};
  const direct = toNumber(data.peak_heart_bpm || data.peakHeartBpm || data.heartRate || data.heart_bpm);
  if (direct !== null) {
    return direct;
  }

  const samples = collectNumbers(data.heart_samples || data.heartSamples);
  if (samples.length > 0) {
    return Math.max(...samples);
  }

  const eventValues = Array.isArray(noodle.events)
    ? noodle.events
        .map((event) => toNumber(event.value))
        .filter((value) => value !== null)
    : [];
  if (eventValues.length > 0) {
    return Math.max(...eventValues);
  }
  return 0;
}

function deriveSyncRatio(data) {
  const direct = toNumber(data.sync_ratio || data.syncRatio);
  if (direct !== null) {
    return direct;
  }
  const cadence = toNumber(data.cadence);
  const tempo = toNumber(data.tempo_target || data.tempoTarget);
  if (cadence !== null && tempo !== null && tempo !== 0) {
    return Number((cadence / tempo).toFixed(2));
  }
  return 0.8;
}

function deriveFlowDrops(noodle) {
  if (!Array.isArray(noodle.events)) {
    return 0;
  }
  return noodle.events.filter((event) => {
    const type = (event.eventType || '').toLowerCase();
    return type.includes('drop') || type.includes('stall');
  }).length;
}

function deriveCadenceStability(data) {
  const direct = toNumber(data.cadence_stability || data.cadenceStability);
  if (direct !== null) {
    return direct;
  }
  const cadenceSamples = collectNumbers(data.cadence_samples || data.cadenceSamples);
  if (cadenceSamples.length > 1) {
    const std = standardDeviation(cadenceSamples);
    const mean = average(cadenceSamples);
    if (std !== null && mean) {
      const stability = 1 - Math.min(std / mean, 1);
      return Number(stability.toFixed(2));
    }
  }
  return 0.9;
}

function deriveTempoAlignment(data) {
  const direct = toNumber(data.tempo_alignment_score || data.tempoAlignmentScore);
  if (direct !== null) {
    return direct;
  }
  const syncRatio = deriveSyncRatio(data);
  return Number(Math.max(0, Math.min(1, syncRatio)).toFixed(2));
}

function buildFeatureVector(noodle) {
  if (!noodle || typeof noodle !== 'object') {
    throw new Error('A noodle object is required to extract features.');
  }

  const data = noodle.data || {};
  return {
    session_id: noodle.sessionId || 'unknown-session',
    avg_speed: Number(deriveAvgSpeed(data).toFixed(2)),
    peak_heart_bpm: Number(derivePeakHeartBpm(noodle).toFixed(0)),
    sync_ratio: Number(deriveSyncRatio(data).toFixed(2)),
    flow_drops: deriveFlowDrops(noodle),
    cadence_stability: Number(deriveCadenceStability(data).toFixed(2)),
    tempo_alignment_score: Number(deriveTempoAlignment(data).toFixed(2)),
  };
}

module.exports = {
  buildFeatureVector,
};
