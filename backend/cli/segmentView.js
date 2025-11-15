#!/usr/bin/env node
/**
 * Segment viewer utility highlighting effort and consistency across sections
 * of a noodle session.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import process from 'process';

import { ensureTrack, expandTrackMetadata, getTrack } from '../db/mediaTracks.js';
import { extractTimelinePoints, summariseTimeline } from '../utils/timeline.js';
import { logError, logInfo } from '../log.js';

function parseArgs(argv) {
  const options = { flag: undefined, trackId: undefined, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--flag=')) {
      options.flag = token.split('=')[1];
    } else if (token === '--flag') {
      options.flag = argv[i + 1];
      i += 1;
    } else if (token.startsWith('--track=')) {
      options.trackId = token.split('=')[1];
    } else if (token === '--track') {
      options.trackId = argv[i + 1];
      i += 1;
    } else if (token.startsWith('--')) {
      console.warn(`Unknown option ${token}`);
    } else {
      options.positional.push(token);
    }
  }
  return options;
}

async function loadSession(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const raw = await readFile(absolute, 'utf8');
  return JSON.parse(raw);
}

function resolveSegments(session, trackSegments) {
  if (Array.isArray(session?.segments)) {
    return session.segments;
  }
  if (Array.isArray(session?.data?.segments)) {
    return session.data.segments;
  }
  return trackSegments ?? [];
}

function normaliseSegment(segment) {
  if (!segment) {
    return undefined;
  }
  if (Array.isArray(segment)) {
    return { name: 'segment', start_ms: Number(segment[0]), end_ms: Number(segment[1]) };
  }
  const start = Number(segment.start_ms ?? segment.start ?? segment.begin_ms);
  const end = Number(segment.end_ms ?? segment.end ?? segment.finish_ms);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return undefined;
  }
  const name = segment.name || segment.label || segment.type || 'segment';
  return { name, start_ms: Math.round(start), end_ms: Math.round(end) };
}

function summariseSegment(points, segment) {
  const within = points.filter((point) => point.t_ms >= segment.start_ms && point.t_ms <= segment.end_ms);
  const summary = summariseTimeline(within);
  const effortScore = Number.isFinite(summary.average_speed) && Number.isFinite(summary.average_heart_bpm)
    ? Number(((summary.average_speed * 0.6) + (summary.average_heart_bpm / 200) * 0.4).toFixed(2))
    : 0;
  return {
    name: segment.name,
    duration_s: Number(((segment.end_ms - segment.start_ms) / 1000).toFixed(1)),
    average_speed: summary.average_speed,
    average_cadence: summary.average_cadence,
    average_heart_bpm: summary.average_heart_bpm,
    effort_score: effortScore,
  };
}

function printSegmentTable(segments, flagLabel) {
  if (!segments.length) {
    console.log('No segments defined for session.');
    return;
  }
  console.log('Segment | Duration(s) | Avg Speed | Avg Cadence | Avg Heart | Effort | Flags');
  console.log('--------|-------------|-----------|-------------|-----------|--------|-------');
  segments.forEach((segment) => {
    const flagColumn = flagLabel ? flagLabel : '';
    console.log(
      `${segment.name.padEnd(7)} | ${segment.duration_s.toFixed(1).padStart(11)} | ${segment.average_speed.toFixed(2).padStart(9)} | ${segment.average_cadence.toFixed(2).padStart(11)} | ${segment.average_heart_bpm.toFixed(1).padStart(9)} | ${segment.effort_score.toFixed(2).padStart(6)} | ${flagColumn}`,
    );
  });
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const filePath = options.positional[0];
  if (!filePath) {
    console.error('Usage: node cli/segmentView.js <session.json> [--track <track-id>] [--flag <label>]');
    process.exitCode = 1;
    return;
  }

  try {
    const session = await loadSession(filePath);
    const trackId = options.trackId
      ?? session.media_track_id
      ?? session.mediaTrackId
      ?? session.media?.track_id
      ?? session.data?.media_track_id;

    let trackSegments = [];
    if (trackId) {
      await ensureTrack(trackId);
      const track = await getTrack(trackId);
      const expanded = expandTrackMetadata(track);
      trackSegments = expanded?.segments ?? [];
    }

    const points = extractTimelinePoints(session);
    const rawSegments = resolveSegments(session, trackSegments);
    const normalised = rawSegments
      .map((segment) => normaliseSegment(segment))
      .filter(Boolean);

    const summaries = normalised.map((segment) => summariseSegment(points, segment));
    printSegmentTable(summaries, options.flag);
    logInfo('CLI', 'Displayed segment metrics', { segments: summaries.length });
  } catch (error) {
    logError('CLI', 'Failed to display segments', { message: error.message });
    process.exitCode = 1;
  }
}

run();
