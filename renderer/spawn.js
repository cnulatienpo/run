import * as filters from '../effects/filters.js';

const MAX_CONCURRENT_EFFECTS = 10;
const EFFECT_DURATIONS = {
  softPulse: 2200,
  scanline: 1600,
};

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return undefined;
  }
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

async function loadEffectMapping() {
  const response = await fetch('./effects/effect-mapping.json', { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load effect mapping (${response.status})`);
  }
  return response.json();
}

export function createEffectSpawner({ canvas, onEffect }) {
  if (!canvas) {
    console.warn('[spawn] Canvas element missing – skipping effect spawner');
    return {
      trigger() {},
    };
  }

  const activeEffects = new Set();
  let mappingPromise;

  function ensureMapping() {
    if (!mappingPromise) {
      mappingPromise = loadEffectMapping().catch((error) => {
        console.error('[spawn] Unable to load effect mapping:', error);
        mappingPromise = undefined;
        throw error;
      });
    }
    return mappingPromise;
  }

  function applyEffect(effectName, zone, context) {
    const handler = filters[effectName];
    if (typeof handler !== 'function') {
      console.warn(`[spawn] Unknown effect handler: ${effectName}`);
      return;
    }

    const releaseClip = filters.withZoneClip?.(canvas, zone) ?? (() => {});
    handler(canvas);
    const duration = EFFECT_DURATIONS[effectName] ?? 2000;

    const controller = {
      dispose() {
        releaseClip();
        activeEffects.delete(controller);
      },
    };

    activeEffects.add(controller);
    window.setTimeout(() => controller.dispose(), duration + 120);
    onEffect?.(effectName, { ...context, zone });
  }

  async function trigger({ mood = 'defaultMood', stepCount }) {
    if (activeEffects.size >= MAX_CONCURRENT_EFFECTS) {
      return;
    }

    try {
      const mapping = await ensureMapping();
      const moodKey = mood && mapping.moods?.[mood] ? mood : mapping.defaultMood;
      const effectName = pickRandom(mapping.moods?.[moodKey]) ?? mapping.defaultMood;
      if (!effectName) {
        return;
      }
      const zone = pickRandom(mapping.zones?.[moodKey]) ?? 'center';
      applyEffect(effectName, zone, { mood: moodKey, stepCount });
    } catch (error) {
      console.warn('[spawn] Skipping effect due to error:', error);
    }
  }

  return {
    trigger,
    clear() {
      activeEffects.forEach((controller) => controller.dispose());
      activeEffects.clear();
    },
  };
}
