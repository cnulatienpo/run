// GOAL: Dynamically determine when and what type of hallucination to spawn

import effectConfig from '../effects/effect-config.json' assert { type: 'json' };
import { applyEffect, registerZone } from '../effects/effect-loader.js';
import { getRecentTags } from './tag-history.js';

const SESSION_DURATION_MS = 45 * 60 * 1000; // 45 minutes
const DEFAULT_MOOD = typeof effectConfig?.defaultMood === 'string' ? effectConfig.defaultMood : 'ambient';

const { moodLibrary: EFFECT_LIBRARY } = buildEffectLibrary(effectConfig);
const EFFECT_MAP = buildEffectMap(EFFECT_LIBRARY);
registerConfiguredZones(effectConfig?.zones ?? {});

const EFFECT_PACKS = {
  default: cloneEffectPack(EFFECT_MAP),
  fog: {
    ambient: [
      ...(EFFECT_MAP.ambient ?? []),
      {
        type: 'canvas',
        effect: 'hueshift',
        intensity: 'low',
        zone: { shape: 'rect', x: 0, y: 0.4, w: 1, h: 0.6 },
        duration: 5000,
        tag: 'fog',
      },
    ],
    rare: [
      ...(EFFECT_MAP.rare ?? []),
      {
        type: 'canvas',
        effect: 'ripple',
        intensity: 'medium',
        zone: { shape: 'circle', x: 0.4, y: 0.7, r: 0.15 },
        duration: 4000,
        tag: 'fog',
      },
    ],
    glide: [...(EFFECT_MAP.glide ?? [])],
    dreamcore: [...(EFFECT_MAP.dreamcore ?? [])],
  },
};

let activeEffectPack = 'default';

const MOOD_CURVE = [
  { t: 0.0, mood: 'ambient' },
  { t: 0.25, mood: 'rare' },
  { t: 0.5, mood: 'glide' },
  { t: 0.75, mood: 'dreamcore' },
  { t: 1.0, mood: 'ambient' },
];

let sessionStart = Date.now();
let lastSpawn = 0;

const EFFECT_INTERVAL = 4000; // minimum ms between effects
const RARE_CHANCE = 0.02; // 2% chance for rare override

let lastStepTime = Date.now();
let stillnessCheckInterval = 5000;
let stillnessIntervalId = null;
const STILLNESS_THRESHOLD = 15000; // 15 sec

export function spawnLoop(stepRate, bpm) {
  const now = Date.now();
  if (now - lastSpawn < EFFECT_INTERVAL) {
    return;
  }

  const t = (now - sessionStart) / SESSION_DURATION_MS;
  const curveMood = getMoodFromCurve(t);
  const vibeBoost = getVibeBoost(stepRate, bpm);
  const selectedMood = applyVibeToMood(curveMood, vibeBoost);
  const tagInfluence = getRecentTags();

  let hallucination = null;
  if (Math.random() < RARE_CHANCE && EFFECT_LIBRARY.rare) {
    hallucination = chooseEffect('rare', tagInfluence);
  }
  if (!hallucination) {
    hallucination = chooseEffect(selectedMood, tagInfluence);
  }
  if (hallucination) {
    applyEffect(hallucination);
    lastSpawn = now;
  }
}

export function resetSessionClock() {
  sessionStart = Date.now();
  lastSpawn = 0;
}

export function notifyStep() {
  lastStepTime = Date.now();
}

export function startStillnessWatcher(intervalMs = stillnessCheckInterval) {
  const host = typeof window !== 'undefined' ? window : globalThis;
  if (!host || typeof host.setInterval !== 'function') {
    console.warn('[session-pacing] Timer APIs unavailable for stillness watcher.');
    return null;
  }

  const normalizedInterval =
    Number.isFinite(intervalMs) && intervalMs > 0 ? Math.floor(intervalMs) : stillnessCheckInterval;
  stillnessCheckInterval = normalizedInterval;

  if (stillnessIntervalId) {
    host.clearInterval(stillnessIntervalId);
    stillnessIntervalId = null;
  }

  const checkStillness = () => {
    const now = Date.now();
    if (now - lastStepTime > STILLNESS_THRESHOLD) {
      applyEffect({
        type: 'canvas',
        effect: 'melt',
        zone: { shape: 'circle', x: 0.5, y: 0.5, r: 0.3 },
        duration: 4000,
        intensity: 'low',
        tag: 'still',
      });
      lastStepTime = now;
    }
  };

  stillnessIntervalId = host.setInterval(checkStillness, stillnessCheckInterval);
  return stillnessIntervalId;
}

export function switchEffectPack(name) {
  if (typeof name !== 'string' || !name.trim()) {
    return activeEffectPack;
  }
  const normalized = name.trim();
  if (EFFECT_PACKS[normalized]) {
    activeEffectPack = normalized;
  }
  return activeEffectPack;
}

function registerConfiguredZones(zones) {
  Object.entries(zones).forEach(([name, spec]) => {
    if (!name) {
      return;
    }
    try {
      registerZone(name, spec);
    } catch (error) {
      console.warn('[session-pacing] Failed to register zone', name, error);
    }
  });
}

function buildEffectLibrary(config) {
  const moodLibrary = {};
  const moods = config?.moods ?? {};

  Object.entries(moods).forEach(([moodKey, moodConfig]) => {
    const effects = Array.isArray(moodConfig?.effects)
      ? moodConfig.effects
          .map((effect, index) => normalizeEffect(effect, moodKey, index))
          .filter(Boolean)
      : [];
    const zones = Array.isArray(moodConfig?.zones)
      ? moodConfig.zones.filter((zone) => typeof zone === 'string' || typeof zone === 'object')
      : [];

    if (effects.length > 0) {
      moodLibrary[moodKey] = { effects, zones };
    }
  });

  return { moodLibrary };
}

function normalizeEffect(effect, moodKey, index) {
  if (!effect || typeof effect !== 'object') {
    return null;
  }
  const type = typeof effect.type === 'string' ? effect.type.trim() : '';
  if (!type) {
    return null;
  }

  const normalized = { ...effect };
  normalized.type = type;
  normalized.mood = normalized.mood || moodKey;
  normalized.tag = typeof normalized.tag === 'string' ? normalized.tag : moodKey;
  normalized.id = normalized.id || `${moodKey}-${type}-${index}`;
  return normalized;
}

function getMoodFromCurve(t) {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 1; i < MOOD_CURVE.length; i += 1) {
    if (clamped <= MOOD_CURVE[i].t) {
      return MOOD_CURVE[i - 1].mood;
    }
  }
  return DEFAULT_MOOD;
}

function getVibeBoost(stepRate, bpm) {
  if (stepRate > 140 || bpm > 130) return 'surge';
  if (stepRate > 100 || bpm > 110) return 'medium';
  return 'low';
}

function applyVibeToMood(mood, vibe) {
  const moodMatrix = {
    ambient: { low: 'ambient', medium: 'rare', surge: 'glide' },
    rare: { low: 'rare', medium: 'glide', surge: 'dreamcore' },
    glide: { low: 'rare', medium: 'dreamcore', surge: 'dreamcore' },
    dreamcore: { low: 'glide', medium: 'dreamcore', surge: 'dreamcore' },
  };
  return moodMatrix[mood]?.[vibe] || mood || DEFAULT_MOOD;
}

function chooseEffect(mood, tags) {
  const effectPool = getEffectPoolForMood(mood);
  if (!effectPool.length) {
    return null;
  }

  const tagList = Array.isArray(tags) ? tags : [];
  const weighted = effectPool.map((effect) => ({
    effect,
    weight: 1 + (effect.tag && tagList.includes(effect.tag) ? 2 : 0),
  }));

  const selectedEffect = pickWeightedEffect(weighted);
  if (!selectedEffect) {
    return null;
  }

  const event = { ...selectedEffect };
  if (!event.zone) {
    const selectedZone = pickRandomZoneForMood(mood) || pickRandomZoneForMood(DEFAULT_MOOD);
    if (selectedZone) {
      event.zone = selectedZone;
    }
  }
  return event;
}

function pickWeightedEffect(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  const totalWeight = entries.reduce((sum, entry) => sum + Math.max(entry.weight || 0, 0), 0);
  if (totalWeight <= 0) {
    return entries[0].effect ?? null;
  }
  let threshold = Math.random() * totalWeight;
  for (const entry of entries) {
    threshold -= Math.max(entry.weight || 0, 0);
    if (threshold <= 0) {
      return entry.effect;
    }
  }
  return entries[0].effect ?? null;
}

function pickRandomZone(zones) {
  if (!Array.isArray(zones) || zones.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * zones.length);
  const zone = zones[index];
  if (typeof zone === 'string') {
    return zone;
  }
  if (zone && typeof zone === 'object') {
    return { ...zone };
  }
  return null;
}

function buildEffectMap(library) {
  return Object.entries(library).reduce((map, [moodKey, entry]) => {
    map[moodKey] = Array.isArray(entry?.effects)
      ? entry.effects.map((effect) => ({ ...effect }))
      : [];
    return map;
  }, {});
}

function cloneEffectPack(map) {
  return Object.entries(map).reduce((pack, [moodKey, effects]) => {
    pack[moodKey] = Array.isArray(effects) ? effects.map((effect) => ({ ...effect })) : [];
    return pack;
  }, {});
}

function getEffectPoolForMood(mood) {
  const activePack = EFFECT_PACKS[activeEffectPack] || EFFECT_PACKS.default;
  const fallbackPack = EFFECT_PACKS.default;

  if (Array.isArray(activePack[mood]) && activePack[mood].length > 0) {
    return activePack[mood];
  }
  if (Array.isArray(fallbackPack[mood]) && fallbackPack[mood].length > 0) {
    return fallbackPack[mood];
  }
  return fallbackPack[DEFAULT_MOOD] ?? [];
}

function pickRandomZoneForMood(mood) {
  const zoneSource = EFFECT_LIBRARY[mood]?.zones ?? EFFECT_LIBRARY[DEFAULT_MOOD]?.zones;
  return pickRandomZone(zoneSource);
}
