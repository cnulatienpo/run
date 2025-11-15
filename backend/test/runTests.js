#!/usr/bin/env node
/**
 * Minimal test harness for backend modules.
 */

import assert from 'assert';
import { rm } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { syntheticPass } from '../syntheticPass.js';
import { buildNoodle } from '../utils/buildNoodle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tempMediaIndexPath = path.join(__dirname, '.tmp-media-index.json');
process.env.MEDIA_INDEX_PATH = tempMediaIndexPath;

const mediaModule = await import('../db/mediaIndex.js');
const { recordMediaSession, loadMediaIndex } = mediaModule;

/**
 * Removes temporary media index files created during tests.
 */
async function cleanup() {
  await rm(tempMediaIndexPath, { force: true });
}

/**
 * Verifies that the synthetic pass honours anonymisation profiles and
 * adds the synthetic watermark.
 */
async function testSyntheticPassProfiles() {
  const noodle = buildNoodle({
    data: {
      heartRate: 72,
      steps: 1500,
    },
    events: [],
    synthetic: false,
  });

  const synthetic = await syntheticPass(noodle, { anonymizationProfile: 'strong' });
  assert.strictEqual(synthetic.anonymization_profile, 'strong');
  assert.ok(synthetic._synthetic_hash.length >= 8, 'Synthetic hash should be present');
  assert.strictEqual(synthetic.synthetic, true);
}

/**
 * Ensures the media index aggregates session data incrementally.
 */
async function testMediaIndexAverages() {
  await cleanup();
  await recordMediaSession({ trackId: 'track-1', heartRate: 100, speed: 4 });
  await recordMediaSession({ trackId: 'track-1', heartRate: 80, speed: 6 });
  const index = await loadMediaIndex();
  const entry = index['track-1'];
  assert.ok(entry, 'Media index entry should exist');
  assert.strictEqual(entry.number_of_sessions, 2);
  assert.ok(Math.abs(entry.avg_heart_rate - 90) < 0.1, 'Average heart rate should be around 90');
  assert.ok(Math.abs(entry.avg_speed - 5) < 0.1, 'Average speed should be around 5');
}

try {
  await testSyntheticPassProfiles();
  await testMediaIndexAverages();
  await cleanup();
  console.log('All tests passed');
} catch (error) {
  console.error('Test failure', error);
  await cleanup();
  process.exitCode = 1;
}
