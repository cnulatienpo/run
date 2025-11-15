#!/usr/bin/env node
/**
 * CLI utility aggregating how a media track is used across sessions.
 */

import process from 'process';

import { buildTrackResponse } from '../analytics/trackResponse.js';
import { logError, logInfo } from '../log.js';

async function run() {
  const args = process.argv.slice(2);
  const trackId = args[0];
  if (!trackId) {
    console.error('Usage: node cli/analyzeTrackUse.js <track-id>');
    process.exitCode = 1;
    return;
  }

  try {
    const report = await buildTrackResponse(trackId);
    logInfo('CLI', 'Track usage analytics generated', { trackId });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    logError('CLI', 'Failed to analyse track usage', { trackId, message: error.message });
    process.exitCode = 1;
  }
}

run();
