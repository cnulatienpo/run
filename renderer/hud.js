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

const moodOptions = {
  dreamcore: {
    name: 'Dreamcore',
    playlistUrl: 'https://music.youtube.com/playlist?list=PLXXXXXXX_DREAM',
    // Replace the sample entries below with actual track URLs for Dreamcore sessions.
    playlistUrls: [
      'https://music.youtube.com/watch?v=dream001',
      'https://music.youtube.com/watch?v=dream002',
      'https://music.youtube.com/watch?v=dream003',
    ],
  },
  ambient: {
    name: 'Ambient',
    playlistUrl: 'https://music.youtube.com/playlist?list=PLXXXXXXX_AMB',
    // Replace the sample entries below with actual track URLs for Ambient sessions.
    playlistUrls: [
      'https://music.youtube.com/watch?v=ambient001',
      'https://music.youtube.com/watch?v=ambient002',
      'https://music.youtube.com/watch?v=ambient003',
    ],
  },
  hype: {
    name: 'Hype',
    playlistUrl: 'https://music.youtube.com/playlist?list=PLXXXXXXX_HYPE',
    // Replace the sample entries below with actual track URLs for Hype sessions.
    playlistUrls: [
      'https://music.youtube.com/watch?v=hype001',
      'https://music.youtube.com/watch?v=hype002',
      'https://music.youtube.com/watch?v=hype003',
    ],
  },
  rare: {
    name: 'Rare',
    playlistUrl: 'https://music.youtube.com/playlist?list=PLXXXXXXX_RARE',
    // Replace the sample entries below with actual track URLs for Rare Drop sessions.
    playlistUrls: [
      'https://music.youtube.com/watch?v=rare001',
      'https://music.youtube.com/watch?v=rare002',
      'https://music.youtube.com/watch?v=rare003',
    ],
  },
};

const playlistCycleState = new Map();

function getPlaylistEntriesForMood(moodKey) {
  const urls = moodOptions[moodKey]?.playlistUrls;
  if (!Array.isArray(urls)) {
    return [];
  }
  return urls
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter((url) => url.length > 0);
}

function shufflePlaylist(urls) {
  const list = urls.slice();
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function getNextPlaylistEntryForMood(moodKey, { resetCycle = false } = {}) {
  if (!moodKey) {
    return null;
  }

  const entries = getPlaylistEntriesForMood(moodKey);
  if (entries.length === 0) {
    const fallback = moodOptions[moodKey]?.playlistUrl;
    return fallback ? { url: fallback, fromLocalList: false } : null;
  }

  if (resetCycle) {
    playlistCycleState.delete(moodKey);
  }

  let state = playlistCycleState.get(moodKey);
  if (!state || state.index >= state.urls.length) {
    state = {
      urls: shufflePlaylist(entries),
      index: 0,
    };
  }

  const url = state.urls[state.index];
  state.index += 1;
  playlistCycleState.set(moodKey, state);

  return url ? { url, fromLocalList: true } : null;
}

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
  const heartRateEl = document.getElementById('heart-rate');
  const heartRateStatusEl = document.getElementById('heart-rate-status');
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
  const playlistFrame = document.getElementById('ytmusic-frame');
  const playlistNextButton = document.getElementById('playlist-next');
  const assetPackContainer = document.getElementById('asset-pack-container');
  const assetPackSelect = document.getElementById('asset-pack');
  const hudControlsContainer =
    document.getElementById('hud-controls') || document.querySelector('.hud-controls') || document.body;
  const backgroundVideo = document.getElementById('background-video');

  let infoHud = document.getElementById('floating-info-hud');
  if (!infoHud) {
    infoHud = document.createElement('div');
    infoHud.id = 'floating-info-hud';
    infoHud.style.position = 'fixed';
    infoHud.style.top = '20px';
    infoHud.style.right = '20px';
    infoHud.style.padding = '8px 12px';
    infoHud.style.background = 'rgba(0, 0, 0, 0.6)';
    infoHud.style.color = '#fff';
    infoHud.style.borderRadius = '8px';
    infoHud.style.fontFamily = 'sans-serif';
    infoHud.style.fontSize = '14px';
    infoHud.style.zIndex = '9999';
    document.body.appendChild(infoHud);
  }

  const autoMuteWrapper = document.createElement('div');
  autoMuteWrapper.className = 'auto-mute-toggle';
  autoMuteWrapper.style.display = 'flex';
  autoMuteWrapper.style.alignItems = 'center';
  autoMuteWrapper.style.gap = '8px';

  const autoMuteToggle = document.createElement('input');
  autoMuteToggle.type = 'checkbox';
  autoMuteToggle.id = 'auto-mute-toggle';
  autoMuteToggle.checked = true;

  const autoMuteLabel = document.createElement('label');
  autoMuteLabel.htmlFor = 'auto-mute-toggle';
  autoMuteLabel.textContent = 'Auto-mute Background Video';

  autoMuteWrapper.appendChild(autoMuteToggle);
  autoMuteWrapper.appendChild(autoMuteLabel);

  if (playlistButton) {
    const playlistPanel = playlistButton.closest('.panel');
    if (playlistPanel) {
      playlistPanel.appendChild(autoMuteWrapper);
    } else if (hudControlsContainer) {
      hudControlsContainer.appendChild(autoMuteWrapper);
    } else {
      document.body.appendChild(autoMuteWrapper);
    }
  }

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
    currentTrackUrl: null,
    heartRate: null,
  };

  let musicPlaying = false;

  updatePlaylistControlsForMood(currentState.mood);

  function updatePlaylistControlsForMood(moodKey) {
    if (!playlistNextButton) {
      return;
    }
    const hasLocalPlaylist = getPlaylistEntriesForMood(moodKey).length > 0;
    playlistNextButton.disabled = !hasLocalPlaylist;
    playlistNextButton.title = hasLocalPlaylist
      ? 'Load another track from the local playlist.'
      : 'Add track URLs for this mood in hud.js to enable shuffling.';
  }

  function openPlaylistForMood(
    moodKey,
    { resetCycle = false, triggeredBy = 'mood-change' } = {},
  ) {
    if (!moodKey) {
      return;
    }

    const entry = getNextPlaylistEntryForMood(moodKey, { resetCycle });
    if (!entry) {
      console.warn('[hud] No playlist entry available for mood:', moodKey);
      return;
    }

    const { url, fromLocalList } = entry;
    if (playlistFrame) {
      playlistFrame.src = url;
    } else {
      let opened = false;
      try {
        const electronShell = window?.electron?.shell ?? window?.electronAPI?.shell;
        if (electronShell && typeof electronShell.openExternal === 'function') {
          electronShell.openExternal(url);
          opened = true;
        }
      } catch (error) {
        console.warn('[hud] Unable to open playlist via Electron shell:', error);
      }
      if (!opened) {
        window.open(url, '_blank', 'noopener');
      }
    }

    currentState.currentTrackUrl = fromLocalList ? url : null;
    updatePlaylistControlsForMood(moodKey);
    updateFloatingHUD();
    logEvent('playlist-track-change', {
      steps: lastStepCount,
      mood: moodKey,
      url,
      fromLocalList,
      triggeredBy,
    });
  }

  function updateVideoMute(isPlaying) {
    if (!backgroundVideo) {
      return;
    }
    if (isPlaying && autoMuteToggle.checked) {
      backgroundVideo.muted = true;
      console.log('[hud] Background video muted');
    } else if (!isPlaying) {
      backgroundVideo.muted = false;
      console.log('[hud] Background video unmuted');
    } else if (!autoMuteToggle.checked) {
      backgroundVideo.muted = false;
      console.log('[hud] Auto-mute disabled: background video unmuted');
    }
  }

  function getMoodLabelText(moodKey) {
    return (
      moodOptions[moodKey]?.name ||
      effectMap.labels?.[moodKey] ||
      moodKey ||
      'None'
    );
  }

  function getTagDisplay() {
    if (selectedTags.size > 0) {
      return Array.from(selectedTags).join(', ');
    }
    return 'None';
  }

  function updateFloatingHUD() {
    if (!infoHud) {
      return;
    }
    const moodLabel = getMoodLabelText(currentState.mood);
    const playlistName = currentState.playlist || 'None';
    const stepText = Number.isFinite(lastStepCount) ? lastStepCount.toLocaleString() : '0';
    const heartText = Number.isFinite(currentState.heartRate)
      ? `${currentState.heartRate} bpm`
      : '—';
    let musicSource = playlistName;
    if (musicPlaying) {
      musicSource =
        currentState.currentTrackUrl && playlistName !== 'None'
          ? `${playlistName} (Track queued)`
          : playlistName;
    } else if (currentState.currentTrackUrl) {
      musicSource = playlistName !== 'None' ? `Queued • ${playlistName}` : 'Track queued';
    }
    infoHud.textContent = `Tag: ${getTagDisplay()} | Mood: ${moodLabel} | Music: ${musicSource} | Steps: ${stepText} | Heart: ${heartText}`;
  }

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
    const hasNumber = typeof stepCount === 'number' && Number.isFinite(stepCount);
    if (hasNumber) {
      lastStepCount = stepCount;
    }
    if (stepsEl) {
      stepsEl.textContent = hasNumber ? stepCount.toLocaleString() : '—';
    }
    if (lastUpdateEl) {
      const now = new Date();
      const detail = hasNumber ? `${stepCount} steps` : 'No recent data';
      lastUpdateEl.textContent = `Last update: ${now.toLocaleTimeString()} (${detail})`;
    }
    updateFloatingHUD();
  }

  function updateHeartRate(bpm) {
    const isValid = Number.isFinite(bpm);
    const normalized = isValid ? Math.max(0, Math.round(bpm)) : null;

    if (heartRateEl) {
      heartRateEl.textContent = normalized !== null ? `${normalized}` : '--';
    }

    if (heartRateStatusEl) {
      if (normalized !== null) {
        const now = new Date();
        heartRateStatusEl.textContent = `Last BPM update: ${now.toLocaleTimeString()} (${normalized} bpm)`;
      } else {
        heartRateStatusEl.textContent = 'Waiting for heart rate data…';
      }
    }

    currentState.heartRate = normalized;
    updateFloatingHUD();
  }

  function ensureTimerRunning() {
    if (timerInterval) {
      return;
    }
    timerInterval = window.setInterval(updateTimerDisplay, 1000);
  }

  playlistButton?.addEventListener('click', () => {
    const isStarting = !sessionStartTime;
    if (isStarting) {
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
      musicPlaying = true;
      updateVideoMute(true);
      openPlaylistForMood(currentState.mood, {
        resetCycle: true,
        triggeredBy: 'playlist-start',
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
      musicPlaying = false;
      updateVideoMute(false);
      currentState.currentTrackUrl = null;
    }
    updateTimerDisplay();
    updateFloatingHUD();
  });

  playlistNextButton?.addEventListener('click', () => {
    openPlaylistForMood(currentState.mood, { triggeredBy: 'manual-next' });
    if (musicPlaying) {
      updateVideoMute(true);
    }
  });

  moodSelect?.addEventListener('change', () => {
    currentState.mood = moodSelect.value;
    persistMood(currentState.mood);
    const label = moodSelect.options[moodSelect.selectedIndex]?.textContent;
    if (label && moodLabelEl) {
      moodLabelEl.textContent = label;
    }
    setMood(currentState.mood);
    updatePlaylistControlsForMood(currentState.mood);
    openPlaylistForMood(currentState.mood, {
      resetCycle: true,
      triggeredBy: 'mood-change',
    });
    updateFloatingHUD();
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

  if (currentState.mood) {
    setMood(currentState.mood);
  }

  bpmSelect?.addEventListener('change', () => {
    currentState.bpm = bpmSelect.value;
    logEvent('bpm-change', {
      steps: lastStepCount,
      bpm: Number(currentState.bpm),
    });
    updateFloatingHUD();
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
      updateFloatingHUD();
    });
  });

  autoMuteToggle.addEventListener('change', () => {
    logEvent('auto-mute-toggle', {
      enabled: autoMuteToggle.checked,
      steps: lastStepCount,
    });
    if (musicPlaying) {
      updateVideoMute(true);
    } else if (!autoMuteToggle.checked) {
      updateVideoMute(false);
    }
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
  updateFloatingHUD();

  return {
    setStatus,
    updateVersions,
    updateSteps,
    updateHeartRate,
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
