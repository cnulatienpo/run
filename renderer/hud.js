import { setMood, getCurrentMood } from './spawn-loop.js';
import { logTagSelection } from './tag-session-logger.js';
import { loadSettings, saveSettings } from './settings.js';
import effectMap from '../effects/effect-mapping.json' assert { type: 'json' };

const STATUS_CLASS_PREFIX = 'status--';
const STATUS_MESSAGES = {
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  error: 'Connection issue',
  disconnected: 'Disconnected',
};

const MOOD_STORAGE_KEY = 'selectedMood';
const userSettings = loadSettings();

function readStoredMood() {
  const settingsMood =
    typeof userSettings?.defaultMood === 'string' ? userSettings.defaultMood : null;
  if (settingsMood && ensureMoodExists(settingsMood)) {
    return settingsMood;
  }

  try {
    return window?.localStorage?.getItem(MOOD_STORAGE_KEY) ?? null;
  } catch (error) {
    console.warn('[hud] Unable to read stored mood:', error);
    return null;
  }
}

function persistMood(mood) {
  try {
    window?.localStorage?.setItem(MOOD_STORAGE_KEY, mood);
  } catch (error) {
    console.warn('[hud] Unable to persist mood:', error);
  }

  if (typeof mood === 'string') {
    if (userSettings && typeof userSettings === 'object') {
      userSettings.defaultMood = mood;
      saveSettings(userSettings);
    }
  }
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

export function initialiseHud({ sessionLog, logSessionEvent }) {
  const logEvent =
    typeof logSessionEvent === 'function'
      ? logSessionEvent
      : (type, data = {}) => {
          if (!Array.isArray(sessionLog)) {
            return;
          }
          const now = Date.now();
          sessionLog.push({
            type,
            t: now,
            timestamp: now,
            ...data,
          });
        };
  const statusEl = document.getElementById('status');
  const stepsEl = document.getElementById('steps');
  const lastUpdateEl = document.getElementById('last-update');
  const versionSpans = {
    electron: document.getElementById('version-electron'),
    node: document.getElementById('version-node'),
    chrome: document.getElementById('version-chromium'),
  };

  const moodSelect = document.getElementById('mood-select');
  const bpmSelect = document.getElementById('bpm-select');
  const tagButtons = Array.from(document.querySelectorAll('[data-tag]'));
  const timerEl = document.getElementById('session-timer');
  const moodLabelEl = document.getElementById('mood-label');
  const playlistInput = document.getElementById('playlist-input');
  const playlistNameEl = document.getElementById('playlist-name');
  const playlistButton = document.getElementById('playlist-start');
  const playlistStatusEl = document.getElementById('playlist-status');
  const assetPackContainer = document.getElementById('asset-pack-container');
  const assetPackSelect = document.getElementById('asset-pack');

  let lastStepCount = 0;
  let sessionStartTime;
  let timerInterval;
  const selectedTags = new Set();
  const storedDefaultTag =
    typeof userSettings?.defaultTag === 'string' ? userSettings.defaultTag : null;
  const storedMood = readStoredMood();
  if (moodSelect && storedMood && ensureMoodExists(storedMood)) {
    moodSelect.value = storedMood;
  }
  const currentState = {
    mood:
      moodSelect?.value ||
      (ensureMoodExists(effectMap.defaultMood) ? effectMap.defaultMood : getCurrentMood()) ||
      'dreamcore',
    bpm: bpmSelect?.value || '120',
    playlist: 'Untitled Session',
  };

  if (typeof userSettings?.lastPlaylist === 'string') {
    currentState.playlist = userSettings.lastPlaylist;
  }

  if (playlistInput && typeof userSettings?.lastPlaylist === 'string') {
    playlistInput.value = userSettings.lastPlaylist;
    currentState.playlist = userSettings.lastPlaylist;
  }

  if (playlistNameEl && typeof userSettings?.lastPlaylist === 'string') {
    playlistNameEl.textContent = userSettings.lastPlaylist;
  }

  if (storedDefaultTag) {
    const defaultButton = tagButtons.find((button) => button.dataset.tag === storedDefaultTag);
    if (defaultButton) {
      selectedTags.add(storedDefaultTag);
      defaultButton.classList.add('is-active');
    }
  }

  function updateTimerDisplay() {
    if (!sessionStartTime) {
      timerEl.textContent = '00:00:00';
      return;
    }
    const totalSeconds = (Date.now() - sessionStartTime) / 1000;
    timerEl.textContent = formatDuration(totalSeconds);
  }

  function setStatus(message, state) {
    if (!statusEl) return;
    const classNames = statusEl.className
      .split(' ')
      .filter((cls) => !cls.startsWith(STATUS_CLASS_PREFIX));
    if (state) {
      classNames.push(`${STATUS_CLASS_PREFIX}${state}`);
    }
    statusEl.className = classNames.join(' ').trim();
    statusEl.textContent = message ?? STATUS_MESSAGES[state] ?? 'Unknown state';
  }

  function updateVersions(versions = {}) {
    Object.entries(versionSpans).forEach(([key, element]) => {
      if (!element) return;
      const value = versions[key] ?? 'unknown';
      element.textContent = value;
    });
  }

  function updateSteps(stepCount) {
    lastStepCount = stepCount;
    if (stepsEl) {
      stepsEl.textContent = stepCount.toLocaleString();
    }
    if (lastUpdateEl) {
      const now = new Date();
      lastUpdateEl.textContent = `Last update: ${now.toLocaleTimeString()} (${stepCount} steps)`;
    }
  }

  function ensureTimerRunning() {
    if (timerInterval) {
      return;
    }
    timerInterval = window.setInterval(updateTimerDisplay, 1000);
  }

  playlistButton?.addEventListener('click', () => {
    if (!sessionStartTime) {
      sessionStartTime = Date.now();
      ensureTimerRunning();
      playlistButton.textContent = 'Stop';
      playlistStatusEl.textContent = 'Live';
      const name = playlistInput.value.trim() || 'Untitled Session';
      currentState.playlist = name;
      playlistNameEl.textContent = name;
      if (userSettings && typeof userSettings === 'object') {
        userSettings.lastPlaylist = name;
        saveSettings(userSettings);
      }
      logEvent('playlist-start', {
        steps: lastStepCount,
        playlist: name,
      });
    } else {
      sessionStartTime = undefined;
      if (timerInterval) {
        window.clearInterval(timerInterval);
        timerInterval = undefined;
      }
      playlistButton.textContent = 'Start';
      playlistStatusEl.textContent = 'Idle';
      logEvent('playlist-stop', {
        steps: lastStepCount,
        playlist: currentState.playlist,
      });
    }
    updateTimerDisplay();
  });

  moodSelect?.addEventListener('change', (event) => {
    currentState.mood = moodSelect.value;
    persistMood(currentState.mood);
    const label = moodSelect.options[moodSelect.selectedIndex]?.textContent;
    if (label && moodLabelEl) {
      moodLabelEl.textContent = label;
    }
    logEvent('mood-change', {
      steps: lastStepCount,
      mood: currentState.mood,
    });
  });

  if (moodSelect && moodLabelEl) {
    const initialLabel = moodSelect.options[moodSelect.selectedIndex]?.textContent;
    if (initialLabel) {
      moodLabelEl.textContent = initialLabel;
    }
  }

  bpmSelect?.addEventListener('change', () => {
    currentState.bpm = bpmSelect.value;
    logEvent('bpm-change', {
      steps: lastStepCount,
      bpm: Number(currentState.bpm),
    });
  });

  tagButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tag = button.dataset.tag;
      if (!tag) return;
      const wasSelected = selectedTags.has(tag);
      const action = wasSelected ? 'deselected' : 'selected';
      if (wasSelected) {
        selectedTags.delete(tag);
        button.classList.remove('is-active');
        logEvent('tagDeselected', { tag, source: 'primary-hud' });
      } else {
        selectedTags.add(tag);
        button.classList.add('is-active');
        logEvent('tagSelected', { tag, source: 'primary-hud' });
        logTagSelection(tag, 'primary-hud');
        if (userSettings && typeof userSettings === 'object') {
          userSettings.defaultTag = tag;
          saveSettings(userSettings);
        }
      }
      logEvent('tag-toggle', {
        steps: lastStepCount,
        tag,
        tagAction: action,
      });
    });
  });

  assetPackSelect?.addEventListener('change', () => {
    logEvent('asset-pack-change', {
      steps: lastStepCount,
      assetPack: assetPackSelect.value,
    });
  });

  async function loadAssetPacks() {
    if (!assetPackContainer || !assetPackSelect) {
      return;
    }

    try {
      const metadata = await fetchJson('./assets/metadata.json');
      const packs = Array.isArray(metadata?.packs) ? metadata.packs : metadata;
      if (Array.isArray(packs) && packs.length > 0) {
        assetPackSelect.innerHTML = '';
        packs.forEach((pack) => {
          if (!pack?.id) return;
          const option = document.createElement('option');
          option.value = pack.id;
          option.textContent = pack.name || pack.id;
          assetPackSelect.appendChild(option);
        });
        assetPackContainer.hidden = false;
      } else {
        assetPackContainer.hidden = true;
      }
    } catch (error) {
      assetPackContainer.hidden = true;
      console.warn('[hud] Unable to load asset packs:', error);
    }
  }

  updateTimerDisplay();

  return {
    setStatus,
    updateVersions,
    updateSteps,
    getMood: () => currentState.mood,
    getBpm: () => Number(currentState.bpm),
    getSelectedTags: () => Array.from(selectedTags),
    getPlaylistName: () => currentState.playlist,
    getLastStepCount: () => lastStepCount,
    loadAssetPacks,
  };
}

function getPrimaryMoodSelect() {
  return document.getElementById('mood-select');
}

function getMoodLabel(mood) {
  const labelFromConfig = effectMap.labels?.[mood];
  if (labelFromConfig) {
    return labelFromConfig;
  }

  const primarySelect = getPrimaryMoodSelect();
  if (primarySelect) {
    const option = Array.from(primarySelect.options).find((item) => item.value === mood);
    if (option?.textContent) {
      return option.textContent.trim();
    }
  }

  return mood;
}

function ensureMoodExists(mood) {
  if (!mood) {
    return false;
  }
  return Boolean(effectMap.moods?.[mood]);
}

export function createMoodSelectorHUD() {
  if (!document?.body) {
    return null;
  }

  const existing = document.getElementById('hud-mood-selector');
  if (existing) {
    return existing;
  }

  const moodKeys = Object.keys(effectMap.moods || {});
  if (moodKeys.length === 0) {
    console.warn('[hud] No moods available for selector');
    return null;
  }

  const container = document.createElement('div');
  container.id = 'hud-mood-selector';
  container.style.position = 'fixed';
  container.style.top = '20px';
  container.style.left = '20px';
  container.style.zIndex = '9999';
  container.style.background = 'rgba(0, 0, 0, 0.7)';
  container.style.color = '#fff';
  container.style.padding = '10px 14px';
  container.style.borderRadius = '10px';
  container.style.fontSize = '14px';
  container.style.fontFamily = 'sans-serif';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '8px';
  container.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.25)';

  const title = document.createElement('div');
  title.textContent = '🎛️ Mood Selector';
  title.style.fontWeight = '600';
  title.style.marginBottom = '6px';
  container.appendChild(title);

  const buttons = new Map();

  function updateActiveMood(mood) {
    title.textContent = `🎛️ Mood: ${getMoodLabel(mood)}`;
    buttons.forEach((button, buttonMood) => {
      if (buttonMood === mood) {
        button.style.background = '#2563eb';
        button.style.color = '#f9fafb';
        button.style.boxShadow = '0 0 0 1px rgba(37, 99, 235, 0.5)';
      } else {
        button.style.background = '#1f2937';
        button.style.color = '#e5e7eb';
        button.style.boxShadow = 'none';
      }
    });
  }

  function applyMood(mood) {
    if (!ensureMoodExists(mood)) {
      console.warn('[hud] Cannot apply unknown mood:', mood);
      return;
    }

    updateActiveMood(mood);
    persistMood(mood);
    setMood(mood);

    const primarySelect = getPrimaryMoodSelect();
    if (primarySelect && primarySelect.value !== mood) {
      const optionExists = Array.from(primarySelect.options).some((option) => option.value === mood);
      if (optionExists) {
        primarySelect.value = mood;
        primarySelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  moodKeys.forEach((mood) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = getMoodLabel(mood);
    button.style.padding = '6px 10px';
    button.style.borderRadius = '6px';
    button.style.border = 'none';
    button.style.background = '#1f2937';
    button.style.color = '#e5e7eb';
    button.style.cursor = 'pointer';
    button.style.transition = 'transform 0.12s ease, background 0.2s ease';
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-1px)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'none';
    });
    button.addEventListener('click', () => applyMood(mood));
    buttons.set(mood, button);
    container.appendChild(button);
  });

  const primarySelect = getPrimaryMoodSelect();
  if (primarySelect) {
    primarySelect.addEventListener('change', () => {
      const newMood = primarySelect.value;
      if (ensureMoodExists(newMood)) {
        updateActiveMood(newMood);
      }
    });
  }

  const initialMood = (() => {
    if (primarySelect && ensureMoodExists(primarySelect.value)) {
      return primarySelect.value;
    }
    if (effectMap.defaultMood && ensureMoodExists(effectMap.defaultMood)) {
      return effectMap.defaultMood;
    }
    return moodKeys[0];
  })();

  applyMood(initialMood);

  document.body.appendChild(container);

  return container;
}
