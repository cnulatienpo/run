/**
 * Beat alignment helpers used to evaluate how well session events follow the
 * rhythm of an accompanying media track.
 */

function normaliseTimes(timestamps = []) {
  if (!Array.isArray(timestamps)) {
    return [];
  }
  return timestamps
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

function computeOffsets(times, beatInterval, shift = 0) {
  return times.map((time) => {
    const shifted = time + shift;
    const modulo = ((shifted % beatInterval) + beatInterval) % beatInterval;
    const distance = modulo <= beatInterval / 2 ? modulo : modulo - beatInterval;
    return distance;
  });
}

function mean(values = []) {
  if (!values.length) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function ratioWithin(values = [], tolerance = 100) {
  if (!values.length) {
    return 0;
  }
  const hits = values.filter((value) => Math.abs(value) <= tolerance).length;
  return hits / values.length;
}

function searchOptimalShift(times, beatInterval, tolerance, searchWindow) {
  if (!times.length) {
    return 0;
  }
  const step = Math.max(5, Math.round(tolerance / 2));
  let bestShift = 0;
  let bestRatio = 0;
  for (let shift = -searchWindow; shift <= searchWindow; shift += step) {
    const offsets = computeOffsets(times, beatInterval, shift);
    const ratio = ratioWithin(offsets, tolerance);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestShift = shift;
    }
  }
  return bestShift;
}

/**
 * Computes beat alignment metrics for a set of event timestamps.
 *
 * @param {number} bpm Track beats per minute.
 * @param {Array<number>} timestamps Session timestamps in milliseconds.
 * @param {{ toleranceMs?: number, searchWindowMs?: number }} [options] Configuration options.
 * @returns {{
 *   beat_alignment: {
 *     mean_offset_ms: number,
 *     sync_ratio: number,
 *     optimal_shift_ms: number,
 *   }
 * }} Beat alignment descriptor.
 */
export function analyseBeatAlignment(bpm, timestamps, { toleranceMs = 100, searchWindowMs = 600 } = {}) {
  const times = normaliseTimes(timestamps);
  if (!Number.isFinite(bpm) || bpm <= 0 || !times.length) {
    return {
      beat_alignment: {
        mean_offset_ms: 0,
        sync_ratio: 0,
        optimal_shift_ms: 0,
      },
    };
  }

  const beatInterval = 60000 / bpm;
  const offsets = computeOffsets(times, beatInterval, 0);
  const meanOffset = Number(mean(offsets).toFixed(2));
  const syncRatio = Number(ratioWithin(offsets, toleranceMs).toFixed(2));
  const optimalShift = searchOptimalShift(times, beatInterval, toleranceMs, searchWindowMs);

  return {
    beat_alignment: {
      mean_offset_ms: meanOffset,
      sync_ratio: syncRatio,
      optimal_shift_ms: Number(optimalShift.toFixed(2)),
    },
  };
}

export default analyseBeatAlignment;
