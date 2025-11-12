// 1. Import the filter effects
import * as filters from '../effects/filters.js';

// 2. Load the effect map config
import effectMap from '../effects/effect-mapping.json' assert { type: 'json' };

// 3. Define global state
const EFFECT_DURATIONS = {
  softPulse: 2200,
  scanline: 1600,
};

let currentMood = effectMap.defaultMood || 'dreamlike';
let spawnTimer = null;
let isRunning = false;
let lastUnknownMood = null;

// 4. Utility: Get a random item from an array
function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return undefined;
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

// 5. Get next interval based on mood pacing
function getNextInterval() {
  const range = getIntervalRange(currentMood) || getIntervalRange(effectMap.defaultMood);
  const min = range?.min ?? 8000;
  const max = range?.max ?? 16000;
  const span = Math.max(0, max - min);
  return Math.floor(Math.random() * (span + 1)) + min;
}

function getIntervalRange(mood) {
  if (!mood) return undefined;

  const moodEntry = effectMap.moods?.[mood];
  const pacingCandidates = [
    effectMap.pacing?.[mood],
    effectMap.intervalMsByMood?.[mood],
    moodEntry?.intervalMs,
    moodEntry?.interval,
    Array.isArray(moodEntry?.pacing) ? moodEntry?.pacing : undefined,
  ];

  for (const candidate of pacingCandidates) {
    const range = normaliseInterval(candidate);
    if (range) return range;
  }

  return normaliseInterval(effectMap.intervalMs);
}

function normaliseInterval(value) {
  if (!value) return undefined;

  if (Array.isArray(value) && value.length >= 2) {
    const [min, max] = value;
    return coerceInterval(min, max);
  }

  if (typeof value === 'object') {
    const min = value.min ?? value.start;
    const max = value.max ?? value.end;
    if (min !== undefined && max !== undefined) {
      return coerceInterval(min, max);
    }
  }

  return undefined;
}

function coerceInterval(min, max) {
  const minMs = Number(min);
  const maxMs = Number(max);
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    return undefined;
  }
  const safeMin = Math.max(0, Math.min(minMs, maxMs));
  const safeMax = Math.max(safeMin, Math.max(minMs, maxMs));
  return { min: safeMin, max: safeMax };
}

function resolveEffects(mood) {
  if (!mood) return undefined;
  const entry = effectMap.moods?.[mood];
  if (Array.isArray(entry)) {
    return entry;
  }
  if (entry && Array.isArray(entry.effects)) {
    return entry.effects;
  }
  return undefined;
}

function resolveZones(mood) {
  if (!mood) return undefined;
  const zonesEntry = effectMap.zones?.[mood];
  if (Array.isArray(zonesEntry)) {
    return zonesEntry;
  }
  if (zonesEntry && Array.isArray(zonesEntry.options)) {
    return zonesEntry.options;
  }
  const moodEntry = effectMap.moods?.[mood];
  if (moodEntry && Array.isArray(moodEntry.zones)) {
    return moodEntry.zones;
  }
  return undefined;
}

// 6. Main spawn function
function spawnHallucination() {
  const canvasEl = document.getElementById('fx-canvas');
  if (!canvasEl) return;

  // Pick random effect and zone from mood map
  const fallbackEffects = resolveEffects(effectMap.defaultMood) || ['softPulse'];
  const fallbackZones = resolveZones(effectMap.defaultMood) || ['center'];
  const effects = resolveEffects(currentMood) || fallbackEffects;
  const zones = resolveZones(currentMood) || fallbackZones;
  const fxName = pickRandom(effects) ?? pickRandom(fallbackEffects) ?? 'softPulse';
  const zone = pickRandom(zones) ?? pickRandom(fallbackZones) ?? 'center';

  // Apply zone clip
  const clipOff =
    typeof filters.withZoneClip === 'function' ? filters.withZoneClip(canvasEl, zone) : () => {};

  // Trigger effect
  const handler = filters[fxName];
  const duration = EFFECT_DURATIONS[fxName] ?? 2200;

  if (typeof handler === 'function') {
    try {
      handler(canvasEl, duration);
      setTimeout(clipOff, duration);
    } catch (error) {
      console.error(`[spawn-loop] Failed to run effect "${fxName}":`, error);
      clipOff();
    }
  } else {
    console.warn(`[spawn-loop] Unknown effect handler: ${fxName}`);
    clipOff();
  }
}

// 7. Spawn loop controller
function scheduleNextSpawn() {
  if (!isRunning) {
    return;
  }

  clearTimeout(spawnTimer);
  const next = getNextInterval();
  spawnTimer = setTimeout(() => {
    spawnHallucination();
    scheduleNextSpawn();
  }, next);
}

// 8. Public API
export function setMood(newMood) {
  const hasMood = Boolean(effectMap.moods?.[newMood]);
  const fallbackMood = effectMap.defaultMood || currentMood;
  const nextMood = hasMood ? newMood : fallbackMood;

  if (!hasMood && newMood) {
    if (lastUnknownMood !== newMood) {
      console.warn(
        `[spawn-loop] Unknown mood "${newMood}" – reverting to "${fallbackMood}" instead.`
      );
      lastUnknownMood = newMood;
    }
  } else {
    lastUnknownMood = null;
  }

  if (nextMood !== currentMood) {
    currentMood = nextMood;
    if (isRunning) {
      scheduleNextSpawn();
    }
  }

  return currentMood;
}

export function startSpawnLoop({ immediate = false } = {}) {
  if (isRunning) {
    if (immediate) {
      spawnHallucination();
    }
    scheduleNextSpawn();
    return;
  }

  isRunning = true;
  if (immediate) {
    spawnHallucination();
  }
  scheduleNextSpawn();
}

export function stopSpawnLoop() {
  isRunning = false;
  clearTimeout(spawnTimer);
  spawnTimer = null;
}
