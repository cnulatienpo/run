import defaultConfig from './effect-config.json' assert { type: 'json' };
import {
  initCanvas,
  triggerCanvasEffect,
  registerCanvasEffect,
  registerZone,
  getRegisteredZones,
  cancelActiveEffect,
} from './canvas-engine.js';

const DEFAULT_DURATION = 2400;
const DEFAULT_INTERVAL = [9000, 14000];

const effectTypeHandlers = new Map();

function sanitizeDuration(value, fallback = DEFAULT_DURATION) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function clampInterval(value) {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }
  const [min, max] = value;
  const start = Number.isFinite(min) && min >= 0 ? min : DEFAULT_INTERVAL[0];
  const end = Number.isFinite(max) && max >= start ? max : Math.max(start, DEFAULT_INTERVAL[1]);
  return [start, end];
}

function randomInRange([min, max]) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    return DEFAULT_INTERVAL[0];
  }
  const delta = max - min;
  return Math.floor(Math.random() * (delta + 1)) + min;
}

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

function resolveElement(target) {
  if (!target) {
    return document.body;
  }
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    return target;
  }
  if (typeof target === 'string') {
    return document.querySelector(target) || document.body;
  }
  return document.body;
}

function cssEffectHandler(event) {
  const { effect, className, duration, target } = event;
  const cssClass = (className || effect || '').trim();
  if (!cssClass) {
    console.warn('[effect-loader] Missing CSS class name for css effect event.');
    return () => {};
  }

  const element = resolveElement(target);
  const timeoutDuration = sanitizeDuration(duration);

  element.classList.add(cssClass);
  const timeoutId = window.setTimeout(() => {
    element.classList.remove(cssClass);
  }, timeoutDuration);

  return () => {
    window.clearTimeout(timeoutId);
    element.classList.remove(cssClass);
  };
}

function canvasEffectHandler(event) {
  const { effect, zone, duration, options } = event;
  if (!effect) {
    console.warn('[effect-loader] Missing effect name for canvas event.');
    return () => {};
  }

  initCanvas(options?.canvasOptions);
  return triggerCanvasEffect(effect, zone, sanitizeDuration(duration, DEFAULT_DURATION), options);
}

function applyRegisteredZones(configZones = {}) {
  Object.entries(configZones).forEach(([name, zoneSpec]) => {
    if (!name) {
      return;
    }
    try {
      registerZone(name, zoneSpec);
    } catch (error) {
      console.warn(`[effect-loader] Failed to register zone "${name}"`, error);
    }
  });
}

function resolveZoneSpec(zone, config) {
  if (!zone && config?.zones) {
    const defaultZones = Object.keys(config.zones);
    if (defaultZones.length > 0) {
      return pickRandom(defaultZones);
    }
  }
  if (typeof zone === 'string') {
    const knownZones = config?.zones || {};
    if (knownZones[zone]) {
      return { ...knownZones[zone], name: zone };
    }
  }
  return zone;
}

export function registerEffectType(type, handler) {
  if (typeof type !== 'string' || !type.trim()) {
    throw new Error('[effect-loader] Effect type name must be a non-empty string');
  }
  if (typeof handler !== 'function') {
    throw new Error('[effect-loader] Handler must be a function');
  }
  effectTypeHandlers.set(type.trim(), handler);
}

export function unregisterEffectType(type) {
  effectTypeHandlers.delete(type);
}

export function applyEffect(event) {
  if (!event || typeof event !== 'object') {
    console.warn('[effect-loader] Invalid effect event payload');
    return () => {};
  }

  const handler = effectTypeHandlers.get(event.type);
  if (typeof handler !== 'function') {
    console.warn(`[effect-loader] No handler registered for effect type "${event.type}"`);
    return () => {};
  }

  return handler(event);
}

if (!effectTypeHandlers.has('css')) {
  registerEffectType('css', cssEffectHandler);
}

if (!effectTypeHandlers.has('canvas')) {
  registerEffectType('canvas', canvasEffectHandler);
}

function resolveIntervalForMood(moodKey, config) {
  const moodConfig = config?.moods?.[moodKey] ?? {};
  const { interval, intervalMs, pace } = moodConfig;
  const { pacePresets, moodIntervals, interval: defaultInterval, intervalMs: topLevelInterval } = config ?? {};

  const fromMood = clampInterval(interval || intervalMs);
  if (fromMood) {
    return fromMood;
  }

  if (typeof pace === 'string' && pacePresets?.[pace]) {
    const preset = clampInterval(pacePresets[pace]);
    if (preset) {
      return preset;
    }
  }

  if (moodIntervals?.[moodKey]) {
    const fromMap = clampInterval(moodIntervals[moodKey]);
    if (fromMap) {
      return fromMap;
    }
  }

  const defaultRange = clampInterval(defaultInterval || topLevelInterval);
  if (defaultRange) {
    return defaultRange;
  }

  return DEFAULT_INTERVAL;
}

function prepareEventTemplate(effectTemplate, zone, config, moodKey) {
  if (!effectTemplate) {
    return null;
  }

  const resolved = { ...effectTemplate };
  resolved.mood = resolved.mood || moodKey;
  resolved.duration = sanitizeDuration(
    resolved.duration ?? config?.defaultDuration ?? DEFAULT_DURATION,
    DEFAULT_DURATION,
  );

  if (!resolved.zone && zone) {
    resolved.zone = zone;
  } else if (!resolved.zone) {
    resolved.zone = resolveZoneSpec(null, config);
  } else if (typeof resolved.zone === 'string') {
    resolved.zone = resolveZoneSpec(resolved.zone, config);
  }

  return resolved;
}

function resolveMoodKey(requestedMood, config) {
  if (requestedMood && config?.moods?.[requestedMood]) {
    return requestedMood;
  }
  const fallback = config?.defaultMood || Object.keys(config?.moods ?? {})[0];
  return fallback || null;
}

function pickEventForMood(moodKey, config) {
  const moodConfig = config?.moods?.[moodKey];
  if (!moodConfig) {
    return null;
  }

  const { effects, zones } = moodConfig;
  const effectTemplate = pickRandom(effects);
  if (!effectTemplate) {
    return null;
  }

  let chosenZone = null;
  if (Array.isArray(zones) && zones.length > 0) {
    const zoneTemplate = pickRandom(zones);
    if (typeof zoneTemplate === 'string') {
      chosenZone = resolveZoneSpec(zoneTemplate, config);
    } else if (zoneTemplate) {
      chosenZone = zoneTemplate;
    }
  }

  return prepareEventTemplate(effectTemplate, chosenZone, config, moodKey);
}

function registerConfig(config) {
  if (!config) {
    return;
  }
  if (config.zones) {
    applyRegisteredZones(config.zones);
  }
}

export function createEffectScheduler(config = defaultConfig, options = {}) {
  const normalizedConfig = config ?? {};
  registerConfig(normalizedConfig);

  let currentMood = resolveMoodKey(options.mood ?? normalizedConfig.defaultMood, normalizedConfig);
  let timeoutId = null;
  let activeCleanup = null;
  const listeners = new Set();

  function notify(event, cleanup) {
    listeners.forEach((listener) => {
      try {
        listener(event, cleanup);
      } catch (error) {
        console.error('[effect-loader] Listener failed', error);
      }
    });
  }

  function runEffect(event) {
    if (!event) {
      return null;
    }
    if (typeof activeCleanup === 'function') {
      activeCleanup();
      activeCleanup = null;
    }
    const cleanup = applyEffect(event);
    activeCleanup = cleanup;
    notify(event, cleanup);
    return event;
  }

  function scheduleNext() {
    window.clearTimeout(timeoutId);
    if (!currentMood) {
      return;
    }
    const intervalRange = resolveIntervalForMood(currentMood, normalizedConfig);
    const delay = randomInRange(intervalRange);
    timeoutId = window.setTimeout(() => {
      const event = pickEventForMood(currentMood, normalizedConfig);
      runEffect(event);
      scheduleNext();
    }, delay);
  }

  function start(nextMood = currentMood) {
    currentMood = resolveMoodKey(nextMood ?? currentMood, normalizedConfig);
    scheduleNext();
  }

  function stop() {
    window.clearTimeout(timeoutId);
    timeoutId = null;
    if (typeof activeCleanup === 'function') {
      activeCleanup();
      activeCleanup = null;
    }
    cancelActiveEffect();
  }

  function setMood(moodKey) {
    const resolved = resolveMoodKey(moodKey, normalizedConfig);
    if (resolved === currentMood) {
      return currentMood;
    }
    currentMood = resolved;
    scheduleNext();
    return currentMood;
  }

  function triggerOnce(overrides = {}) {
    const moodKey = resolveMoodKey(overrides.mood ?? currentMood, normalizedConfig);
    const baseEvent = pickEventForMood(moodKey, normalizedConfig);
    const mergedEvent = baseEvent ? { ...baseEvent, ...overrides } : overrides;
    return runEffect(mergedEvent);
  }

  function onEffect(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    start,
    stop,
    setMood,
    getMood: () => currentMood,
    triggerOnce,
    onEffect,
    getZones: () => getRegisteredZones(),
  };
}

export { registerCanvasEffect, registerZone };

export const __testUtils = {
  sanitizeDuration,
  clampInterval,
  resolveIntervalForMood,
  pickEventForMood,
  resolveMoodKey,
  resolveZoneSpec,
};

