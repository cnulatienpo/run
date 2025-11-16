
// ENTIRE HALLUCINATION ENGINE (EXTRACTED FROM TEXTDOC)
// This is the complete, line-for-line code as structured across multiple modules during the conversation.
// Includes everything: effect loader, canvas engine, tag tracking, mood pacing, replay, stillness detection, music sync, pack switching.

// --- Effect Loader ---
export function applyEffect({ type, effect, zone, duration, intensity }) {
  logEvent('effect', { type, effect, zone, duration, intensity });
  if (type === 'css') {
    const className = `${effect}-${intensity || 'base'}`;
    document.body.classList.add(className);
    setTimeout(() => document.body.classList.remove(className), duration);
  } else if (type === 'canvas') {
    triggerCanvasEffect(effect, zone, duration, intensity);
  }
}

// --- Canvas Engine (includes plugin support) ---
let canvas, ctx;
const pluginRegistry = {};

export function initCanvas() {
  canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.top = 0;
  canvas.style.left = 0;
  canvas.style.pointerEvents = 'none';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx = canvas.getContext('2d');
  document.body.appendChild(canvas);
}

export async function registerEffectPlugin(name, path) {
  if (!pluginRegistry[name]) {
    try {
      const module = await import(path);
      pluginRegistry[name] = module.default || module;
    } catch (e) {
      console.warn(`Failed to load plugin '${name}':`, e);
    }
  }
}

export function triggerCanvasEffect(effectName, zone, duration, intensity = 'base') {
  const plugin = pluginRegistry[effectName];
  if (plugin) {
    plugin(canvas, ctx, zone, duration, intensity);
    return;
  }
  const start = Date.now();
  const { shape, x, y, r, w, h } = zone;

  function drawFrame() {
    const elapsed = Date.now() - start;
    if (elapsed > duration) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x * canvas.width, y * canvas.height, r * canvas.width, 0, 2 * Math.PI);
    } else {
      ctx.rect(x * canvas.width, y * canvas.height, w * canvas.width, h * canvas.height);
    }
    ctx.clip();
    ctx.fillStyle = `hsla(${(elapsed / 10) % 360}, 80%, 60%, 0.4)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    requestAnimationFrame(drawFrame);
  }

  drawFrame();
}

// --- Tag History ---
const tagHistory = {};
const tagQueue = [];
export function recordTag(tag) {
  if (!tag) return;
  if (!tagHistory[tag]) tagHistory[tag] = 0;
  tagHistory[tag] += 1;
  tagQueue.push(tag);
  if (tagQueue.length > 100) {
    const removed = tagQueue.shift();
    tagHistory[removed] -= 1;
    if (tagHistory[removed] <= 0) delete tagHistory[removed];
  }
}
export function getRecentTags(limit = 5) {
  return Object.entries(tagHistory).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([tag]) => tag);
}

// --- Session Logging ---
const sessionLog = [];
export function logEvent(type, data) {
  sessionLog.push({ time: Date.now(), type, ...data });
}
export function exportSessionLog() {
  const blob = new Blob([JSON.stringify(sessionLog, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `session-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Replay Mode ---
export function replaySession(logData, speed = 1.0) {
  const sorted = logData.filter(e => e.type === 'effect').sort((a, b) => a.time - b.time);
  const baseTime = sorted[0]?.time || 0;
  sorted.forEach((event, i) => {
    const delay = (event.time - baseTime) / speed;
    setTimeout(() => applyEffect(event), delay);
  });
}

// --- Stillness Trigger ---
let lastStepTime = Date.now();
export function notifyStep() { lastStepTime = Date.now(); }
export function startStillnessWatcher() {
  setInterval(() => {
    if (Date.now() - lastStepTime > 15000) {
      applyEffect({ type: 'canvas', effect: 'melt', zone: { shape: 'circle', x: 0.5, y: 0.5, r: 0.3 }, duration: 4000, intensity: 'low', tag: 'still' });
      lastStepTime = Date.now();
    }
  }, 5000);
}

// --- Environment Transitions ---
let lastEnvCheck = 0;
export function monitorEnvironment(videoMetaFn, systemTimeFn = () => new Date()) {
  setInterval(() => {
    const now = Date.now();
    if (now - lastEnvCheck < 10000) return;
    lastEnvCheck = now;
    const title = videoMetaFn();
    const hour = systemTimeFn().getHours();
    if (/sewer|metro/i.test(title)) switchEffectPack('fog');
    else if (hour >= 21 || hour < 5) switchEffectPack('dreamcore');
    else switchEffectPack('default');
  }, 10000);
}

// --- Music Reactivity ---
let bpmSmooth = 100, bpmLastUpdate = Date.now(), beatInterval = 600, beatCounter = 0;
export function updateBPM(newBPM) {
  bpmSmooth = bpmSmooth * 0.9 + newBPM * 0.1;
  beatInterval = 60000 / bpmSmooth;
  bpmLastUpdate = Date.now();
}
function tickBeatGrid(now) {
  if (now - bpmLastUpdate >= beatInterval) {
    bpmLastUpdate = now;
    return ++beatCounter % 4 === 0;
  }
  return false;
}
function getVibeProfile(bpm, stepRate) {
  if (bpm > 130 || stepRate > 140) return 'frenzy';
  if (bpm > 110 || stepRate > 100) return 'dance';
  if (bpm > 90 || stepRate > 80) return 'glide';
  return 'fog';
}

// --- Spawn Loop ---
const MOOD_CURVE = [
  { t: 0.0, mood: 'ambient' }, { t: 0.25, mood: 'rare' },
  { t: 0.5, mood: 'glide' }, { t: 0.75, mood: 'dreamcore' }, { t: 1.0, mood: 'ambient' }
];
let sessionStart = Date.now();
let lastSpawn = 0, EFFECT_INTERVAL = 4000, RARE_CHANCE = 0.02;
export function spawnLoop(stepRate, bpm) {
  updateBPM(bpm);
  const now = Date.now();
  if (!tickBeatGrid(now)) return;
  const t = (now - sessionStart) / (45 * 60 * 1000);
  const curveMood = getMoodFromCurve(t);
  const vibe = getVibeProfile(bpm, stepRate);
  const mood = applyVibeToMood(curveMood, vibe);
  const tags = getRecentTags();
  const pack = EFFECT_PACKS[activeEffectPack][mood] || [];
  let effect = Math.random() < RARE_CHANCE ? chooseEffect(EFFECT_PACKS[activeEffectPack]['rare'], tags) : chooseEffect(pack, tags);
  if (effect) applyEffect(effect);
}
function getMoodFromCurve(t) {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 1; i < MOOD_CURVE.length; i++) if (clamped <= MOOD_CURVE[i].t) return MOOD_CURVE[i - 1].mood;
  return 'ambient';
}
function applyVibeToMood(base, vibe) {
  const map = {
    fog: { ambient: 'ambient', rare: 'ambient', glide: 'ambient', dreamcore: 'rare' },
    glide: { ambient: 'rare', rare: 'glide', glide: 'glide', dreamcore: 'glide' },
    dance: { ambient: 'glide', rare: 'dreamcore', glide: 'dreamcore', dreamcore: 'dreamcore' },
    frenzy: { ambient: 'dreamcore', rare: 'dreamcore', glide: 'dreamcore', dreamcore: 'dreamcore' }
  };
  return map[vibe]?.[base] || base;
}
function chooseEffect(pool, tags) {
  const weighted = pool.map(e => ({ ...e, weight: 1 + (tags.includes(e.tag) ? 2 : 0) }));
  const total = weighted.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * total;
  for (let e of weighted) if ((r -= e.weight) <= 0) return e;
  return weighted[0];
}

// --- Effect Packs (placeholder) ---
const EFFECT_PACKS = {
  default: {
    ambient: [/* effects */],
    rare: [/* effects */],
    glide: [/* effects */],
    dreamcore: [/* effects */]
  },
  fog: { ambient: [], rare: [], glide: [], dreamcore: [] },
  dreamcore: { ambient: [], rare: [], glide: [], dreamcore: [] }
};
let activeEffectPack = 'default';
export function switchEffectPack(name) {
  if (EFFECT_PACKS[name]) activeEffectPack = name;
}
