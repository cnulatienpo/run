#!/usr/bin/env node
/**
 * CLI helper that prints the metadata stored for a given media track.
 */

import process from 'process';

import { expandTrackMetadata, getTrack, getMediaTracksFilePath } from '../db/mediaTracks.js';
import { logError, logInfo } from '../log.js';

async function run() {
  const args = process.argv.slice(2);
  const trackId = args[0];
  if (!trackId) {
    console.error('Usage: node cli/inspectTrack.js <track-id>');
    process.exitCode = 1;
    return;
  }

  try {
    const track = await getTrack(trackId);
    if (!track) {
      logError('CLI', 'Track not found in registry', { trackId, registry: getMediaTracksFilePath() });
      process.exitCode = 1;
      return;
    }
    const expanded = expandTrackMetadata(track);
    logInfo('CLI', 'Media track metadata', expanded);
    console.log(JSON.stringify(expanded, null, 2));
  } catch (error) {
    logError('CLI', 'Failed to inspect track', { message: error.message, trackId });
    process.exitCode = 1;
  }
}

run();
