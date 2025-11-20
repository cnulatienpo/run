/**
 * ============================================================
 *  EFFECTS / HARDWARE MODULE – PROJECT MAP
 * ------------------------------------------------------------
 *  Role:
 *    - Provides visual FX, audio FX, or hardware integrations
 *      used by the HUD (renderer/).
 *
 *  Used By:
 *    - renderer/renderer.js
 *    - HUD overlays (FX engine)
 *    - Hardware step bridge (step-bridge/)
 *
 *  Notes:
 *    - Module is standalone, no bundler.
 *    - Loaded directly by renderer via static scripts.
 * ============================================================
 */

import defaultConfig from './effect-config.json' assert { type: 'json' };
import {
  initCanvas,
  triggerCanvasEffect,
  registerCanvasEffect,
  registerZone,
  getRegisteredZones,
  cancelActiveEffect,
} from './canvas-engine.js';
import { logEffectEvent } from './effect-session-log.js';

const DEFAULT_DURATION = 2400;
const DEFAULT_INTERVAL = [9000, 14000];

const effectTypeHandlers = new Map();
const pluginRegistry = new Map();

function createPluginApi(name) {
  return Object.freeze({
    registerCanvasEffect,
    registerEffectType,
    registerZone,
    getRegisteredZones,
    cancelActiveEffect,
    log: (type, data) => logEffectEvent(`plugin:${name}:${type}`, data),
  });
}

async function resolvePluginModule(loader) {
  if (typeof loader === 'function') {
    return loader();
  }
  if (typeof loader === 'string') {
    return import(/* @vite-ignore */ loader);
  }
  throw new Error('[effect-loader] Plugin loader must be a string path or function returning a module');
}

function normalisePluginRecord(name, plugin, cleanup) {
  const record = {
    name,
    plugin,
    cleanup: typeof cleanup === 'function' ? cleanup : null,
  };
  pluginRegistry.set(name, record);
  return record;
}

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
  const { effect, className, duration, target, intensity } = event;
  const baseClass = (className || effect || '').trim();
  if (!baseClass) {
    console.warn('[effect-loader] Missing CSS class name for css effect event.');
    return () => {};
  }

  const element = resolveElement(target);
  const timeoutDuration = sanitizeDuration(duration);
  const normalizedIntensity = typeof intensity === 'string' ? intensity.trim() : '';

  const classes = new Set();
  baseClass
    .split(/\s+/)
    .filter(Boolean)
    .forEach((cls) => classes.add(cls));

  if (!className && normalizedIntensity && !baseClass.includes(' ')) {
    classes.add(`${baseClass}-${normalizedIntensity}`);
  }

  const classList = Array.from(classes);
  element.classList.add(...classList);
  const timeoutId = window.setTimeout(() => {
    classList.forEach((cls) => element.classList.remove(cls));
  }, timeoutDuration);

  return () => {
    window.clearTimeout(timeoutId);
    classList.forEach((cls) => element.classList.remove(cls));
  };
}

function canvasEffectHandler(event) {
  const { effect, zone, duration, options } = event;
  if (!effect) {
    console.warn('[effect-loader] Missing effect name for canvas event.');
    return () => {};
  }

  const normalizedOptions =
    options && typeof options === 'object'
      ? { ...options }
      : {};

  if (event.intensity !== undefined && normalizedOptions.intensity === undefined) {
    normalizedOptions.intensity = event.intensity;
  }

  initCanvas(normalizedOptions?.canvasOptions);
  return triggerCanvasEffect(
    effect,
    zone,
    sanitizeDuration(duration, DEFAULT_DURATION),
    normalizedOptions,
  );
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
    logEffectEvent('effect-invalid', { event });
    return () => {};
  }

  const logEntry = logEffectEvent('effect-apply', event);
  const handler = effectTypeHandlers.get(event.type);
  if (typeof handler !== 'function') {
    console.warn(`[effect-loader] No handler registered for effect type "${event.type}"`);
    logEffectEvent('effect-missing-handler', { event });
    return () => {};
  }

  const result = handler(event);
  if (typeof result === 'function') {
    return () => {
      try {
        result();
      } finally {
        logEffectEvent('effect-cleanup', {
          reference: logEntry?.time,
          type: event.type,
          effect: event.effect,
        });
      }
    };
  }
  return result;
}

if (!effectTypeHandlers.has('css')) {
  registerEffectType('css', cssEffectHandler);
}

if (!effectTypeHandlers.has('canvas')) {
  registerEffectType('canvas', canvasEffectHandler);
}

export async function registerEffectPlugin(name, loader, options = {}) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('[effect-loader] Plugin name must be a non-empty string');
  }

  const pluginName = name.trim();
  if (pluginRegistry.has(pluginName)) {
    return pluginRegistry.get(pluginName);
  }

  try {
    const module = await resolvePluginModule(loader);
    const plugin = module?.default ?? module;
    if (!plugin) {
      console.warn(`[effect-loader] Plugin "${pluginName}" did not export a usable value`);
      logEffectEvent('plugin-empty', { name: pluginName });
      return null;
    }

    const api = createPluginApi(pluginName);
    let cleanup = null;

    if (typeof plugin === 'function') {
      cleanup = await plugin(api, options) ?? null;
    } else if (plugin && typeof plugin.register === 'function') {
      cleanup = await plugin.register(api, options) ?? null;
    } else if (plugin && typeof plugin.canvasEffect === 'function') {
      registerCanvasEffect(pluginName, plugin.canvasEffect);
    } else if (plugin && typeof plugin.effect === 'function') {
      registerCanvasEffect(pluginName, plugin.effect);
    } else {
      console.warn(`[effect-loader] Plugin "${pluginName}" did not expose a registerable effect`);
      logEffectEvent('plugin-invalid', { name: pluginName, keys: Object.keys(plugin) });
      return null;
    }

    const record = normalisePluginRecord(pluginName, plugin, cleanup);
    logEffectEvent('plugin-registered', { name: pluginName });
    return record;
  } catch (error) {
    console.warn(`[effect-loader] Failed to load plugin "${pluginName}"`, error);
    logEffectEvent('plugin-error', { name: pluginName, message: error?.message ?? String(error) });
    return null;
  }
}

export function unregisterEffectPlugin(name) {
  if (typeof name !== 'string' || !name.trim()) {
    return false;
  }
  const pluginName = name.trim();
  const record = pluginRegistry.get(pluginName);
  if (!record) {
    return false;
  }
  try {
    record.cleanup?.();
  } catch (error) {
    console.warn(`[effect-loader] Failed to cleanup plugin "${pluginName}"`, error);
  }
  pluginRegistry.delete(pluginName);
  logEffectEvent('plugin-unregistered', { name: pluginName });
  return true;
}

export function getRegisteredEffectPlugins() {
  return new Map(pluginRegistry);
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

