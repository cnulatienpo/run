/**
 * Utilities for extracting time-series metrics from noodle payloads.
 */

function normaliseNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function resolveTime(point = {}) {
  if (point.t_ms !== undefined) {
    return normaliseNumber(point.t_ms);
  }
  if (point.time_ms !== undefined) {
    return normaliseNumber(point.time_ms);
  }
  if (point.t !== undefined) {
    return normaliseNumber(point.t);
  }
  if (point.time !== undefined) {
    const asNumber = Number(point.time);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }
    const parsed = new Date(point.time);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }
  return undefined;
}

function resolveMetric(point = {}, keys = []) {
  for (const key of keys) {
    if (point[key] !== undefined) {
      const numeric = normaliseNumber(point[key]);
      if (numeric !== undefined) {
        return numeric;
      }
    }
  }
  return undefined;
}

function extractFromTimelineArray(entries = []) {
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return undefined;
      }
      const tMs = resolveTime(entry);
      if (tMs === undefined) {
        return undefined;
      }
      return {
        t_ms: tMs,
        speed: resolveMetric(entry, ['speed', 'speed_mps', 'velocity']),
        cadence: resolveMetric(entry, ['cadence', 'steps_per_min', 'rpm']),
        heart_bpm: resolveMetric(entry, ['heart_bpm', 'heartRate', 'hr']),
        stride_length: resolveMetric(entry, ['stride_length', 'stride', 'strideLen']),
        note: typeof entry.note === 'string' ? entry.note : undefined,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.t_ms - b.t_ms);
}

function mergeEventNotes(points, notes = []) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return points;
  }
  const merged = points.map((point) => ({ ...point }));
  notes.forEach((note) => {
    if (!note || typeof note !== 'object') {
      return;
    }
    const tMs = normaliseNumber(note.t_ms ?? note.time_ms ?? note.offset_ms);
    if (tMs === undefined) {
      return;
    }
    const target = merged.reduce((closest, current) => {
      const currentDelta = Math.abs(current.t_ms - tMs);
      if (!closest) {
        return currentDelta <= 250 ? current : undefined;
      }
      const closestDelta = Math.abs(closest.t_ms - tMs);
      if (currentDelta < closestDelta) {
        return currentDelta <= 250 ? current : closest;
      }
      return closest;
    }, undefined);
    if (target) {
      const prefix = target.note ? `${target.note}; ` : '';
      target.note = `${prefix}[cue: ${note.note ?? note.cue ?? 'cue'}]`;
    } else {
      merged.push({
        t_ms: Math.round(tMs),
        speed: undefined,
        cadence: undefined,
        heart_bpm: undefined,
        stride_length: undefined,
        note: `[cue: ${note.note ?? note.cue ?? 'cue'}]`,
      });
    }
  });
  return merged.sort((a, b) => a.t_ms - b.t_ms);
}

function extractFromEvents(events = []) {
  const timeline = [];
  events.forEach((event) => {
    if (!event || typeof event !== 'object') {
      return;
    }
    const metadata = event.metadata || {};
    const tMs = normaliseNumber(metadata.t_ms ?? metadata.offset_ms ?? metadata.time_ms);
    if (tMs === undefined) {
      return;
    }
    const speed = resolveMetric(metadata, ['speed', 'speed_mps', 'velocity']);
    const cadence = resolveMetric(metadata, ['cadence', 'steps_per_min', 'rpm']);
    const heart = resolveMetric(metadata, ['heart_bpm', 'heartRate', 'hr']);
    const stride = resolveMetric(metadata, ['stride_length', 'stride', 'strideLen']);
    const note = typeof metadata.note === 'string' ? metadata.note : undefined;
    if ([speed, cadence, heart, stride, note].every((value) => value === undefined)) {
      return;
    }
    timeline.push({ t_ms: tMs, speed, cadence, heart_bpm: heart, stride_length: stride, note });
  });
  return timeline.sort((a, b) => a.t_ms - b.t_ms);
}

export function extractTimelinePoints(noodle = {}) {
  if (!noodle || typeof noodle !== 'object') {
    return [];
  }
  const data = noodle.data || {};
  const possibleTimeline = Array.isArray(noodle.timeline)
    ? noodle.timeline
    : Array.isArray(data.timeline)
      ? data.timeline
      : undefined;

  let points = [];
  if (possibleTimeline) {
    points = extractFromTimelineArray(possibleTimeline);
  }
  if (!points.length && Array.isArray(data.samples)) {
    points = extractFromTimelineArray(data.samples);
  }
  if (!points.length && Array.isArray(noodle.events)) {
    points = extractFromEvents(noodle.events);
  }
  if (!points.length && Array.isArray(data.events)) {
    points = extractFromEvents(data.events);
  }

  if (Array.isArray(noodle.event_notes)) {
    points = mergeEventNotes(points, noodle.event_notes);
  }

  return points.sort((a, b) => a.t_ms - b.t_ms);
}

export function summariseTimeline(points = []) {
  if (!Array.isArray(points) || points.length === 0) {
    return {
      duration_ms: 0,
      average_speed: 0,
      average_cadence: 0,
      average_heart_bpm: 0,
    };
  }
  const duration = points[points.length - 1].t_ms - points[0].t_ms;
  const speedValues = points.map((point) => point.speed).filter((value) => Number.isFinite(value));
  const cadenceValues = points.map((point) => point.cadence).filter((value) => Number.isFinite(value));
  const heartValues = points.map((point) => point.heart_bpm).filter((value) => Number.isFinite(value));
  const mean = (values) => {
    if (!values.length) {
      return 0;
    }
    const sum = values.reduce((acc, value) => acc + value, 0);
    return sum / values.length;
  };
  return {
    duration_ms: Math.max(0, Math.round(duration)),
    average_speed: Number(mean(speedValues).toFixed(2)),
    average_cadence: Number(mean(cadenceValues).toFixed(2)),
    average_heart_bpm: Number(mean(heartValues).toFixed(2)),
  };
}

export function groupTimelineByBucket(points = [], bucketSizeMs = 10_000) {
  if (!Array.isArray(points) || points.length === 0 || bucketSizeMs <= 0) {
    return [];
  }
  const buckets = new Map();
  points.forEach((point) => {
    const bucketIndex = Math.floor(point.t_ms / bucketSizeMs);
    if (!buckets.has(bucketIndex)) {
      buckets.set(bucketIndex, []);
    }
    buckets.get(bucketIndex).push(point);
  });
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, bucketPoints]) => {
      const summary = summariseTimeline(bucketPoints);
      return {
        bucket_index: index,
        start_ms: index * bucketSizeMs,
        end_ms: (index + 1) * bucketSizeMs,
        average_speed: summary.average_speed,
        average_cadence: summary.average_cadence,
        average_heart_bpm: summary.average_heart_bpm,
      };
    });
}

export function findNearestPoint(points = [], targetMs, toleranceMs = 500) {
  if (!Array.isArray(points) || points.length === 0) {
    return undefined;
  }
  let best;
  let bestDelta = Infinity;
  points.forEach((point) => {
    const delta = Math.abs(point.t_ms - targetMs);
    if (delta <= toleranceMs && delta < bestDelta) {
      best = point;
      bestDelta = delta;
    }
  });
  return best;
}
