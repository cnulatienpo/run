/**
 * Analytics helpers for summarising how a track influences noodle sessions.
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';

import { getTrack, ensureTrack, expandTrackMetadata } from '../db/mediaTracks.js';
import { listSnapshotFiles } from '../utils/snapshots.js';
import { extractTimelinePoints, groupTimelineByBucket, summariseTimeline } from '../utils/timeline.js';
import { getBackendRoot } from '../utils/paths.js';
import { logInfo } from '../log.js';
import { analyseBeatAlignment } from '../tools/beatAligner.js';

async function loadSnapshotBody(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === 'object' && parsed.body) {
    return parsed.body;
  }
  return parsed;
}

function filterSessionsByTrack(snapshots, trackId) {
  const sessions = [];
  snapshots.forEach((snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') {
      return;
    }
    const track = snapshot.media_track_id
      ?? snapshot.mediaTrackId
      ?? snapshot.media?.track_id
      ?? snapshot.data?.media_track_id;
    if (track && String(track) === String(trackId)) {
      sessions.push(snapshot);
    }
  });
  return sessions;
}

function average(values = []) {
  if (!values.length) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function computeAverageSpeedCurve(sessions, bucketSizeMs, bucketCountHint) {
  if (!sessions.length) {
    return [];
  }
  const bucketAggregates = [];
  const bucketCounts = [];
  sessions.forEach((session) => {
    const points = extractTimelinePoints(session);
    const buckets = groupTimelineByBucket(points, bucketSizeMs);
    buckets.forEach((bucket, index) => {
      if (!bucketAggregates[index]) {
        bucketAggregates[index] = 0;
        bucketCounts[index] = 0;
      }
      if (Number.isFinite(bucket.average_speed) && bucket.average_speed > 0) {
        bucketAggregates[index] += bucket.average_speed;
        bucketCounts[index] += 1;
      }
    });
  });
  const maxBuckets = bucketCountHint ?? bucketAggregates.length;
  return bucketAggregates.slice(0, maxBuckets).map((sum, index) => {
    const count = bucketCounts[index] || 0;
    return count > 0 ? Number((sum / count).toFixed(2)) : null;
  });
}

function computeAverageCadenceRatio(sessions, bpm) {
  if (!sessions.length || !Number.isFinite(bpm) || bpm <= 0) {
    return 0;
  }
  const ratios = sessions
    .map((session) => {
      const summary = summariseTimeline(extractTimelinePoints(session));
      if (!Number.isFinite(summary.average_cadence) || summary.average_cadence <= 0) {
        return null;
      }
      return summary.average_cadence / bpm;
    })
    .filter((value) => Number.isFinite(value));
  if (!ratios.length) {
    return 0;
  }
  return Number(average(ratios).toFixed(2));
}

function computeHeartRateBySegment(sessions, segments) {
  if (!sessions.length || !segments.length) {
    return {};
  }
  const totals = new Map();
  segments.forEach((segment) => {
    totals.set(segment.name, { heart: 0, count: 0 });
  });
  sessions.forEach((session) => {
    const points = extractTimelinePoints(session);
    segments.forEach((segment) => {
      const samples = points.filter((point) => point.t_ms >= segment.start_ms && point.t_ms <= segment.end_ms);
      const heartValues = samples.map((sample) => sample.heart_bpm).filter((value) => Number.isFinite(value));
      if (heartValues.length) {
        const sum = heartValues.reduce((acc, value) => acc + value, 0);
        const entry = totals.get(segment.name);
        entry.heart += sum / heartValues.length;
        entry.count += 1;
      }
    });
  });
  const result = {};
  totals.forEach((value, key) => {
    if (value.count > 0) {
      result[key] = Number((value.heart / value.count).toFixed(2));
    }
  });
  return result;
}

function computeHighEffortSections(averageSpeedCurve, bucketSizeMs) {
  if (!averageSpeedCurve.length) {
    return [];
  }
  const validSpeeds = averageSpeedCurve.filter((value) => Number.isFinite(value) && value !== null);
  if (!validSpeeds.length) {
    return [];
  }
  const threshold = validSpeeds.sort((a, b) => a - b)[Math.max(0, Math.floor(validSpeeds.length * 0.75) - 1)];
  const sections = [];
  let currentStart = null;
  averageSpeedCurve.forEach((value, index) => {
    if (value !== null && Number.isFinite(value) && value >= threshold) {
      if (currentStart === null) {
        currentStart = index * bucketSizeMs;
      }
    } else if (currentStart !== null) {
      sections.push([currentStart, index * bucketSizeMs]);
      currentStart = null;
    }
  });
  if (currentStart !== null) {
    sections.push([currentStart, averageSpeedCurve.length * bucketSizeMs]);
  }
  return sections;
}

function aggregateBeatAlignment(sessions, bpm) {
  if (!sessions.length || !Number.isFinite(bpm) || bpm <= 0) {
    return { mean_offset_ms: 0, sync_ratio: 0, optimal_shift_ms: 0 };
  }
  const metrics = sessions
    .map((session) => {
      const points = extractTimelinePoints(session);
      const timestamps = points.map((point) => point.t_ms);
      return analyseBeatAlignment(bpm, timestamps).beat_alignment;
    })
    .filter((entry) => entry && Number.isFinite(entry.sync_ratio));
  if (!metrics.length) {
    return { mean_offset_ms: 0, sync_ratio: 0, optimal_shift_ms: 0 };
  }
  const meanValue = (selector) => Number((metrics.reduce((acc, metric) => acc + metric[selector], 0) / metrics.length).toFixed(2));
  return {
    mean_offset_ms: meanValue('mean_offset_ms'),
    sync_ratio: meanValue('sync_ratio'),
    optimal_shift_ms: meanValue('optimal_shift_ms'),
  };
}

export async function buildTrackResponse(trackId, { outputFile = 'track_response.json' } = {}) {
  if (!trackId) {
    throw new Error('trackId is required to analyse track response');
  }

  await ensureTrack(trackId);
  const track = await getTrack(trackId);
  const expanded = expandTrackMetadata(track);

  const snapshotPaths = await listSnapshotFiles();
  const bodies = await Promise.all(snapshotPaths.map((filePath) => loadSnapshotBody(filePath).catch(() => undefined)));
  const sessions = filterSessionsByTrack(bodies.filter(Boolean), trackId);

  const lengthMs = Number(expanded?.length_ms) || 180000;
  const bucketCountHint = Array.isArray(expanded?.intensity_map) && expanded.intensity_map.length
    ? expanded.intensity_map.length
    : undefined;
  const bucketSizeMs = bucketCountHint ? Math.max(1000, Math.round(lengthMs / bucketCountHint)) : 10_000;

  const averageSpeedCurve = computeAverageSpeedCurve(sessions, bucketSizeMs, bucketCountHint);
  const averageCadenceVsBpm = computeAverageCadenceRatio(sessions, expanded?.bpm ?? track?.bpm ?? 0);
  const heartBySegment = computeHeartRateBySegment(sessions, expanded?.segments ?? []);
  const highEffortSections = computeHighEffortSections(averageSpeedCurve, bucketSizeMs);
  const beatAlignment = aggregateBeatAlignment(sessions, expanded?.bpm ?? track?.bpm ?? 0);

  const report = {
    track_id: String(trackId),
    average_speed_curve: averageSpeedCurve,
    average_cadence_vs_bpm: averageCadenceVsBpm,
    heart_bpm_per_segment: heartBySegment,
    high_effort_sections: highEffortSections,
    beat_alignment,
  };

  const outputPath = path.join(getBackendRoot(), 'analytics', outputFile);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  logInfo('ANALYTICS', 'Generated track response analytics', { trackId, outputPath });

  return report;
}

export default buildTrackResponse;
