#!/usr/bin/env node
/**
 * CLI helper for appending semantic tags to media tracks.
 */

import process from 'process';

import { addTrackTags, ensureTrack } from '../db/mediaTracks.js';
import { logError, logInfo } from '../log.js';

async function run() {
  const args = process.argv.slice(2);
  const trackId = args[0];
  const tags = args.slice(1);
  if (!trackId || tags.length === 0) {
    console.error('Usage: node cli/tagTrack.js <track-id> <tag> [tag2 ...]');
    process.exitCode = 1;
    return;
  }

  try {
    await ensureTrack(trackId);
    const updated = await addTrackTags(trackId, tags);
    logInfo('CLI', 'Updated media track tags', { trackId, tags: updated.tags });
    console.log(JSON.stringify(updated, null, 2));
  } catch (error) {
    logError('CLI', 'Failed to update track tags', { trackId, message: error.message });
    process.exitCode = 1;
  }
}

run();
