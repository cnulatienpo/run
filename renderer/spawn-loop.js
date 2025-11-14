// Hallucination spawn loop: tag -> interval range -> scheduled effect.
// Timing lives here; visual application stays in filters.js.
import * as filters from '../effects/filters.js';
import effectMap from '../effects/effect-mapping.json' assert { type: 'json' };
import {
  logEffectTriggered as logEffectTriggeredEvent,
  logSessionEvent,
} from './tag-session-logger.js';

const DEFAULT_INTERVAL_RANGE = [10000, 15000];

let currentTag = null;
let spawnTimeoutId;
let effectDurationMs = 2000;

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

function randomInRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return DEFAULT_INTERVAL_RANGE[0];
  }
  if (max <= min) {
    return Math.max(min, 0);
  }
  const delta = max - min + 1;
  return Math.floor(Math.random() * delta) + min;
}

function getIntervalRangeForTag(tag) {
  const { intervals, intervalMs } = effectMap || {};
  if (intervals && Array.isArray(intervals[tag])) {
    const [min, max] = intervals[tag];
    return [Number(min) || DEFAULT_INTERVAL_RANGE[0], Number(max) || DEFAULT_INTERVAL_RANGE[1]];
  }
  if (Array.isArray(intervalMs)) {
    const [min, max] = intervalMs;
    return [Number(min) || DEFAULT_INTERVAL_RANGE[0], Number(max) || DEFAULT_INTERVAL_RANGE[1]];
  }
  return DEFAULT_INTERVAL_RANGE;
}

function resolveMoodForTag(tag) {
  const map = effectMap?.tagMoodMap ?? {};
  if (tag && typeof map[tag] === 'string') {
    return map[tag];
  }
  if (tag && effectMap?.moods?.[tag]) {
    return tag;
  }
  return effectMap?.defaultMood ?? Object.keys(effectMap?.moods ?? {})[0] ?? 'default';
}

function withZoneClip(canvas, zoneName) {
  if (!zoneName || typeof filters.withZoneClip !== 'function') {
    return () => {};
  }
  return filters.withZoneClip(canvas, zoneName) ?? (() => {});
}

function currentMoodKey() {
  return resolveMoodForTag(currentTag);
}

function triggerHallucinationEffect() {
  const canvas = document.getElementById('fx-canvas');
  if (!canvas) {
    return;
  }

  const moodKey = currentMoodKey();
  const availableEffects =
    effectMap?.moods?.[moodKey] ?? effectMap?.moods?.[effectMap?.defaultMood] ?? [];
  const availableZones =
    effectMap?.zones?.[moodKey] ?? effectMap?.zones?.[effectMap?.defaultMood] ?? [];
  const effectName = pickRandom(availableEffects);
  const zoneName = pickRandom(availableZones);

  if (!effectName) {
    console.warn('[spawn-loop] No effect available for mood:', moodKey);
    return;
  }

  const handler = filters?.[effectName];
  if (typeof handler !== 'function') {
    console.warn(`[spawn-loop] Effect "${effectName}" not found in filters.js`);
    return;
  }

  canvas.classList.add('fx-visible');
  const releaseClip = withZoneClip(canvas, zoneName);
  try {
    handler(canvas);
  } finally {
    window.setTimeout(() => {
      try {
        releaseClip();
        canvas.classList.remove('fx-visible');
      } catch (error) {
        console.warn('[spawn-loop] Failed to release clip region:', error);
      }
    }, effectDurationMs);
  }

  logEffectTriggeredEvent?.(effectName, moodKey, zoneName);
  logSessionEvent?.('effect-spawned', { effect: effectName, mood: moodKey, zone: zoneName });
}

function scheduleNextHallucination() {
  window.clearTimeout(spawnTimeoutId);
  if (!currentTag) {
    return;
  }
  const [minDelay, maxDelay] = getIntervalRangeForTag(currentTag);
  const delay = randomInRange(minDelay, maxDelay);
  spawnTimeoutId = window.setTimeout(() => {
    triggerHallucinationEffect();
    scheduleNextHallucination();
  }, delay);
}

export function setActiveTag(tag) {
  const nextTag = typeof tag === 'string' && tag.trim() ? tag.trim() : null;
  if (nextTag === currentTag) {
    return;
  }
  currentTag = nextTag;
  if (currentTag) {
    scheduleNextHallucination();
  } else {
    stopSpawnLoop();
  }
}

export function startSpawnLoop(options = {}) {
  const { tag, effectDuration = 2000 } = options;
  effectDurationMs = Number.isFinite(effectDuration) ? Math.max(0, effectDuration) : 2000;
  if (typeof tag === 'string' && tag.trim()) {
    currentTag = tag.trim();
  } else if (!currentTag) {
    currentTag = effectMap?.defaultMood ?? null;
  }
  if (currentTag) {
    scheduleNextHallucination();
  }
}

export function stopSpawnLoop() {
  window.clearTimeout(spawnTimeoutId);
  spawnTimeoutId = undefined;
}

export function setMood(moodKey) {
  setActiveTag(moodKey);
}

export function getCurrentMood() {
  return currentMoodKey();
}

export function getActiveTag() {
  return currentTag;
}

export function scheduleNextHallucinationImmediately() {
  triggerHallucinationEffect();
  scheduleNextHallucination();
}
