import { WS_URL } from './renderer/config.js';
import { initialiseHud, createMoodSelectorHUD } from './renderer/hud.js';
import { createNetworkClient } from './renderer/network.js';
import { createEffectSpawner } from './renderer/spawn.js';
import {
  startSpawnLoop as startFxSpawnLoop,
  setMood as setFxMood,
  stopSpawnLoop as stopFxSpawnLoop,
} from './renderer/spawn-loop.js';
import {
  initialiseSessionLog,
  exportSessionLog as exportGlobalSessionLog,
} from './renderer/tag-session-logger.js';

const DEFAULT_MOOD = 'dreamcore';
const MOOD_STORAGE_KEY = 'selectedMood';
const MOODS = {
  dreamcore: { name: 'Dreamcore', min: 5000, max: 9000 },
  ambient: { name: 'Ambient', min: 12000, max: 18000 },
  hype: { name: 'Hype', min: 2500, max: 5000 },
  rare: { name: 'Rare Drop', min: 30000, max: 45000 },
};

function readStoredMood() {
  try {
    return window?.localStorage?.getItem(MOOD_STORAGE_KEY) ?? null;
  } catch (error) {
    console.warn('[renderer] Unable to read stored mood:', error);
    return null;
  }
}

function persistMood(mood) {
  try {
    window?.localStorage?.setItem(MOOD_STORAGE_KEY, mood);
  } catch (error) {
    console.warn('[renderer] Unable to persist mood:', error);
  }
}

const storedMood = readStoredMood();
let currentMood = storedMood && MOODS[storedMood] ? storedMood : DEFAULT_MOOD;
let effectTimer = null;
let moodSyncInitialised = false;

document.addEventListener('DOMContentLoaded', () => {
  createMoodSelectorHUD();
  startSpawnLoop();
});

const sessionState = initialiseSessionLog();
const sessionLog = Array.isArray(sessionState.events)
  ? sessionState.events
  : (sessionState.events = []);
const sessionStart = sessionState.startTime ?? Date.now();
sessionState.startTime = sessionStart;

function logSessionEvent(type, data = {}) {
  sessionLog.push({
    type,
    timestamp: Date.now() - sessionStart,
    ...data,
  });
}

logSessionEvent('session-start');

let previousStepCount = 0;

function ensureEffectStyles() {
  if (document.getElementById('hallucination-style')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'hallucination-style';
  style.textContent = `
@keyframes flashPulse {
  0% { filter: hue-rotate(0deg) brightness(1); }
  50% { filter: hue-rotate(60deg) brightness(1.4); }
  100% { filter: hue-rotate(0deg) brightness(1); }
}
`;
  document.head.appendChild(style);
}

function spawnEffect() {
  const canvas = document.getElementById('fx-canvas');
  if (!canvas) {
    return;
  }

  import('./effects/filters.js')
    .then(({ softPulse, scanline, withZoneClip }) => {
      const zoneOptions = ['topLeft', 'center', 'bottom'];
      const zone = zoneOptions[Math.floor(Math.random() * zoneOptions.length)];
      const release = typeof withZoneClip === 'function' ? withZoneClip(canvas, zone) : null;

      const effect = Math.random() < 0.5 ? softPulse : scanline;
      if (typeof effect === 'function') {
        effect(canvas);
      }

      window.setTimeout(() => {
        if (typeof release === 'function') {
          release();
        }
      }, 2200);
    })
    .catch((error) => {
      console.warn('[renderer] Unable to spawn mood effect:', error);
    });
}

function scheduleNextEffect() {
  window.clearTimeout(effectTimer);
  const mood = MOODS[currentMood] || MOODS[DEFAULT_MOOD];
  const range = Math.max(0, mood.max - mood.min);
  const delay = Math.floor(Math.random() * (range + 1)) + mood.min;
  effectTimer = window.setTimeout(() => {
    spawnEffect();
    scheduleNextEffect();
  }, delay);
}

function syncMoodToPrimaryHud() {
  const hudMoodSelect = document.getElementById('mood-select');
  if (hudMoodSelect && hudMoodSelect.value !== currentMood) {
    hudMoodSelect.value = currentMood;
    hudMoodSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function syncMoodFromPrimaryHud() {
  const hudMoodSelect = document.getElementById('mood-select');
  if (hudMoodSelect) {
    const previousMood = currentMood;
    const moodValue = MOODS[hudMoodSelect.value] ? hudMoodSelect.value : currentMood;
    currentMood = MOODS[moodValue] ? moodValue : DEFAULT_MOOD;
    if (currentMood !== previousMood) {
      logSessionEvent('mood-update', { mood: currentMood, source: 'primary-hud' });
    }
    persistMood(currentMood);
    setFxMood(currentMood);
    const selector = document.getElementById('overlay-mood-selector');
    if (selector && selector.value !== currentMood) {
      selector.value = currentMood;
    }
  }
  scheduleNextEffect();
}

function ensureMoodSelector(hudElement) {
  if (!hudElement || hudElement.querySelector('#overlay-mood-selector')) {
    return;
  }

  const wrap = document.createElement('div');
  wrap.style.marginTop = '8px';

  const label = document.createElement('label');
  label.textContent = 'Mood: ';
  label.style.marginRight = '6px';

  const select = document.createElement('select');
  select.id = 'overlay-mood-selector';
  Object.entries(MOODS).forEach(([key, mood]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = mood.name;
    select.appendChild(option);
  });
  select.value = currentMood;

  select.addEventListener('change', () => {
    const previousMood = currentMood;
    currentMood = select.value;
    persistMood(currentMood);
    syncMoodToPrimaryHud();
    setFxMood(currentMood);
    scheduleNextEffect();
    if (currentMood !== previousMood) {
      logSessionEvent('mood-update', { mood: currentMood, source: 'overlay' });
    }
  });

  wrap.appendChild(label);
  wrap.appendChild(select);
  hudElement.appendChild(wrap);
}

function initOverlayHUD() {
  const existingHud = document.getElementById('overlay-hud');
  const hud = existingHud || document.createElement('div');
  hud.id = 'overlay-hud';
  hud.style.position = 'fixed';
  hud.style.top = '12px';
  hud.style.left = '12px';
  hud.style.zIndex = '99999';
  hud.style.padding = '10px 14px';
  hud.style.background = 'rgba(0, 0, 0, 0.7)';
  hud.style.color = '#eee';
  hud.style.fontFamily = 'system-ui, sans-serif';
  hud.style.borderRadius = '8px';
  hud.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';

  if (!existingHud) {
    const timer = document.createElement('div');
    timer.id = 'session-timer';
    timer.textContent = 'Session: 0:00';
    timer.style.fontSize = '16px';
    hud.appendChild(timer);

    const status = document.createElement('div');
    status.id = 'connection-status';
    status.textContent = 'Connecting…';
    status.style.fontSize = '14px';
    status.style.marginTop = '6px';
    hud.appendChild(status);

    document.body.appendChild(hud);
  }

  ensureMoodSelector(hud);
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const text = `Session: ${minutes}:${seconds.toString().padStart(2, '0')}`;
  const element = document.getElementById('session-timer');
  if (element) {
    element.textContent = text;
  }
}

function updateConnectionStatus(text, state = 'neutral') {
  const element = document.getElementById('connection-status');
  if (!element) {
    return;
  }

  element.textContent = text;
  element.style.color =
    state === 'ok'
      ? '#22c55e'
      : state === 'error'
      ? '#f87171'
      : state === 'reconnecting'
      ? '#facc15'
      : '#eee';
}

initOverlayHUD();
updateTimer();
window.setInterval(updateTimer, 1000);

const hud = initialiseHud({ sessionLog, logSessionEvent });
createMoodSelectorHUD();
const canvas = document.getElementById('fx-canvas');
const spawner = createEffectSpawner({
  canvas,
  onEffect(effectName, context) {
    logSessionEvent('effect-spawned', {
      steps: hud.getLastStepCount(),
      effect: effectName,
      mood: context?.mood,
      zone: context?.zone,
    });
  },
});

function initialiseMoodIntegration() {
  if (moodSyncInitialised) {
    return;
  }

  const hudMoodSelect = document.getElementById('mood-select');
  if (!hudMoodSelect) {
    return;
  }

  moodSyncInitialised = true;
  hudMoodSelect.addEventListener('change', syncMoodFromPrimaryHud);
}

initialiseMoodIntegration();
const hudMood = hud.getMood?.();
if (hudMood && MOODS[hudMood]) {
  currentMood = hudMood;
  persistMood(currentMood);
}
const overlayMoodSelect = document.getElementById('overlay-mood-selector');
if (overlayMoodSelect && overlayMoodSelect.value !== currentMood) {
  overlayMoodSelect.value = currentMood;
}
setFxMood(currentMood);
startFxSpawnLoop({ immediate: true });
ensureEffectStyles();
if (moodSyncInitialised) {
  syncMoodFromPrimaryHud();
} else {
  scheduleNextEffect();
}

hud.updateVersions(window.electronInfo?.versions ?? {});
const assetPackPromise = hud.loadAssetPacks?.();
if (assetPackPromise?.catch) {
  assetPackPromise.catch((error) => {
    console.warn('[renderer] Unable to load asset packs:', error);
  });
}

const network = createNetworkClient({
  url: WS_URL,
  onStatus: (message, state) => {
    hud.setStatus(message, state);
    if (state) {
      logSessionEvent('connection-status', { state, message });
    }
    if (state === 'connected') {
      updateConnectionStatus('Connected', 'ok');
    } else if (state === 'reconnecting') {
      updateConnectionStatus('Reconnecting', 'reconnecting');
    } else if (state === 'connecting') {
      updateConnectionStatus('Connecting…');
    } else {
      updateConnectionStatus('Disconnected', 'error');
    }
  },
  onStepData: (payload) => {
    if (typeof payload.steps === 'number') {
      const stepCount = payload.steps;
      hud.updateSteps(stepCount);
      logSessionEvent('step-update', { steps: stepCount });
      const stepDelta = Math.max(0, stepCount - previousStepCount);
      const iterations = stepDelta > 0 ? Math.min(stepDelta, 10) : 0;
      for (let i = 0; i < iterations; i += 1) {
        spawner.trigger({
          mood: hud.getMood(),
          stepCount,
        });
      }
      previousStepCount = stepCount;
    }

    if (typeof payload.bpm === 'number') {
      logSessionEvent('bpm-update', {
        steps: hud.getLastStepCount(),
        bpm: payload.bpm,
      });
    }

    if (typeof payload.playlist === 'string') {
      logSessionEvent('playlist-update', {
        steps: hud.getLastStepCount(),
        playlist: payload.playlist,
      });
    }
  },
});

function downloadSessionLog() {
  logSessionEvent('session-log-exported');
  exportGlobalSessionLog();
}

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'l') {
    const target = event.target;
    if (
      target &&
      ((target.tagName === 'INPUT' && target.type !== 'checkbox' && target.type !== 'radio') ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }
    downloadSessionLog();
  }
});

window.addEventListener('beforeunload', () => {
  network.dispose?.();
  spawner.clear?.();
  stopFxSpawnLoop();
  window.clearTimeout(effectTimer);
  effectTimer = null;
});
