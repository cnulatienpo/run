import { createNetworkClient } from './renderer/network.js';
import { initHUD } from './renderer/hud.js';
import {
  startSpawnLoop,
  stopSpawnLoop,
  setActiveTag,
} from './renderer/spawn-loop.js';
import {
  initialiseSessionLog,
  logSessionEvent,
  logStepUpdate,
  logBpmUpdate,
  logBpmChange,
  logMoodChange,
  logTagSelection,
  logPlaylistState,
  exportSessionLog,
} from './renderer/tag-session-logger.js';
import { initDebugControls as initEffectDebugControls } from './effects/debug-controls.js';
import './effects/session-replay.js';
import {
  notifyStep,
  startStillnessWatcher,
  switchEffectPack,
  monitorEnvironment,
  getCurrentVideoTitle,
} from './mood/session-pacing.js';

const WS_URL = window.preloadConfig?.WS_URL || window.RTW_WS_URL || 'ws://localhost:6789';

let networkClient;
let sessionActive = false;
let hudApi;
let debugPanel;

function updateVersionBadges() {
  const versions = window.electronInfo?.versions;
  if (!versions) {
    return;
  }
  const electronEl = document.getElementById('version-electron');
  const nodeEl = document.getElementById('version-node');
  const chromeEl = document.getElementById('version-chromium');
  if (electronEl) {
    electronEl.textContent = versions.electron ?? 'unknown';
  }
  if (nodeEl) {
    nodeEl.textContent = versions.node ?? 'unknown';
  }
  if (chromeEl) {
    chromeEl.textContent = versions.chrome ?? 'unknown';
  }
}

function updateSpawnTag() {
  if (!sessionActive) {
    setActiveTag(null);
    return;
  }
  const nextTag = hudApi?.getPrimaryTag();
  setActiveTag(nextTag ?? null);
  if (sessionActive && nextTag) {
    startSpawnLoop({ tag: nextTag });
  }
}

function handleMoodChange(moodKey, meta) {
  logMoodChange(moodKey, 'hud');
  if (meta?.name) {
    hudApi.updateMusicSource(meta.name);
  }
  if (sessionActive) {
    logPlaylistState('mood-sync', {
      mood: moodKey,
      playlist: meta?.name ?? moodKey,
    });
  }
  updateSpawnTag();
}

function handleBpmChange(bpmValue) {
  logBpmChange(bpmValue, 'hud');
}

function handleTagToggle(tagKey, isActive, meta = {}) {
  logTagSelection(tagKey, 'HUD', { action: isActive ? 'selected' : 'deselected', label: meta.label });
  if (sessionActive) {
    updateSpawnTag();
  }
}

function startSession(meta = {}) {
  initialiseSessionLog();
  sessionActive = true;
  logSessionEvent('session-started', {
    mood: hudApi.getCurrentMood(),
    playlist: meta.playlist,
  });
  if (meta.playlist) {
    logPlaylistState('started', meta);
  }
  updateSpawnTag();
}

function stopSession(meta = {}) {
  if (!sessionActive) {
    return;
  }
  sessionActive = false;
  logPlaylistState('stopped', meta);
  logSessionEvent('session-stopped', meta);
  stopSpawnLoop();
  setActiveTag(null);
}

function handlePlaylistToggle(isPlaying, meta = {}) {
  if (isPlaying) {
    startSession(meta);
  } else {
    stopSession(meta);
  }
}

function handleAutoMuteChange(isEnabled) {
  logSessionEvent('auto-mute-updated', { enabled: isEnabled });
}

function handleStepPayload(payload = {}) {
  const { steps, bpm } = payload;
  if (Number.isFinite(steps)) {
    hudApi.updateSteps(steps);
    logStepUpdate(steps);
  }
  if (Number.isFinite(bpm)) {
    hudApi.updateBpm(bpm);
    logBpmUpdate(bpm);
  }
  if (Number.isFinite(steps) || Number.isFinite(bpm)) {
    notifyStep();
  }
  hudApi.updateLastUpdate(Date.now());
}

function handleStatusUpdate(message, statusKey) {
  hudApi.setStatus(message, statusKey);
}

function setupNetworkLayer() {
  if (networkClient) {
    return;
  }
  // All WebSocket communication flows through this single client.
  networkClient = createNetworkClient({
    url: WS_URL,
    onStatus: handleStatusUpdate,
    onStepData: handleStepPayload,
  });
}

function handleLogExport(event) {
  const active = document.activeElement;
  const ignoreTargets = ['INPUT', 'TEXTAREA'];
  if (
    event.key?.toLowerCase() === 'l' &&
    !(active && (ignoreTargets.includes(active.tagName) || active.isContentEditable))
  ) {
    logSessionEvent('session-log-exported');
    exportSessionLog();
  }
}

function ensureDebugControls() {
  if (!debugPanel) {
    debugPanel = initEffectDebugControls();
  }
  return debugPanel;
}

function shouldAutoEnableDebugPanel() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('effectDebug') === '1') {
      return true;
    }
  } catch (error) {
    console.warn('[renderer] Failed to read URL parameters for debug panel:', error);
  }

  try {
    if (window.localStorage?.getItem('rtwEffectDebug') === '1') {
      return true;
    }
  } catch (error) {
    console.warn('[renderer] Failed to read localStorage for debug panel:', error);
  }

  return false;
}

function handleDebugShortcut(event) {
  if (event.key === 'F8') {
    ensureDebugControls();
  }
}

function focusWithoutScroll(element) {
  if (!element) {
    return;
  }
  try {
    element.focus({ preventScroll: true });
  } catch (_error) {
    element.focus();
  }
}

function initHudVisibilityControls() {
  const hudEl = document.getElementById('hud');
  const hideButton = document.getElementById('hud-hide-button');
  const toggleButton = document.getElementById('hud-floating-toggle');
  const hiddenClass = 'hud--hidden';

  if (!hudEl || !hideButton || !toggleButton) {
    return;
  }

  const showHud = () => {
    hudEl.classList.remove(hiddenClass);
    toggleButton.hidden = true;
    toggleButton.setAttribute('aria-expanded', 'true');
    focusWithoutScroll(hideButton);
  };

  const hideHud = () => {
    hudEl.classList.add(hiddenClass);
    toggleButton.hidden = false;
    toggleButton.setAttribute('aria-expanded', 'false');
    focusWithoutScroll(toggleButton);
  };

  hideButton.addEventListener('click', hideHud);
  toggleButton.addEventListener('click', showHud);

  if (hudEl.classList.contains(hiddenClass)) {
    toggleButton.hidden = false;
    toggleButton.setAttribute('aria-expanded', 'false');
  } else {
    toggleButton.hidden = true;
    toggleButton.setAttribute('aria-expanded', 'true');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  hudApi = initHUD({
    onMoodChange: handleMoodChange,
    onBpmChange: handleBpmChange,
    onTagToggle: handleTagToggle,
    onPlaylistToggle: handlePlaylistToggle,
    onAutoMuteChange: handleAutoMuteChange,
  });

  updateVersionBadges();
  setupNetworkLayer();
  window.addEventListener('keydown', handleLogExport);
  window.addEventListener('keydown', handleDebugShortcut);
  startStillnessWatcher();
  monitorEnvironment(getCurrentVideoTitle);
  initHudVisibilityControls();

  if (shouldAutoEnableDebugPanel()) {
    ensureDebugControls();
  }
});

window.addEventListener('beforeunload', () => {
  networkClient?.dispose();
});

if (typeof window !== 'undefined') {
  window.enableEffectDebugPanel = ensureDebugControls;
  window.switchHallucinationPack = switchEffectPack;
}
