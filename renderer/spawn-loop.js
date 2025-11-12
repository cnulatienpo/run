// 1. Import the filter effects
import * as filters from '../effects/filters.js';

// 2. Load the effect map config
import effectMap from '../effects/effect-mapping.json' assert { type: 'json' };

// 3. Define mood pacing and global state
const MOOD_INTERVALS = {
  dreamcore: [5000, 9000],
  ambient: [12000, 18000],
  hype: [2500, 5000],
  rare: [30000, 45000],
};

const MOOD_STORAGE_KEY = 'selectedMood';

let currentMood = getInitialMood();
let spawnTimer = null;

function getInitialMood() {
  const storedMood = readStoredMood();
  if (storedMood && effectMap.moods?.[storedMood]) {
    return storedMood;
  }

  const defaultMood = effectMap.defaultMood;
  if (defaultMood && effectMap.moods?.[defaultMood]) {
    return defaultMood;
  }

  const firstMood = Object.keys(effectMap.moods || {})[0];
  if (firstMood) {
    return firstMood;
  }

  return 'dreamcore';
}

function readStoredMood() {
  try {
    return window?.localStorage?.getItem(MOOD_STORAGE_KEY) ?? null;
  } catch (error) {
    console.warn('[spawn-loop] Unable to read stored mood:', error);
    return null;
  }
}

function persistMood(mood) {
  try {
    window?.localStorage?.setItem(MOOD_STORAGE_KEY, mood);
  } catch (error) {
    console.warn('[spawn-loop] Unable to persist mood:', error);
  }
}

// 4. Utility: Get a random item from an array
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 5. Get next interval based on mood pacing
function getNextInterval() {
  const [min, max] = MOOD_INTERVALS[currentMood] || [8000, 12000];
  if (max <= min) {
    return min;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 6. Main spawn function
function spawnHallucination() {
  const canvasEl = document.getElementById('fx-canvas');
  if (!canvasEl) return;

  // Pick random effect and zone from mood map
  const effects = effectMap.moods?.[currentMood] || ['softPulse'];
  const zones = effectMap.zones?.[currentMood] || ['center'];
  const fxName = pickRandom(effects);
  const zone = pickRandom(zones);

  // Apply zone clip
  const clipOff = filters.withZoneClip(canvasEl, zone);

  // Trigger effect
  if (filters[fxName]) {
    filters[fxName](canvasEl);
  }

  // Remove clip after effect finishes
  setTimeout(clipOff, 2200);
}

// 7. Spawn loop controller
function scheduleNextSpawn() {
  clearTimeout(spawnTimer);
  const next = getNextInterval();
  spawnTimer = setTimeout(() => {
    spawnHallucination();
    scheduleNextSpawn();
  }, next);
}

// 8. Public API
export function setMood(newMood) {
  if (!effectMap.moods?.[newMood]) {
    return;
  }

  currentMood = newMood;
  persistMood(newMood);
  scheduleNextSpawn();
}

export function startSpawnLoop() {
  scheduleNextSpawn();
}

export function getCurrentMood() {
  return currentMood;
}

export function stopSpawnLoop() {
  clearTimeout(spawnTimer);
  spawnTimer = null;
}
