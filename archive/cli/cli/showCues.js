#!/usr/bin/env node
/**
 * Displays how media cues align with session performance metrics.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import process from 'process';

import { getTrack, ensureTrack, expandTrackMetadata } from '../db/mediaTracks.js';
import { extractTimelinePoints, findNearestPoint, summariseTimeline } from '../utils/timeline.js';
import { generateMediaCues } from '../tools/mediaCueGen.js';
import { logError, logInfo } from '../log.js';

async function loadSession(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const raw = await readFile(absolute, 'utf8');
  return JSON.parse(raw);
}

function resolveTrackId(session, fallbackId) {
  return fallbackId
    ?? session.media_track_id
    ?? session.mediaTrackId
    ?? session.media?.track_id
    ?? session.data?.media_track_id;
}

function describeCue(cue, point, track, baseline) {
  if (!point) {
    return 'no movement data';
  }
  const notes = [];
  const bpm = Number(track?.bpm);
  if (Number.isFinite(point.cadence) && Number.isFinite(bpm)) {
    const delta = Math.abs(point.cadence - bpm);
    if (delta <= 5) {
      notes.push('cadence matched');
    } else if (point.cadence > bpm) {
      notes.push('user sped up');
    } else {
      notes.push('user slowed down');
    }
  }
  if (Number.isFinite(point.speed) && baseline && Number.isFinite(baseline.average_speed)) {
    if (point.speed >= baseline.average_speed * 1.2) {
      notes.push('high effort');
    } else if (point.speed <= baseline.average_speed * 0.6) {
      notes.push('movement paused');
    }
  }
  if (!notes.length) {
    notes.push('steady');
  }
  return notes.join(' | ');
}

async function run() {
  const args = process.argv.slice(2);
  const filePath = args[0];
  const providedTrackId = args[1];
  if (!filePath) {
    console.error('Usage: node cli/showCues.js <session.json> [track-id]');
    process.exitCode = 1;
    return;
  }

  try {
    const session = await loadSession(filePath);
    const trackId = resolveTrackId(session, providedTrackId);
    if (!trackId) {
      throw new Error('Unable to determine track id for session');
    }
    await ensureTrack(trackId);
    const track = await getTrack(trackId);
    const expanded = expandTrackMetadata(track);

    const timeline = extractTimelinePoints(session);
    const baseline = summariseTimeline(timeline);
    const cues = Array.isArray(expanded?.cues) && expanded.cues.length
      ? expanded.cues
      : generateMediaCues(expanded ?? track ?? {});

    console.log(`Track ${trackId} | BPM: ${expanded?.bpm ?? 'n/a'} | cues: ${cues.length}`);
    cues.forEach((cue) => {
      const point = findNearestPoint(timeline, cue.t_ms, 500);
      const descriptor = describeCue(cue, point, expanded, baseline);
      const cadence = point && Number.isFinite(point.cadence) ? `cadence=${point.cadence.toFixed(1)}` : '';
      const speed = point && Number.isFinite(point.speed) ? `speed=${point.speed.toFixed(2)}` : '';
      const metrics = [cadence, speed].filter(Boolean).join(' ');
      console.log(`[t=${(cue.t_ms / 1000).toFixed(1)}s] cue: ${cue.cue}   | ${descriptor}${metrics ? ` | ${metrics}` : ''}`);
    });
    logInfo('CLI', 'Displayed cue alignment', { trackId, cues: cues.length });
  } catch (error) {
    logError('CLI', 'Failed to display cue alignment', { message: error.message });
    process.exitCode = 1;
  }
}

run();
