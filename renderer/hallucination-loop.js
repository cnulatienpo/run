import { softPulse } from '../effects/filters.js';

const MOOD_INTERVALS = {
  dreamcore: [5000, 9000],
  ambient: [12000, 18000],
  hype: [2500, 5000],
  rare: [30000, 45000],
  default: [8000, 12000],
};

let currentMood = 'dreamcore';
let hallucinationTimer = null;

function getIntervalForMood(mood) {
  const [min, max] = MOOD_INTERVALS[mood] || MOOD_INTERVALS.default;
  if (max <= min) {
    return min;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function triggerHallucinationEffect() {
  const canvasEl = document.getElementById('fx-overlay');
  if (!canvasEl) {
    return;
  }

  softPulse(canvasEl);
  console.log(`[FX] Hallucination fired from mood: ${currentMood}`);
}

function scheduleNextHallucination() {
  window.clearTimeout(hallucinationTimer);

  const interval = getIntervalForMood(currentMood);
  hallucinationTimer = window.setTimeout(() => {
    triggerHallucinationEffect();
    scheduleNextHallucination();
  }, interval);
}

export function startHallucinationLoop(options = {}) {
  if (options.mood && typeof options.mood === 'string') {
    currentMood = options.mood;
  }
  scheduleNextHallucination();
}

export function setMood(mood) {
  if (typeof mood === 'string' && mood) {
    currentMood = mood;
    scheduleNextHallucination();
  }
}

export function stopHallucinationLoop() {
  window.clearTimeout(hallucinationTimer);
  hallucinationTimer = null;
}

export function getCurrentMood() {
  return currentMood;
}
