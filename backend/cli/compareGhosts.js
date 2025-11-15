#!/usr/bin/env node
import { readFile, readdir } from 'fs/promises';
import path from 'path';

import { getGhostsDir } from '../utils/paths.js';

function parseArgs(argv) {
  const args = {};
  argv.slice(2).forEach((arg, index, array) => {
    if (arg === '--a') {
      args.a = array[index + 1];
    }
    if (arg === '--b') {
      args.b = array[index + 1];
    }
  });
  return args;
}

async function listGhostFiles() {
  const baseDir = getGhostsDir();
  try {
    const days = await readdir(baseDir);
    const files = [];
    for (const day of days) {
      const folder = path.join(baseDir, day);
      const entries = await readdir(folder);
      entries.forEach((entry) => files.push(path.join(folder, entry)));
    }
    return files;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function resolveGhost(identifier) {
  const candidatePath = path.isAbsolute(identifier)
    ? identifier
    : path.join(getGhostsDir(), identifier);
  try {
    const raw = await readFile(candidatePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    const files = await listGhostFiles();
    const match = files.find((file) => file.includes(identifier));
    if (!match) {
      throw new Error(`Unable to locate ghost recording for ${identifier}`);
    }
    const raw = await readFile(match, 'utf8');
    return JSON.parse(raw);
  }
}

function resolveSpeed(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }
  if (event.position && typeof event.position.speed === 'number') {
    return event.position.speed;
  }
  if (typeof event.stride === 'number') {
    return event.stride;
  }
  if (typeof event.velocity === 'number') {
    return event.velocity;
  }
  return null;
}

function resolveTime(event, index) {
  if (Number.isFinite(event?.t_ms)) {
    return Number(event.t_ms) / 1000;
  }
  if (Number.isFinite(event?.adjusted_t_ms)) {
    return Number(event.adjusted_t_ms) / 1000;
  }
  if (Number.isFinite(event?.received_at)) {
    const base = Number(event.received_at);
    return (base - Number(event.start_time ?? base)) / 1000;
  }
  return index;
}

function formatSpeed(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `${value.toFixed(2)} m/s`;
}

function compareGhosts(ghostA, ghostB) {
  const eventsA = Array.isArray(ghostA?.events) ? ghostA.events : [];
  const eventsB = Array.isArray(ghostB?.events) ? ghostB.events : [];
  const limit = Math.max(eventsA.length, eventsB.length);
  for (let index = 0; index < limit; index += 1) {
    const eventA = eventsA[index] ?? {};
    const eventB = eventsB[index] ?? {};
    const time = resolveTime(eventA, index) ?? resolveTime(eventB, index) ?? index;
    const speedA = resolveSpeed(eventA);
    const speedB = resolveSpeed(eventB);
    const divergence = (Number.isFinite(speedA) && Number.isFinite(speedB))
      ? Math.abs(speedA - speedB)
      : null;
    const divergenceLabel = divergence !== null && divergence > 0.5
      ? ` divergence > ${divergence.toFixed(2)} m/s`
      : '';
    console.log(`[t=${time.toFixed(1)}s] ghostA: ${formatSpeed(speedA)}   ghostB: ${formatSpeed(speedB)}${divergenceLabel}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.a || !args.b) {
    console.error('Usage: compareGhosts --a <ghostA> --b <ghostB>');
    process.exit(1);
  }
  try {
    const ghostA = await resolveGhost(args.a);
    const ghostB = await resolveGhost(args.b);
    compareGhosts(ghostA, ghostB);
  } catch (error) {
    console.error(`Failed to compare ghosts: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
