import { Application, Container, Graphics } from '../node_modules/pixi.js/dist/pixi.min.mjs';
import { GlitchFilter } from '../node_modules/@pixi/filter-glitch/dist/filter-glitch.mjs';
import { GodrayFilter } from '../node_modules/@pixi/filter-godray/dist/filter-godray.mjs';

function createFallbackLogger() {
  return {
    info: (...args) => console.info('[hud]', ...args),
    warn: (...args) => console.warn('[hud]', ...args),
    error: (...args) => console.error('[hud]', ...args),
  };
}

let log = createFallbackLogger();
(async () => {
  try {
    const module = await import('../node_modules/electron-log/renderer.js');
    const resolved = module?.default ?? module;
    if (resolved) {
      log = resolved;
      if (resolved?.transports?.file) {
        resolved.transports.file.level = 'info';
      }
    }
  } catch (error) {
    console.warn('[hud] electron-log unavailable, falling back to console.', error);
  }

  log.info('Session started:', new Date().toISOString());
})();

function safeStorageGet(key) {
  try {
    return window?.localStorage?.getItem(key) ?? null;
  } catch (error) {
    console.warn('[hud] Unable to read from storage:', error);
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window?.localStorage?.setItem(key, value);
  } catch (error) {
    console.warn('[hud] Unable to write to storage:', error);
  }
}

function readStoredTag() {
  const stored = safeStorageGet(TAG_STORAGE_KEY);
  return stored && Object.prototype.hasOwnProperty.call(activeFilters, stored) ? stored : null;
}

function readStoredMood() {
  const stored = safeStorageGet(MOOD_STORAGE_KEY);
  return stored && moods[stored] ? stored : null;
}

function persistTag(tag) {
  safeStorageSet(TAG_STORAGE_KEY, tag);
}

function persistMood(mood) {
  if (!moods[mood]) {
    return;
  }
  safeStorageSet(MOOD_STORAGE_KEY, mood);
}

function getPacingSnapshot(range = moodIntervalRange) {
  if (!Array.isArray(range)) {
    return null;
  }
  const [min, max] = range;
  return { min, max };
}

function syncSessionMetadata() {
  sessionLog.mood = currentMood;
  sessionLog.tag = currentTag;
  sessionLog.pacing = getPacingSnapshot();
}

function logEvent(event) {
  const entry = {
    time: new Date().toISOString(),
    tag: currentTag,
    mood: currentMood,
    pacing: getPacingSnapshot(),
    ...event,
  };
  sessionLog.events.push(entry);
  log.info('[LOG]', entry);
}

syncSessionMetadata();
logEvent({ type: 'sessionStart' });

const app = new Application();
const overlay = new Container();

const glitch = new GlitchFilter({ slices: 5 });
const godrays = new GodrayFilter();

const activeFilters = {
  Dreamcore: [godrays],
  Urban: [glitch],
  Ambient: [],
};

const moods = {
  Chill: [15000, 30000],
  Dreamlike: [10000, 18000],
  Intense: [4000, 8000],
};

const DEFAULT_MOOD = 'Dreamlike';
const TAG_STORAGE_KEY = 'selectedTag';
const MOOD_STORAGE_KEY = 'hudMood';

const sessionLog = {
  sessionId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  start: new Date().toISOString(),
  mood: null,
  tag: null,
  pacing: null,
  events: [],
};

let currentTag = readStoredTag() ?? 'Ambient';
let currentMood = readStoredMood() ?? DEFAULT_MOOD;
let moodIntervalRange = moods[currentMood] ?? moods[DEFAULT_MOOD];
let steps = 0;
let scheduleHandle;
let effectsPrimed = false;

const hud = document.getElementById('hud') ?? document.body.appendChild(document.createElement('div'));

hud.id = 'hud';
hud.style.position = 'absolute';
hud.style.top = '10px';
hud.style.left = '10px';
hud.style.zIndex = '9999';
hud.style.color = '#fff';
hud.style.background = 'rgba(0, 0, 0, 0.7)';
hud.style.padding = '10px';
hud.style.borderRadius = '6px';
hud.style.fontFamily = "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const tagContainer = document.createElement('div');
tagContainer.style.display = 'flex';
tagContainer.style.gap = '6px';
tagContainer.style.marginBottom = '8px';
hud.appendChild(tagContainer);

const moodWrapper = document.createElement('div');
moodWrapper.style.display = 'flex';
moodWrapper.style.alignItems = 'center';
moodWrapper.style.gap = '6px';
moodWrapper.style.marginBottom = '10px';

const moodLabel = document.createElement('label');
moodLabel.textContent = 'Mood:';
moodWrapper.appendChild(moodLabel);

const moodSelect = document.createElement('select');
moodSelect.style.background = '#111827';
moodSelect.style.color = '#f8fafc';
moodSelect.style.border = '1px solid #374151';
moodSelect.style.borderRadius = '4px';
moodSelect.style.padding = '4px 6px';
moodSelect.style.fontSize = '0.85rem';

Object.entries(moods).forEach(([mood, range]) => {
  const option = document.createElement('option');
  option.value = mood;
  option.textContent = `${mood} (${Math.round(range[0] / 1000)}-${Math.round(range[1] / 1000)}s)`;
  moodSelect.appendChild(option);
});

moodSelect.value = currentMood;
moodSelect.addEventListener('change', () => {
  applyMood(moodSelect.value);
});

moodWrapper.appendChild(moodSelect);
hud.insertBefore(moodWrapper, tagContainer);

const statusEl = document.createElement('div');
statusEl.textContent = 'Steps: 0';
hud.appendChild(statusEl);

const tags = ['Dreamcore', 'Urban', 'Ambient'];
const tagButtons = new Map();

function updateTagButtonStyles() {
  tagButtons.forEach((button, tag) => {
    const isActive = tag === currentTag;
    button.style.background = isActive ? '#0ea5e9' : '#1f2937';
    button.style.color = '#ffffff';
    button.style.border = 'none';
    button.style.padding = '6px 10px';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.style.opacity = isActive ? '1' : '0.7';
  });
}

function getMoodDelayRange() {
  return moodIntervalRange ?? moods[DEFAULT_MOOD];
}

function applyMood(nextMood) {
  if (!moods[nextMood]) {
    return;
  }
  if (currentMood === nextMood) {
    return;
  }
  currentMood = nextMood;
  moodIntervalRange = moods[nextMood];
  persistMood(nextMood);
  syncSessionMetadata();
  logEvent({ type: 'moodChange', mood: nextMood });
  rescheduleEffects();
}

tags.forEach((tag) => {
  const button = document.createElement('button');
  button.textContent = tag;
  button.type = 'button';
  button.addEventListener('click', () => {
    if (currentTag === tag) {
      return;
    }
    currentTag = tag;
    updateTagButtonStyles();
    applyTagFilters();
    rescheduleEffects();
    persistTag(tag);
    syncSessionMetadata();
    log.info('Mood tag set:', tag);
    logEvent({ type: 'tagChange', tag });
  });
  tagContainer.appendChild(button);
  tagButtons.set(tag, button);
});

updateTagButtonStyles();
applyTagFilters();

function applyTagFilters() {
  overlay.filters = activeFilters[currentTag] ?? [];
}

function spawnEffect() {
  if (!app.renderer) {
    return;
  }

  const graphic = new Graphics();
  graphic.beginFill(Math.floor(0xffffff * Math.random()));
  graphic.drawCircle(0, 0, 30 + Math.random() * 20);
  graphic.endFill();
  graphic.x = Math.random() * app.renderer.width;
  graphic.y = Math.random() * app.renderer.height;
  overlay.addChild(graphic);

  setTimeout(() => {
    overlay.removeChild(graphic);
    graphic.destroy({ children: true });
  }, 4000);

  const effectType = 'pixiBurst';
  log.info('Effect spawned', {
    time: Date.now(),
    tag: currentTag,
    step: steps,
    mood: currentMood,
    effect: effectType,
  });
  logEvent({ type: 'effectSpawn', effect: effectType });
}

function scheduleNext() {
  const [minDelay, maxDelay] = getMoodDelayRange();
  const delay = minDelay + Math.random() * (maxDelay - minDelay);
  scheduleHandle = window.setTimeout(() => {
    spawnEffect();
    scheduleNext();
  }, delay);
}

function rescheduleEffects() {
  if (!effectsPrimed) {
    return;
  }
  if (scheduleHandle) {
    window.clearTimeout(scheduleHandle);
  }
  scheduleNext();
}

function updateSteps(stepCount) {
  steps = stepCount;
  statusEl.textContent = `Steps: ${stepCount.toLocaleString()}`;
}

function exportSessionLog() {
  sessionLog.end = new Date().toISOString();
  const blob = new Blob([JSON.stringify(sessionLog, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `session-${sessionLog.sessionId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

window.downloadSessionLog = exportSessionLog;

window.addEventListener('keydown', (event) => {
  if (event.key?.toLowerCase() === 'l') {
    exportSessionLog();
  }
});

const wsUrl =
  globalThis.preloadConfig?.WS_URL ?? globalThis.RTW_WS_URL ?? 'ws://localhost:6789';

let socket;

function connectSocket() {
  try {
    socket = new WebSocket(wsUrl);
  } catch (error) {
    log.error('WS create error', error);
    scheduleReconnect();
    return;
  }

  socket.addEventListener('open', () => log.info('WS connected'));
  socket.addEventListener('error', (event) => log.error('WS error', event));
  socket.addEventListener('close', () => {
    log.warn('WS closed');
    scheduleReconnect();
  });
  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (typeof data.steps === 'number') {
        updateSteps(data.steps);
        log.info('Step received', data.steps);
      }
    } catch (error) {
      log.error('WS parse error', event.data);
    }
  });
}

let reconnectTimer;

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    connectSocket();
  }, 4000);
}

connectSocket();

(async () => {
  await app.init({ backgroundAlpha: 0, resizeTo: window });
  document.body.appendChild(app.canvas);
  Object.assign(app.canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '1',
  });
  app.stage.addChild(overlay);
  applyTagFilters();
  effectsPrimed = true;
  scheduleNext();
})();
