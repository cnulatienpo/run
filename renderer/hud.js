const STATUS_CLASS_PREFIX = 'status--';
const STATUS_MESSAGES = {
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  error: 'Connection issue',
  disconnected: 'Disconnected',
};

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

export function initialiseHud({ sessionLog }) {
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
  const currentState = {
    mood: moodSelect?.value || 'dreamlike',
    bpm: bpmSelect?.value || '120',
    playlist: 'Untitled Session',
  };

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
      sessionLog.push({
        timestamp: new Date().toISOString(),
        steps: lastStepCount,
        tag: 'playlist-start',
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
      sessionLog.push({
        timestamp: new Date().toISOString(),
        steps: lastStepCount,
        tag: 'playlist-stop',
        playlist: currentState.playlist,
      });
    }
    updateTimerDisplay();
  });

  moodSelect?.addEventListener('change', () => {
    currentState.mood = moodSelect.value;
    const label = moodSelect.options[moodSelect.selectedIndex]?.textContent;
    if (label && moodLabelEl) {
      moodLabelEl.textContent = label;
    }
    sessionLog.push({
      timestamp: new Date().toISOString(),
      steps: lastStepCount,
      tag: 'mood-change',
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
    sessionLog.push({
      timestamp: new Date().toISOString(),
      steps: lastStepCount,
      bpm: Number(currentState.bpm),
    });
  });

  tagButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tag = button.dataset.tag;
      if (!tag) return;
      let action;
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
        button.classList.remove('is-active');
        action = 'removed';
      } else {
        selectedTags.add(tag);
        button.classList.add('is-active');
        action = 'added';
      }
      sessionLog.push({
        timestamp: new Date().toISOString(),
        steps: lastStepCount,
        tag,
        tagAction: action,
      });
    });
  });

  assetPackSelect?.addEventListener('change', () => {
    sessionLog.push({
      timestamp: new Date().toISOString(),
      steps: lastStepCount,
      tag: 'asset-pack',
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
