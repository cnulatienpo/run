import { WS_URL } from './renderer/config.js';
import { initialiseHud, createMoodSelectorHUD } from './renderer/hud.js';
import { createEffectSpawner } from './renderer/spawn.js';
import {
  startSpawnLoop as startFxSpawnLoop,
  setMood as setFxMood,
  stopSpawnLoop as stopFxSpawnLoop,
} from './renderer/spawn-loop.js';
import { softPulse, scanline, withZoneClip } from './effects/filters.js';
import {
  initialiseSessionLog,
  exportSessionLog as exportGlobalSessionLog,
} from './renderer/tag-session-logger.js';
import { loadSettings, saveSettings } from './renderer/settings.js';

const DEFAULT_MOOD = 'dreamcore';
const MOOD_STORAGE_KEY = 'selectedMood';
const YTMUSIC_PLAYLIST_STORAGE_KEY = 'ytmusicSelectedPlaylist';
const YTMUSIC_PLAYLISTS = [
  {
    name: 'YouTube Music',
    url: 'https://music.youtube.com/playlist?list=PLabc123',
  },
  {
    name: 'Lo-fi Walks',
    url: 'https://music.youtube.com/playlist?list=PLdef456',
  },
  {
    name: 'Night City Runs',
    url: 'https://music.youtube.com/playlist?list=PLghi789',
  },
];
const userSettings = loadSettings();
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

  if (typeof mood === 'string') {
    if (userSettings && typeof userSettings === 'object') {
      userSettings.defaultMood = mood;
      saveSettings(userSettings);
    }
  }
}

const settingsMood =
  typeof userSettings?.defaultMood === 'string' && MOODS[userSettings.defaultMood]
    ? userSettings.defaultMood
    : null;
const storedMood = readStoredMood();
let currentMood =
  (settingsMood && MOODS[settingsMood] ? settingsMood : null) ||
  (storedMood && MOODS[storedMood] ? storedMood : null) ||
  DEFAULT_MOOD;
let moodSyncInitialised = false;

function readStoredPlaylistSelection() {
  try {
    return window?.localStorage?.getItem(YTMUSIC_PLAYLIST_STORAGE_KEY) ?? '';
  } catch (error) {
    console.warn('[renderer] Unable to read stored playlist selection:', error);
    return '';
  }
}

function persistPlaylistSelection(url) {
  try {
    if (url) {
      window?.localStorage?.setItem(YTMUSIC_PLAYLIST_STORAGE_KEY, url);
    } else {
      window?.localStorage?.removeItem(YTMUSIC_PLAYLIST_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('[renderer] Unable to persist playlist selection:', error);
  }
}

function addYouTubeMusicDropdownToHUD() {
  const hud = document.getElementById('hud');
  if (!hud) {
    return;
  }

  const existingRow = hud.querySelector('.row.playlist-row');
  if (existingRow) {
    return;
  }

  const row = document.createElement('div');
  row.className = 'row playlist-row';

  const label = document.createElement('strong');
  label.textContent = 'Playlist:';
  label.style.marginRight = '8px';
  row.appendChild(label);

  const select = document.createElement('select');
  select.id = 'ytmusic-playlist';
  select.style.fontSize = '14px';
  select.style.padding = '4px 8px';

  YTMUSIC_PLAYLISTS.forEach((playlist) => {
    const option = document.createElement('option');
    option.value = playlist.url;
    option.textContent = playlist.name;
    select.appendChild(option);
  });

  const storedSelection = readStoredPlaylistSelection();
  if (storedSelection) {
    const optionExists = YTMUSIC_PLAYLISTS.some((playlist) => playlist.url === storedSelection);
    if (optionExists) {
      select.value = storedSelection;
    }
  }

  select.addEventListener('change', (event) => {
    persistPlaylistSelection(event.target.value);
  });

  row.appendChild(select);

  const button = document.createElement('button');
  button.textContent = 'Start Playlist';
  button.style.marginLeft = '8px';
  button.addEventListener('click', () => {
    const url = select.value;
    if (typeof url === 'string' && url.trim().length > 0) {
      window.open(url, '_blank', 'noopener');
    }
  });
  row.appendChild(button);

  hud.appendChild(row);
}

document.addEventListener('DOMContentLoaded', () => {
  const versionEl = document.getElementById('version-text');
  const appVersion = window.electronInfo?.version;
  if (versionEl && appVersion) {
    versionEl.textContent = `v${appVersion}`;
  }

  createMoodSelectorHUD();
  addYouTubeMusicDropdownToHUD();
  startSpawnLoop();
});

const sessionState = initialiseSessionLog();
const sessionLog = Array.isArray(sessionState.events)
  ? sessionState.events
  : (sessionState.events = []);
const sessionStart =
  sessionState.startedAt ?? sessionState.startTime ?? Date.now();
sessionState.startTime = sessionStart;
sessionState.startedAt = sessionStart;
if (!sessionState.device) {
  sessionState.device = 'fake_stepper';
}
if (!sessionState.music || typeof sessionState.music !== 'object') {
  sessionState.music = {};
}

function logSessionEvent(type, data = {}) {
  const now = Date.now();
  const event = {
    type,
    t: now,
    timestamp: now - sessionStart,
    ...data,
  };
  sessionLog.push(event);
  return event;
}

function logStepUpdate(stepCount) {
  return logSessionEvent('step-update', { step: stepCount, steps: stepCount });
}

logSessionEvent('session-start');

let previousStepCount = 0;
let previousHeartRate = null;

const SELECTED_TAG_STORAGE_KEY = 'selectedTag';
const HALLUCINATION_DEFAULT_MOOD = 'dreamlike';
const HALLUCINATION_INTERVAL_FALLBACK = [9000, 14000];
const HALLUCINATION_TAG_POLL_INTERVAL = 2000;
const HALLUCINATION_EFFECT_HANDLERS = {
  softPulse,
  scanline,
};

let hallucinationEffectMap;
let hallucinationEffectMapPromise;
let hallucinationCanvas;
let hallucinationTimer;
let hallucinationTagPollTimer;
let hallucinationEffectActive = false;
let hallucinationLoopStarted = false;
let hallucinationMood = HALLUCINATION_DEFAULT_MOOD;
let lastSelectedTagValue = null;
let tagStorageListenerAttached = false;

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

    const metrics = document.createElement('div');
    metrics.id = 'overlay-metrics';
    metrics.style.display = 'grid';
    metrics.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
    metrics.style.gap = '6px';
    metrics.style.marginTop = '10px';

    const createMetricRow = (labelText, valueId, initialValue) => {
      const row = document.createElement('div');
      row.className = 'overlay-metric-row';
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.gap = '12px';

      const label = document.createElement('span');
      label.textContent = labelText;
      label.style.fontWeight = '600';
      label.style.fontSize = '13px';

      const value = document.createElement('span');
      value.id = valueId;
      value.textContent = initialValue;
      value.style.fontVariantNumeric = 'tabular-nums';
      value.style.fontSize = '15px';

      row.appendChild(label);
      row.appendChild(value);
      return row;
    };

    metrics.appendChild(createMetricRow('Steps', 'overlay-steps-value', '0'));
    metrics.appendChild(createMetricRow('Heart Rate', 'overlay-heart-rate-value', '--'));
    hud.appendChild(metrics);

    const reconnectButton = document.createElement('button');
    reconnectButton.id = 'overlay-reconnect';
    reconnectButton.textContent = 'Reconnect';
    reconnectButton.style.marginTop = '10px';
    reconnectButton.style.padding = '6px 12px';
    reconnectButton.style.borderRadius = '6px';
    reconnectButton.style.border = '1px solid rgba(148, 163, 184, 0.6)';
    reconnectButton.style.background = 'rgba(148, 163, 184, 0.18)';
    reconnectButton.style.color = '#f8fafc';
    reconnectButton.style.cursor = 'pointer';
    reconnectButton.style.fontSize = '13px';
    reconnectButton.style.fontWeight = '600';
    reconnectButton.style.textTransform = 'uppercase';
    reconnectButton.style.letterSpacing = '0.06em';
    hud.appendChild(reconnectButton);

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

let overlayStepsValueEl;
let overlayHeartRateValueEl;
let overlayReconnectButton;

function refreshOverlayElements() {
  overlayStepsValueEl = document.getElementById('overlay-steps-value');
  overlayHeartRateValueEl = document.getElementById('overlay-heart-rate-value');
  overlayReconnectButton = document.getElementById('overlay-reconnect');
}

refreshOverlayElements();

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
startTagHallucinationLoop();
if (moodSyncInitialised) {
  syncMoodFromPrimaryHud();
}

hud.updateVersions(window.electronInfo?.versions ?? {});
const assetPackPromise = hud.loadAssetPacks?.();
if (assetPackPromise?.catch) {
  assetPackPromise.catch((error) => {
    console.warn('[renderer] Unable to load asset packs:', error);
  });
}

const BRIDGE_URL =
  typeof WS_URL === 'string' && WS_URL.trim().length > 0 ? WS_URL.trim() : 'ws://localhost:6789';
const RECONNECT_DELAY_MS = 4000;
let bridgeSocket;
let reconnectTimer;
let intentionallyClosed = false;

function updateOverlayStepsDisplay(stepCount) {
  if (!overlayStepsValueEl || !document.body.contains(overlayStepsValueEl)) {
    refreshOverlayElements();
  }
  if (overlayStepsValueEl) {
    overlayStepsValueEl.textContent = Number.isFinite(stepCount)
      ? Number(stepCount).toLocaleString()
      : '—';
  }
}

function updateOverlayHeartRateDisplay(bpm) {
  if (!overlayHeartRateValueEl || !document.body.contains(overlayHeartRateValueEl)) {
    refreshOverlayElements();
  }
  if (overlayHeartRateValueEl) {
    overlayHeartRateValueEl.textContent = Number.isFinite(bpm) ? `${Math.round(bpm)}` : '--';
  }
}

function syncConnectionStatus(message, state) {
  hud.setStatus?.(message, state);
  if (state) {
    logSessionEvent('connection-status', { state, message });
  }
  if (state === 'connected') {
    updateConnectionStatus('Connected', 'ok');
  } else if (state === 'reconnecting') {
    updateConnectionStatus('Reconnecting…', 'reconnecting');
  } else if (state === 'connecting') {
    updateConnectionStatus('Connecting…');
  } else if (state === 'error') {
    updateConnectionStatus(message || 'Connection error', 'error');
  } else if (state === 'disconnected') {
    updateConnectionStatus(message || 'Disconnected', 'error');
  }
}

function updateStepCount(stepCount) {
  if (!Number.isFinite(stepCount)) {
    return;
  }
  const normalizedSteps = Math.max(0, Math.round(stepCount));
  hud.updateSteps?.(normalizedSteps);
  updateOverlayStepsDisplay(normalizedSteps);
  const stepDelta = Math.max(0, normalizedSteps - previousStepCount);
  const iterations = stepDelta > 0 ? Math.min(stepDelta, 10) : 0;
  for (let i = 0; i < iterations; i += 1) {
    spawner.trigger({
      mood: hud.getMood?.(),
      stepCount: normalizedSteps,
    });
  }
  previousStepCount = normalizedSteps;
  logStepUpdate(normalizedSteps);
}

function updateHeartRate(bpm) {
  if (!Number.isFinite(bpm)) {
    return;
  }
  const normalizedBpm = Math.max(0, Math.round(bpm));
  const changed = normalizedBpm !== previousHeartRate;
  previousHeartRate = normalizedBpm;
  hud.updateHeartRate?.(normalizedBpm);
  updateOverlayHeartRateDisplay(normalizedBpm);
  sessionState.music.bpm = normalizedBpm;
  if (changed) {
    logSessionEvent('bpm-update', {
      steps: hud.getLastStepCount?.(),
      bpm: normalizedBpm,
    });
  }
}

function handleBridgePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return;
  }

  const summary = {};

  if (typeof payload.steps === 'number') {
    summary.steps = Math.round(Number(payload.steps));
    updateStepCount(payload.steps);
  }

  if (typeof payload.bpm === 'number') {
    summary.bpm = Math.round(Number(payload.bpm));
    updateHeartRate(payload.bpm);
  }

  if (typeof payload.playlist === 'string') {
    sessionState.music.playlist = payload.playlist;
    logSessionEvent('playlist-update', {
      steps: hud.getLastStepCount?.(),
      playlist: payload.playlist,
    });
  }

  if (typeof payload.device === 'string' && payload.device.trim()) {
    summary.device = payload.device.trim();
    sessionState.device = summary.device;
  }

  if (Object.keys(summary).length > 0) {
    logSessionEvent('bridge-message', summary);
    sessionState.latestBridgePayload = summary;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
}

function scheduleReconnect() {
  if (intentionallyClosed) {
    return;
  }
  clearReconnectTimer();
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    connectToBridge();
  }, RECONNECT_DELAY_MS);
}

function disconnectBridge({ intentional = false } = {}) {
  intentionallyClosed = intentional;
  clearReconnectTimer();
  if (bridgeSocket) {
    const socket = bridgeSocket;
    bridgeSocket = undefined;
    try {
      socket.onopen = null;
      socket.onclose = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.close();
    } catch (error) {
      console.warn('[renderer] Error while closing bridge socket:', error);
    }
  }
}

function connectToBridge({ manual = false } = {}) {
  disconnectBridge({ intentional: true });
  intentionallyClosed = false;
  clearReconnectTimer();

  const targetUrl = BRIDGE_URL;
  try {
    bridgeSocket = new WebSocket(targetUrl);
  } catch (error) {
    console.error('[renderer] Failed to create WebSocket connection:', error);
    syncConnectionStatus(`Unable to open ${targetUrl}`, 'error');
    scheduleReconnect();
    return;
  }

  const socket = bridgeSocket;
  syncConnectionStatus(
    manual ? `Reconnecting to Google Fit bridge…` : `Connecting to Google Fit bridge…`,
    manual ? 'reconnecting' : 'connecting',
  );

  socket.onopen = () => {
    if (bridgeSocket !== socket) {
      return;
    }
    syncConnectionStatus('Connected to Google Fit bridge', 'connected');
  };

  socket.onmessage = (event) => {
    if (bridgeSocket !== socket) {
      return;
    }
    try {
      const payload = JSON.parse(event.data);
      handleBridgePayload(payload);
    } catch (error) {
      console.error('[renderer] Malformed payload from bridge:', error, event.data);
      syncConnectionStatus('Received malformed data – waiting for next update', 'error');
    }
  };

  socket.onclose = () => {
    if (bridgeSocket !== socket) {
      return;
    }
    bridgeSocket = undefined;
    if (intentionallyClosed) {
      syncConnectionStatus('Disconnected from Google Fit bridge', 'disconnected');
      return;
    }
    syncConnectionStatus('Connection closed. Reconnecting…', 'reconnecting');
    scheduleReconnect();
  };

  socket.onerror = (event) => {
    if (bridgeSocket !== socket) {
      return;
    }
    console.error('[renderer] Bridge socket error:', event);
    syncConnectionStatus('Connection error. Retrying…', 'error');
    try {
      socket.close();
    } catch (error) {
      console.warn('[renderer] Failed to close errored socket:', error);
    }
  };
}

if (overlayReconnectButton) {
  overlayReconnectButton.addEventListener('click', () => {
    logSessionEvent('bridge-reconnect-requested');
    disconnectBridge({ intentional: true });
    intentionallyClosed = false;
    connectToBridge({ manual: true });
  });
}

connectToBridge();

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
  disconnectBridge({ intentional: true });
  spawner.clear?.();
  stopFxSpawnLoop();
  stopTagHallucinationLoop();
});

function pickRandomItem(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return undefined;
  }
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

function readSelectedTag() {
  try {
    return window?.localStorage?.getItem(SELECTED_TAG_STORAGE_KEY) ?? null;
  } catch (error) {
    console.warn('[renderer] Unable to read selected tag:', error);
    return null;
  }
}

function normalizeIntervalRange(range) {
  if (!Array.isArray(range) || range.length < 2) {
    return null;
  }
  const [rawMin, rawMax] = range;
  const min = Number.isFinite(rawMin) ? rawMin : null;
  const max = Number.isFinite(rawMax) ? rawMax : null;
  if (min === null || max === null) {
    return null;
  }
  if (max < min) {
    return [max, min];
  }
  return [min, max];
}

function getHallucinationIntervalRange(mood = hallucinationMood) {
  const mapping = hallucinationEffectMap;
  if (!mapping) {
    return HALLUCINATION_INTERVAL_FALLBACK;
  }

  const moodSpecific = mapping.intervals?.[mood];
  const intervalRange = normalizeIntervalRange(moodSpecific) ?? normalizeIntervalRange(mapping.intervalMs);
  return intervalRange ?? HALLUCINATION_INTERVAL_FALLBACK;
}

function getHallucinationDelay(mood = hallucinationMood) {
  const [min, max] = getHallucinationIntervalRange(mood);
  if (max <= min) {
    return Math.max(0, min);
  }
  const span = max - min;
  return Math.floor(Math.random() * span) + min;
}

function getEffectDurationMs() {
  return Math.floor(Math.random() * 2000) + 1000;
}

async function ensureHallucinationEffectMap() {
  if (hallucinationEffectMap) {
    return hallucinationEffectMap;
  }
  if (!hallucinationEffectMapPromise) {
    hallucinationEffectMapPromise = fetch('./effects/effect-mapping.json', { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load effect mapping (${response.status})`);
        }
        return response.json();
      })
      .then((json) => {
        hallucinationEffectMap = json || {};
        return hallucinationEffectMap;
      })
      .catch((error) => {
        hallucinationEffectMapPromise = null;
        console.warn('[renderer] Unable to load hallucination effect mapping:', error);
        throw error;
      });
  }
  return hallucinationEffectMapPromise;
}

function resolveMoodFromTag(tagValue) {
  const mapping = hallucinationEffectMap;
  if (!mapping) {
    return HALLUCINATION_DEFAULT_MOOD;
  }

  const fallbackMood =
    (mapping.defaultMood && mapping.moods?.[mapping.defaultMood]
      ? mapping.defaultMood
      : null) || HALLUCINATION_DEFAULT_MOOD;
  if (tagValue) {
    const tagMoodMap = mapping.tagMoodMap || mapping.tags;
    if (tagMoodMap?.[tagValue] && mapping.moods?.[tagMoodMap[tagValue]]) {
      return tagMoodMap[tagValue];
    }
    if (mapping.moods?.[tagValue]) {
      return tagValue;
    }
  }
  return fallbackMood;
}

function queueNextHallucination(delayOverride) {
  if (!hallucinationCanvas || !hallucinationEffectMap) {
    return;
  }
  window.clearTimeout(hallucinationTimer);
  const delay =
    typeof delayOverride === 'number' && delayOverride >= 0
      ? delayOverride
      : getHallucinationDelay(hallucinationMood);

  hallucinationTimer = window.setTimeout(() => {
    const triggered = triggerTagHallucinationEffect();
    const followUpDelay = triggered ? getHallucinationDelay(hallucinationMood) : 1000;
    queueNextHallucination(followUpDelay);
  }, delay);
}

function syncMoodToTag(tagValue, { forceReschedule = false } = {}) {
  lastSelectedTagValue = tagValue ?? null;
  if (!hallucinationEffectMap) {
    hallucinationMood = HALLUCINATION_DEFAULT_MOOD;
    return;
  }
  const nextMood = resolveMoodFromTag(tagValue);
  if (nextMood !== hallucinationMood || forceReschedule) {
    hallucinationMood = nextMood;
    if (hallucinationCanvas) {
      queueNextHallucination(forceReschedule ? 0 : undefined);
    }
  }
}

function triggerTagHallucinationEffect() {
  if (hallucinationEffectActive || !hallucinationCanvas || !hallucinationEffectMap) {
    return false;
  }

  const moodKey = hallucinationEffectMap.moods?.[hallucinationMood]
    ? hallucinationMood
    : resolveMoodFromTag(lastSelectedTagValue);
  const effects = hallucinationEffectMap.moods?.[moodKey];
  if (!effects || effects.length === 0) {
    return false;
  }
  const effectName = pickRandomItem(effects);
  const handler = HALLUCINATION_EFFECT_HANDLERS[effectName];
  if (typeof handler !== 'function') {
    return false;
  }

  const zones = hallucinationEffectMap.zones?.[moodKey] || hallucinationEffectMap.zones?.default || ['center'];
  const zone = pickRandomItem(zones) || 'center';
  const duration = getEffectDurationMs();
  const unclip = typeof withZoneClip === 'function' ? withZoneClip(hallucinationCanvas, zone) : () => {};

  hallucinationEffectActive = true;
  try {
    handler(hallucinationCanvas, duration);
  } catch (error) {
    console.warn('[renderer] Unable to trigger hallucination effect:', error);
    unclip();
    hallucinationEffectActive = false;
    return false;
  }

  window.setTimeout(() => {
    unclip();
    hallucinationEffectActive = false;
  }, duration + 80);

  return true;
}

function handleSelectedTagStorageChange(event) {
  if (event.key !== SELECTED_TAG_STORAGE_KEY) {
    return;
  }
  syncMoodToTag(event.newValue, { forceReschedule: true });
}

function startTagWatcher() {
  if (hallucinationTagPollTimer) {
    return;
  }
  hallucinationTagPollTimer = window.setInterval(() => {
    const latestValue = readSelectedTag();
    if (latestValue !== lastSelectedTagValue) {
      syncMoodToTag(latestValue, { forceReschedule: true });
    }
  }, HALLUCINATION_TAG_POLL_INTERVAL);
}

function attachTagStorageListener() {
  if (tagStorageListenerAttached) {
    return;
  }
  window.addEventListener('storage', handleSelectedTagStorageChange);
  tagStorageListenerAttached = true;
}

function detachTagStorageListener() {
  if (!tagStorageListenerAttached) {
    return;
  }
  window.removeEventListener('storage', handleSelectedTagStorageChange);
  tagStorageListenerAttached = false;
}

async function startTagHallucinationLoop() {
  if (hallucinationLoopStarted) {
    return;
  }
  const canvasEl = document.getElementById('fx-canvas');
  if (!canvasEl) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startTagHallucinationLoop, { once: true });
    }
    return;
  }
  hallucinationLoopStarted = true;
  hallucinationCanvas = canvasEl;
  try {
    await ensureHallucinationEffectMap();
  } catch (error) {
    hallucinationLoopStarted = false;
    return;
  }
  const initialTag = readSelectedTag();
  syncMoodToTag(initialTag, { forceReschedule: true });
  startTagWatcher();
  attachTagStorageListener();
}

function stopTagHallucinationLoop() {
  window.clearTimeout(hallucinationTimer);
  window.clearInterval(hallucinationTagPollTimer);
  hallucinationTimer = null;
  hallucinationTagPollTimer = null;
  hallucinationEffectActive = false;
  detachTagStorageListener();
  hallucinationLoopStarted = false;
  hallucinationCanvas = null;
}
