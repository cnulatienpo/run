// Hallucination Engine – modular ES module
// Provides effect spawning, stillness monitoring, music reactivity, and session logging
// Integrated for SPA usage with guarded lifecycle hooks.

// --- Effect Loader ---
export function applyEffect({ type, effect, zone, duration, intensity }) {
  const scaledDuration = Math.max(250, duration * intensityMultiplier);
  logEvent('effect', { type, effect, zone, duration: scaledDuration, intensity, multiplier: intensityMultiplier });
  if (type === 'css') {
    const className = `${effect}-${intensity || 'base'}`;
    document.body.classList.add(className);
    setTimeout(() => document.body.classList.remove(className), scaledDuration);
  } else if (type === 'canvas') {
    triggerCanvasEffect(effect, zone, scaledDuration, intensity);
  }
}

// --- Canvas Engine (includes plugin support) ---
let canvas;
let ctx;
let canvasInitialized = false;
const pluginRegistry = {};
let intensityMultiplier = 1;

export function initCanvas() {
  if (canvasInitialized) return canvas;

  canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.top = 0;
  canvas.style.left = 0;
  canvas.style.pointerEvents = 'none';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx = canvas.getContext('2d');
  document.body.appendChild(canvas);

  const resizeCanvas = () => {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };

  window.addEventListener('resize', resizeCanvas);
  canvasInitialized = true;
  return canvas;
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
  if (!canvasInitialized) initCanvas();
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
  return Object.entries(tagHistory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

export function clearRecentTags() {
  Object.keys(tagHistory).forEach((key) => delete tagHistory[key]);
  tagQueue.splice(0, tagQueue.length);
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
  const sorted = logData.filter((e) => e.type === 'effect').sort((a, b) => a.time - b.time);
  const baseTime = sorted[0]?.time || 0;
  sorted.forEach((event) => {
    const delay = (event.time - baseTime) / speed;
    setTimeout(() => applyEffect(event), delay);
  });
}

// --- Stillness Trigger ---
let lastStepTime = Date.now();
let stillnessIntervalId = null;
export function notifyStep() {
  lastStepTime = Date.now();
}
export function startStillnessWatcher() {
  if (stillnessIntervalId) return stillnessIntervalId;
  stillnessIntervalId = setInterval(() => {
    if (Date.now() - lastStepTime > 15000) {
      applyEffect({
        type: 'canvas',
        effect: 'melt',
        zone: { shape: 'circle', x: 0.5, y: 0.5, r: 0.3 },
        duration: 4000,
        intensity: 'low',
        tag: 'still',
      });
      lastStepTime = Date.now();
    }
  }, 5000);
  return stillnessIntervalId;
}

// --- Environment Transitions ---
let lastEnvCheck = 0;
let environmentIntervalId = null;
export function monitorEnvironment(videoMetaFn, systemTimeFn = () => new Date()) {
  if (environmentIntervalId) return environmentIntervalId;
  environmentIntervalId = setInterval(() => {
    const now = Date.now();
    if (now - lastEnvCheck < 10000) return;
    lastEnvCheck = now;
    const title = videoMetaFn();
    const hour = systemTimeFn().getHours();
    if (/sewer|metro/i.test(title)) switchEffectPack('fog');
    else if (hour >= 21 || hour < 5) switchEffectPack('dreamcore');
    else switchEffectPack('default');
  }, 10000);
  return environmentIntervalId;
}

// --- Music Reactivity ---
let bpmSmooth = 100;
let bpmLastUpdate = Date.now();
let beatInterval = 600;
let beatCounter = 0;
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
  { t: 0.0, mood: 'ambient' },
  { t: 0.25, mood: 'rare' },
  { t: 0.5, mood: 'glide' },
  { t: 0.75, mood: 'dreamcore' },
  { t: 1.0, mood: 'ambient' },
];
let sessionStart = Date.now();
let lastSpawn = 0;
let EFFECT_INTERVAL = 4000;
let RARE_CHANCE = 0.02;
let packMoodFilters = {};
let activeEffectPacks = ['default'];
export function spawnLoop(stepRate, bpm) {
  updateBPM(bpm);
  const now = Date.now();
  if (!tickBeatGrid(now)) return;
  if (now - lastSpawn < EFFECT_INTERVAL) return;
  lastSpawn = now;
  const t = (now - sessionStart) / (45 * 60 * 1000);
  const curveMood = getMoodFromCurve(t);
  const vibe = getVibeProfile(bpm, stepRate);
  const mood = applyVibeToMood(curveMood, vibe);
  const tags = getRecentTags();
  const { pool, rarePool } = getEffectPools(mood);
  const selectedPool = Math.random() < RARE_CHANCE ? rarePool : pool;
  const effect = chooseEffect(selectedPool, tags);
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
    frenzy: { ambient: 'dreamcore', rare: 'dreamcore', glide: 'dreamcore', dreamcore: 'dreamcore' },
  };
  return map[vibe]?.[base] || base;
}
function chooseEffect(pool = [], tags = []) {
  if (!pool.length) return null;
  const weighted = pool.map((e) => ({ ...e, weight: 1 + (tags.includes(e.tag) ? 2 : 0) }));
  const total = weighted.reduce((sum, e) => sum + e.weight, 0);
  if (!total) return null;
  let r = Math.random() * total;
  for (const e of weighted) if ((r -= e.weight) <= 0) return e;
  return weighted[0];
}

// --- Effect Packs (opinionated defaults) ---
const DEFAULT_ZONES = {
  center: { shape: 'circle', x: 0.5, y: 0.5, r: 0.35 },
  band: { shape: 'rect', x: 0, y: 0.42, w: 1, h: 0.16 },
  corner: { shape: 'rect', x: 0, y: 0, w: 0.25, h: 0.25 },
};

const DEFAULT_EFFECT_PACKS = {
  default: {
    ambient: [
      { type: 'canvas', effect: 'sheen', zone: DEFAULT_ZONES.band, duration: 2600, intensity: 'low', tag: 'ambient' },
    ],
    rare: [
      { type: 'canvas', effect: 'strobe', zone: DEFAULT_ZONES.center, duration: 1800, intensity: 'high', tag: 'rare' },
    ],
    glide: [
      { type: 'canvas', effect: 'glide', zone: DEFAULT_ZONES.center, duration: 3200, intensity: 'base', tag: 'glide' },
    ],
    dreamcore: [
      { type: 'canvas', effect: 'dreamwave', zone: DEFAULT_ZONES.corner, duration: 3600, intensity: 'base', tag: 'dreamcore' },
    ],
  },
  fog: {
    ambient: [
      { type: 'canvas', effect: 'fog', zone: DEFAULT_ZONES.band, duration: 3200, intensity: 'low', tag: 'fog' },
    ],
    rare: [
      { type: 'canvas', effect: 'fog-burst', zone: DEFAULT_ZONES.corner, duration: 2600, intensity: 'high', tag: 'rare' },
    ],
    glide: [
      { type: 'canvas', effect: 'fog-glide', zone: DEFAULT_ZONES.center, duration: 3000, intensity: 'base', tag: 'glide' },
    ],
    dreamcore: [
      { type: 'canvas', effect: 'fog-dream', zone: DEFAULT_ZONES.center, duration: 3400, intensity: 'base', tag: 'dreamcore' },
    ],
  },
  dreamcore: {
    ambient: [
      { type: 'canvas', effect: 'neon-haze', zone: DEFAULT_ZONES.band, duration: 3000, intensity: 'low', tag: 'ambient' },
    ],
    rare: [
      { type: 'canvas', effect: 'portal', zone: DEFAULT_ZONES.center, duration: 2600, intensity: 'high', tag: 'rare' },
    ],
    glide: [
      { type: 'canvas', effect: 'trail', zone: DEFAULT_ZONES.center, duration: 3200, intensity: 'base', tag: 'glide' },
    ],
    dreamcore: [
      { type: 'canvas', effect: 'bloom', zone: DEFAULT_ZONES.corner, duration: 3600, intensity: 'base', tag: 'dreamcore' },
    ],
  },
};
let EFFECT_PACKS = JSON.parse(JSON.stringify(DEFAULT_EFFECT_PACKS));
let activeEffectPack = 'default';
export function switchEffectPack(name) {
  if (EFFECT_PACKS[name]) {
    activeEffectPack = name;
    activeEffectPacks = [name];
  }
}

export function configureEffectPacks({ selectedPacks, moodFilters, packOverrides } = {}) {
  if (packOverrides) {
    EFFECT_PACKS = { ...JSON.parse(JSON.stringify(DEFAULT_EFFECT_PACKS)), ...packOverrides };
  }
  packMoodFilters = moodFilters || {};
  const validPacks = (selectedPacks || []).filter((name) => EFFECT_PACKS[name]);
  if (validPacks.length) {
    activeEffectPacks = validPacks;
    activeEffectPack = validPacks[0];
  } else {
    activeEffectPacks = ['default'];
    activeEffectPack = 'default';
  }
}

export function setEffectInterval(value) {
  if (Number.isFinite(value)) {
    EFFECT_INTERVAL = Math.max(250, value);
  }
}

export function setRareChance(value) {
  if (Number.isFinite(value)) {
    RARE_CHANCE = Math.max(0, Math.min(1, value));
  }
}

export function setIntensityMultiplier(value) {
  if (Number.isFinite(value)) {
    intensityMultiplier = Math.max(0.25, value);
  }
}

export function getEffectConfiguration() {
  return {
    effectInterval: EFFECT_INTERVAL,
    rareChance: RARE_CHANCE,
    intensityMultiplier,
    activeEffectPacks: [...activeEffectPacks],
    moodFilters: { ...packMoodFilters },
    effectPacks: EFFECT_PACKS,
  };
}

export function getEffectPacks() {
  return EFFECT_PACKS;
}

function getEffectPools(mood) {
  const pool = [];
  const rarePool = [];
  const packs = activeEffectPacks?.length ? activeEffectPacks : [activeEffectPack];
  packs.forEach((name) => {
    const pack = EFFECT_PACKS[name];
    if (!pack) return;
    const filters = packMoodFilters[name];
    const allowMood = filters ? filters[mood] !== false : true;
    const allowRare = filters ? filters.rare !== false : true;
    if (allowMood && Array.isArray(pack[mood])) pool.push(...pack[mood]);
    if (allowRare && Array.isArray(pack.rare)) rarePool.push(...pack.rare);
  });
  return { pool, rarePool };
}

// Export internal for debugging/testing
export const __INTERNAL_EFFECT_PACKS = () => EFFECT_PACKS;

// --- Debug Controls Panel ---
let debugPanel;

export function initDebugControls(options = {}) {
  if (debugPanel) {
    return debugPanel;
  }

  const DEFAULT_EFFECTS = [
    { label: 'Wave', effect: 'wave' },
    { label: 'Ripple', effect: 'ripple' },
    { label: 'Melt', effect: 'melt' },
    { label: 'Hue Shift', effect: 'hueshift' },
  ];

  const DEFAULT_ZONE = { shape: 'circle', x: 0.5, y: 0.5, r: 0.25 };

  debugPanel = document.createElement('div');
  Object.assign(debugPanel.style, {
    position: 'fixed',
    top: '10px',
    right: '10px',
    background: 'rgba(0, 0, 0, 0.92)',
    color: '#e2e8f0',
    padding: '16px',
    borderRadius: '10px',
    fontFamily: '"La Nu Tienpo", sans-serif',
    fontSize: '14px',
    boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.3)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: '200px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
  });

  const title = document.createElement('strong');
  title.textContent = options.title || 'Hallucination Controls';
  Object.assign(title.style, {
    color: '#fff',
    fontSize: '16px',
    marginBottom: '4px',
  });
  debugPanel.appendChild(title);

  const effects = options.effects || DEFAULT_EFFECTS;
  effects.forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'frame-rect';
    button.textContent = entry.label;
    Object.assign(button.style, {
      width: '100%',
      color: '#fff',
      cursor: 'pointer',
      fontSize: '14px',
    });
    button.addEventListener('click', () => {
      applyEffect({
        type: 'canvas',
        effect: entry.effect,
        zone: DEFAULT_ZONE,
        duration: 3000,
        intensity: 'medium',
      });
    });
    debugPanel.appendChild(button);
  });

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'frame-rect';
  exportButton.textContent = options.exportLabel || 'Export Session Log';
  Object.assign(exportButton.style, {
    width: '100%',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  });
  exportButton.addEventListener('click', () => exportSessionLog());
  debugPanel.appendChild(exportButton);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'frame-rect';
  closeButton.textContent = 'Close';
  Object.assign(closeButton.style, {
    width: '100%',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    marginTop: '4px',
  });
  closeButton.addEventListener('click', () => destroyDebugControls());
  debugPanel.appendChild(closeButton);

  document.body.appendChild(debugPanel);
  return debugPanel;
}

export function destroyDebugControls() {
  if (debugPanel) {
    debugPanel.remove();
    debugPanel = null;
  }
}
