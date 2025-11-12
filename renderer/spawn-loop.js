// 1. Import the filter effects
import * as filters from '../effects/filters.js';

// 2. Load the effect map config
import effectMap from '../effects/effect-mapping.json' assert { type: 'json' };

// 3. Define global state
let currentMood = effectMap.defaultMood || 'dreamlike';
let spawnTimer = null;

// 4. Utility: Get a random item from an array
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 5. Get next interval based on mood pacing
function getNextInterval() {
  const [min, max] = [
    effectMap.intervalMs?.min || 8000,
    effectMap.intervalMs?.max || 16000
  ];
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
  if (effectMap.moods?.[newMood]) {
    currentMood = newMood;
    scheduleNextSpawn();
  }
}

export function startSpawnLoop() {
  scheduleNextSpawn();
}
