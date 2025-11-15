// GOAL: Dynamically determine when and what type of hallucination to spawn

import effectConfig from '../effects/effect-config.json' assert { type: 'json' };
import { applyEffect, registerZone } from '../effects/effect-loader.js';
import { getRecentTags } from './tag-history.js';

const SESSION_DURATION_MS = 45 * 60 * 1000; // 45 minutes
const DEFAULT_MOOD = typeof effectConfig?.defaultMood === 'string' ? effectConfig.defaultMood : 'ambient';

const { moodLibrary: EFFECT_LIBRARY } = buildEffectLibrary(effectConfig);
registerConfiguredZones(effectConfig?.zones ?? {});

const MOOD_CURVE = [
  { t: 0.0, mood: 'ambient' },
  { t: 0.25, mood: 'rare' },
  { t: 0.5, mood: 'glide' },
  { t: 0.75, mood: 'dreamcore' },
  { t: 1.0, mood: 'ambient' },
];

let sessionStart = Date.now();

export function spawnLoop(stepRate, bpm) {
  const now = Date.now();
  const t = (now - sessionStart) / SESSION_DURATION_MS;
  const curveMood = getMoodFromCurve(t);
  const vibeBoost = getVibeBoost(stepRate, bpm);
  const selectedMood = applyVibeToMood(curveMood, vibeBoost);
  const tagInfluence = getRecentTags();

  const hallucination = chooseEffect(selectedMood, tagInfluence);
  if (hallucination) {
    applyEffect(hallucination);
  }
}

export function resetSessionClock() {
  sessionStart = Date.now();
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
  const activeMoodKey = EFFECT_LIBRARY[mood] ? mood : DEFAULT_MOOD;
  const fallbackMood = EFFECT_LIBRARY[DEFAULT_MOOD] ? DEFAULT_MOOD : null;
  const moodEntry = EFFECT_LIBRARY[activeMoodKey] || (fallbackMood ? EFFECT_LIBRARY[fallbackMood] : null);
  if (!moodEntry?.effects?.length) {
    return null;
  }

  const tagList = Array.isArray(tags) ? tags : [];
  const weighted = moodEntry.effects.map((effect) => ({
    effect,
    weight: 1 + (effect.tag && tagList.includes(effect.tag) ? 2 : 0),
  }));

  const selectedEffect = pickWeightedEffect(weighted);
  if (!selectedEffect) {
    return null;
  }

  const selectedZone = pickRandomZone(moodEntry.zones) || pickRandomZone(EFFECT_LIBRARY[DEFAULT_MOOD]?.zones);
  const event = { ...selectedEffect };
  if (selectedZone) {
    event.zone = selectedZone;
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
