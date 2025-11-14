// --- Load YouTube IFrame API ---
const ytScript = document.createElement('script');
ytScript.src = 'https://www.youtube.com/iframe_api';
document.body.appendChild(ytScript);

// --- Playlist Map ---
const PLAYLISTS = [
  {
    label: 'City Walking Tours (4K)',
    id: 'PLe4Eo7QChXDSjIgyi85VX5uVEngpw8gUB',
    description: 'High-resolution daytime urban walking tours.',
  },
  {
    label: 'Night City Run',
    id: 'PLSOO4vYXpMCe01uTOmj_3_G4C8-Kjy26X',
    description: 'Moody night-time city POV runs and walks.',
  },
  {
    label: 'Nature Trail Runs',
    id: 'PLbpi6ZahtOH6blw5yrbnIuDrPq3NbS1U2',
    description: 'Scenic forest and nature trail running routes.',
  },
  {
    label: 'Treadmill Virtual Runs (30-45 min)',
    id: 'PLLqiCLrQ5MTPjK2a3Kz7u9cYVrt2iIjtE',
    description: 'Medium-length virtual treadmill runs (~30–45 minutes).',
  },
  {
    label: 'Treadmill Virtual Runs (50-60 min)',
    id: 'PLLqiCLrQ5MTN4Sqcx6BWuKvPl7x7EuG08',
    description: 'Long-form treadmill runs (~50–60 minutes).',
  },
];

const PLAYLIST_BY_ID = new Map(PLAYLISTS.map((entry) => [entry.id, entry]));

let currentPlaylistId = PLAYLISTS[0]?.id ?? null;
let currentPlaylistLabel = PLAYLISTS[0]?.label ?? 'Playlist';
let ytPlayer = null;
let jumpTimer = null;
let currentJumpInterval = 10000;
let isPlayerReady = false;
let isPlaylistPlaying = false;
let playlistStatusValueEl = null;
let playbackRateValueEl = null;
let autoSyncCheckbox = null;
let autoSyncStatusEl = null;

const FX_LAST_RECT_PROP = '__rtwFxLastRect';

function clearOverlayPosition(overlayEl) {
  if (!overlayEl) {
    return;
  }
  overlayEl.classList.remove('fx-visible');
  overlayEl.style.transform = 'translate3d(-9999px, -9999px, 0)';
  overlayEl.style.width = '0px';
  overlayEl.style.height = '0px';
  overlayEl[FX_LAST_RECT_PROP] = undefined;
}

function alignOverlayWithPlayer(overlayEl, playerEl) {
  if (!overlayEl || !(overlayEl instanceof HTMLElement)) {
    return;
  }

  if (!playerEl || typeof playerEl.getBoundingClientRect !== 'function' || !playerEl.isConnected) {
    clearOverlayPosition(overlayEl);
    return;
  }

  const rect = playerEl.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width <= 0 || height <= 0) {
    clearOverlayPosition(overlayEl);
    return;
  }

  const left = Math.round(rect.left);
  const top = Math.round(rect.top);
  const lastRect = overlayEl[FX_LAST_RECT_PROP];
  if (!lastRect || lastRect.left !== left || lastRect.top !== top || lastRect.width !== width || lastRect.height !== height) {
    overlayEl.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    overlayEl.style.width = `${width}px`;
    overlayEl.style.height = `${height}px`;
    overlayEl[FX_LAST_RECT_PROP] = { left, top, width, height };
  }

  overlayEl.classList.add('fx-visible');
}

if (typeof window !== 'undefined') {
  window.alignOverlayWithPlayer = alignOverlayWithPlayer;
}

function createOverlayAlignmentManager({ getOverlayElement, getPlayerElement, getFallbackElement }) {
  const state = {
    overlayEl: null,
    targetEl: null,
    scheduled: false,
    resizeObserver: null,
    mutationObserver: null,
    pollTimer: null,
  };

  function ensureOverlayElement() {
    if (state.overlayEl && state.overlayEl.isConnected) {
      return state.overlayEl;
    }
    const overlayEl = typeof getOverlayElement === 'function' ? getOverlayElement() : null;
    if (overlayEl && overlayEl instanceof HTMLElement) {
      state.overlayEl = overlayEl;
      return overlayEl;
    }
    state.overlayEl = null;
    return null;
  }

  function scheduleAlignment() {
    if (state.scheduled) {
      return;
    }
    state.scheduled = true;
    requestAnimationFrame(() => {
      state.scheduled = false;
      const overlayEl = ensureOverlayElement();
      if (!overlayEl) {
        return;
      }
      if (!state.targetEl) {
        clearOverlayPosition(overlayEl);
        return;
      }
      alignOverlayWithPlayer(overlayEl, state.targetEl);
    });
  }

  function disconnectObservers() {
    if (state.resizeObserver) {
      state.resizeObserver.disconnect();
      state.resizeObserver = null;
    }
    if (state.mutationObserver) {
      state.mutationObserver.disconnect();
      state.mutationObserver = null;
    }
  }

  function setTargetElement(nextTarget) {
    const validTarget =
      nextTarget && typeof nextTarget.getBoundingClientRect === 'function' && nextTarget instanceof Element
        ? nextTarget
        : null;
    if (state.targetEl === validTarget) {
      scheduleAlignment();
      return;
    }

    disconnectObservers();
    state.targetEl = validTarget;

    if (state.targetEl) {
      if (typeof ResizeObserver !== 'undefined') {
        state.resizeObserver = new ResizeObserver(scheduleAlignment);
        state.resizeObserver.observe(state.targetEl);
      }
      if (typeof MutationObserver !== 'undefined') {
        state.mutationObserver = new MutationObserver(scheduleAlignment);
        state.mutationObserver.observe(state.targetEl, {
          attributes: true,
          attributeFilter: ['style', 'class'],
        });
      }
    }

    scheduleAlignment();
  }

  function refreshTargetFromSources() {
    const overlayEl = ensureOverlayElement();
    if (!overlayEl) {
      return;
    }

    const iframeEl = typeof getPlayerElement === 'function' ? getPlayerElement() : null;
    const fallbackEl = typeof getFallbackElement === 'function' ? getFallbackElement() : null;

    if (iframeEl && iframeEl !== state.targetEl) {
      setTargetElement(iframeEl);
      return;
    }

    if (!iframeEl && fallbackEl && fallbackEl !== state.targetEl) {
      setTargetElement(fallbackEl);
      return;
    }

    if (!state.targetEl) {
      clearOverlayPosition(overlayEl);
      return;
    }

    scheduleAlignment();
  }

  const scheduleHandler = () => scheduleAlignment();
  window.addEventListener('resize', scheduleHandler, { passive: true });
  window.addEventListener('scroll', scheduleHandler, { passive: true });

  if (typeof window.matchMedia === 'function') {
    const orientationQuery = window.matchMedia('(orientation: portrait)');
    if (orientationQuery) {
      if (typeof orientationQuery.addEventListener === 'function') {
        orientationQuery.addEventListener('change', scheduleHandler);
      } else if (typeof orientationQuery.addListener === 'function') {
        orientationQuery.addListener(scheduleHandler);
      }
    }
  }

  state.pollTimer = window.setInterval(refreshTargetFromSources, 1000);

  setTargetElement(typeof getFallbackElement === 'function' ? getFallbackElement() : null);
  requestAnimationFrame(refreshTargetFromSources);

  return {
    schedule: scheduleAlignment,
    refreshTarget: refreshTargetFromSources,
    setTargetElement,
  };
}

// --- Cadence to Playback Rate Configuration ---
const DEFAULT_PLAYBACK_RATE = 1; // fallback rate when cadence unavailable
const BASELINE_CADENCE = 100; // steps per minute for 1.0× speed
const MIN_PLAYBACK_RATE = 0.8;
const MAX_PLAYBACK_RATE = 1.2;
const MIN_CADENCE = 60; // 0.8× speed
const MAX_CADENCE = 140; // 1.2× speed
const SMOOTHING_ALPHA = 0.18; // smoothing factor for cadence-driven updates
const RATE_STEP = 0.025;
const RATE_STEP_INTERVAL = 180;

let desiredPlaybackRate = DEFAULT_PLAYBACK_RATE;
let pendingPlaybackRate = DEFAULT_PLAYBACK_RATE;
let availablePlaybackRates = [1];
let playbackRateTweenTimer = null;
let autoSyncEnabled = true;
let lastKnownCadence = null;
let smoothedPlaybackRate = DEFAULT_PLAYBACK_RATE;

function clampPlaybackRate(rate) {
  return Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
}

function refreshAvailablePlaybackRates() {
  if (!ytPlayer || typeof ytPlayer.getAvailablePlaybackRates !== 'function') {
    return;
  }
  const rates = ytPlayer.getAvailablePlaybackRates();
  if (Array.isArray(rates) && rates.length > 0) {
    availablePlaybackRates = rates;
  }
}

function getClosestSupportedRate(target) {
  if (!Array.isArray(availablePlaybackRates) || availablePlaybackRates.length === 0) {
    return target;
  }
  return availablePlaybackRates.reduce((closest, candidate) =>
    Math.abs(candidate - target) < Math.abs(closest - target) ? candidate : closest,
  availablePlaybackRates[0]);
}

function stopPlaybackTween() {
  if (playbackRateTweenTimer) {
    clearInterval(playbackRateTweenTimer);
    playbackRateTweenTimer = null;
  }
}

function updatePlaybackRateIndicator(rate, { isTarget = false } = {}) {
  if (!playbackRateValueEl) {
    return;
  }
  const rounded = Number(rate).toFixed(2);
  playbackRateValueEl.textContent = `${rounded}×${isTarget ? ' (target)' : ''}`;
}

function resetPlaybackSmoothing(targetRate = DEFAULT_PLAYBACK_RATE) {
  const safeRate = Number.isFinite(targetRate) ? targetRate : DEFAULT_PLAYBACK_RATE;
  smoothedPlaybackRate = clampPlaybackRate(safeRate);
}

function smoothPlaybackRate(targetRate) {
  const clampedTarget = clampPlaybackRate(targetRate);
  smoothedPlaybackRate += (clampedTarget - smoothedPlaybackRate) * SMOOTHING_ALPHA;
  return clampPlaybackRate(smoothedPlaybackRate);
}

function mapCadenceToPlaybackRate(cadence) {
  if (!Number.isFinite(cadence)) {
    return DEFAULT_PLAYBACK_RATE;
  }

  if (Math.abs(cadence - BASELINE_CADENCE) < 0.001) {
    return DEFAULT_PLAYBACK_RATE;
  }

  if (cadence <= MIN_CADENCE) {
    return MIN_PLAYBACK_RATE;
  }

  if (cadence >= MAX_CADENCE) {
    return MAX_PLAYBACK_RATE;
  }

  const cadenceRange = MAX_CADENCE - MIN_CADENCE;
  const cadenceOffset = cadence - MIN_CADENCE;
  const rateRange = MAX_PLAYBACK_RATE - MIN_PLAYBACK_RATE;
  return MIN_PLAYBACK_RATE + (cadenceOffset / cadenceRange) * rateRange;
}

function tweenPlaybackRate(targetRate) {
  if (!ytPlayer || typeof ytPlayer.getPlaybackRate !== 'function') {
    return;
  }

  stopPlaybackTween();

  playbackRateTweenTimer = setInterval(() => {
    if (!ytPlayer) {
      stopPlaybackTween();
      return;
    }
    const currentRate = Number(ytPlayer.getPlaybackRate?.() ?? 1);
    const diff = targetRate - currentRate;
    if (!Number.isFinite(currentRate) || Math.abs(diff) <= 0.01) {
      stopPlaybackTween();
      ytPlayer.setPlaybackRate(targetRate);
      updatePlaybackRateIndicator(targetRate);
      return;
    }
    const step = Math.sign(diff) * Math.min(Math.abs(diff), RATE_STEP);
    const nextRate = Number((currentRate + step).toFixed(3));
    ytPlayer.setPlaybackRate(nextRate);
    updatePlaybackRateIndicator(nextRate);
  }, RATE_STEP_INTERVAL);
}

function applyPlaybackRate(targetRate, { immediate = false, isTarget = false } = {}) {
  desiredPlaybackRate = clampPlaybackRate(targetRate);
  pendingPlaybackRate = desiredPlaybackRate;
  updatePlaybackRateIndicator(desiredPlaybackRate, { isTarget });

  if (!ytPlayer || !isPlayerReady || !isPlaylistPlaying) {
    return;
  }

  refreshAvailablePlaybackRates();
  const supportedRate = getClosestSupportedRate(desiredPlaybackRate);
  pendingPlaybackRate = supportedRate;

  if (immediate) {
    stopPlaybackTween();
    ytPlayer.setPlaybackRate(supportedRate);
    updatePlaybackRateIndicator(supportedRate);
    return;
  }

  tweenPlaybackRate(supportedRate);
}

function applyDefaultPlaybackRate() {
  resetPlaybackSmoothing(DEFAULT_PLAYBACK_RATE);
  applyPlaybackRate(DEFAULT_PLAYBACK_RATE, {
    immediate: !isPlaylistPlaying,
    isTarget: !isPlaylistPlaying,
  });
}

function handleCadenceUpdate(cadence) {
  lastKnownCadence = Number.isFinite(cadence) ? Math.max(0, cadence) : null;

  if (!autoSyncEnabled) {
    return;
  }

  if (lastKnownCadence === null) {
    applyDefaultPlaybackRate();
    return;
  }

  const targetRate = mapCadenceToPlaybackRate(lastKnownCadence);
  const smoothedRate = smoothPlaybackRate(targetRate);

  if (Math.abs(smoothedRate - desiredPlaybackRate) < 0.01) {
    return;
  }

  applyPlaybackRate(smoothedRate, { isTarget: !isPlaylistPlaying });
}

function updatePlaylistStatus(message) {
  if (playlistStatusValueEl) {
    playlistStatusValueEl.textContent = message;
  }
}

function updateAutoSyncIndicator() {
  if (!autoSyncStatusEl) {
    return;
  }
  autoSyncStatusEl.textContent = autoSyncEnabled ? 'Auto sync on' : 'Auto sync off';
  autoSyncStatusEl.style.opacity = autoSyncEnabled ? '0.85' : '0.6';
}

function setAutoSyncEnabled(enabled) {
  autoSyncEnabled = Boolean(enabled);
  if (autoSyncCheckbox) {
    autoSyncCheckbox.checked = autoSyncEnabled;
  }
  if (!autoSyncEnabled) {
    applyPlaybackRate(DEFAULT_PLAYBACK_RATE, { immediate: true });
    resetPlaybackSmoothing(DEFAULT_PLAYBACK_RATE);
  } else if (Number.isFinite(lastKnownCadence)) {
    resetPlaybackSmoothing(ytPlayer?.getPlaybackRate?.() ?? desiredPlaybackRate);
    handleCadenceUpdate(lastKnownCadence);
  } else {
    applyDefaultPlaybackRate();
  }
  updateAutoSyncIndicator();
}

function getPlaylistLabelById(id) {
  return PLAYLIST_BY_ID.get(id)?.label ?? 'Playlist';
}

function setCurrentPlaylist(id) {
  if (!PLAYLIST_BY_ID.has(id)) {
    return;
  }
  currentPlaylistId = id;
  currentPlaylistLabel = getPlaylistLabelById(id);
}

// --- Create and mount player container ---
const playerWrap = document.createElement('div');
playerWrap.id = 'yt-runner-player';
Object.assign(playerWrap.style, {
  position: 'fixed',
  top: '0',
  left: '0',
  width: '100vw',
  height: '100vh',
  zIndex: '-1',
});
document.body.appendChild(playerWrap);

const overlayAlignment = createOverlayAlignmentManager({
  getOverlayElement: () => document.getElementById('fx-overlay'),
  getPlayerElement: () => {
    if (ytPlayer && typeof ytPlayer.getIframe === 'function') {
      const iframe = ytPlayer.getIframe();
      if (iframe && iframe instanceof Element) {
        return iframe;
      }
    }
    return playerWrap.querySelector('iframe');
  },
  getFallbackElement: () => playerWrap,
});
overlayAlignment.refreshTarget();

// --- HUD: Playlist Dropdown ---
let hud = document.getElementById('hud');
if (!hud) {
  hud = document.createElement('div');
  hud.id = 'hud';
  hud.style.position = 'fixed';
  hud.style.top = '12px';
  hud.style.left = '12px';
  hud.style.background = 'rgba(0,0,0,0.6)';
  hud.style.color = 'white';
  hud.style.padding = '6px 12px';
  hud.style.borderRadius = '6px';
  hud.style.zIndex = '9999';
  document.body.appendChild(hud);
}

const playlistLabel = document.createElement('label');
playlistLabel.textContent = 'Video Theme: ';
playlistLabel.style.marginRight = '6px';
playlistLabel.style.fontSize = '14px';
playlistLabel.style.verticalAlign = 'middle';

const playlistSelect = document.createElement('select');
playlistSelect.style.fontSize = '14px';
playlistSelect.style.padding = '2px 6px';
playlistSelect.style.borderRadius = '4px';
playlistSelect.style.marginRight = '10px';

PLAYLISTS.forEach(({ label, id }) => {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = label;
  playlistSelect.appendChild(option);
});

if (currentPlaylistId) {
  playlistSelect.value = currentPlaylistId;
}

playlistSelect.addEventListener('change', (e) => {
  const newId = e.target.value;
  setCurrentPlaylist(newId);
  if (ytPlayer?.loadPlaylist) {
    updatePlaylistStatus(`Loading ${currentPlaylistLabel}…`);
    ytPlayer.loadPlaylist({ list: currentPlaylistId });
    isPlaylistPlaying = false;
    refreshAvailablePlaybackRates();
    if (autoSyncEnabled) {
      applyPlaybackRate(desiredPlaybackRate, { isTarget: true });
    }
    setTimeout(refreshAvailablePlaybackRates, 1200);
  }
});

const playlistWrap = document.createElement('div');
playlistWrap.style.display = 'inline-block';
playlistWrap.appendChild(playlistLabel);
playlistWrap.appendChild(playlistSelect);

hud.appendChild(playlistWrap);

const statusWrap = document.createElement('div');
statusWrap.style.display = 'inline-block';
statusWrap.style.marginLeft = '10px';
statusWrap.style.fontSize = '13px';

const playlistStatusLabel = document.createElement('span');
playlistStatusLabel.textContent = 'Status: ';
playlistStatusLabel.style.opacity = '0.7';

playlistStatusValueEl = document.createElement('span');
playlistStatusValueEl.textContent = 'Idle';

statusWrap.appendChild(playlistStatusLabel);
statusWrap.appendChild(playlistStatusValueEl);
hud.appendChild(statusWrap);

const playbackRateWrap = document.createElement('div');
playbackRateWrap.style.display = 'inline-block';
playbackRateWrap.style.marginLeft = '10px';
playbackRateWrap.style.fontSize = '13px';

const playbackRateLabel = document.createElement('span');
playbackRateLabel.textContent = 'Playback speed: ';
playbackRateLabel.style.opacity = '0.7';

playbackRateValueEl = document.createElement('span');
playbackRateValueEl.textContent = '1.00×';

playbackRateWrap.appendChild(playbackRateLabel);
playbackRateWrap.appendChild(playbackRateValueEl);
hud.appendChild(playbackRateWrap);

const autoSyncWrap = document.createElement('label');
autoSyncWrap.style.display = 'inline-flex';
autoSyncWrap.style.alignItems = 'center';
autoSyncWrap.style.marginLeft = '10px';
autoSyncWrap.style.fontSize = '13px';
autoSyncWrap.style.cursor = 'pointer';

autoSyncCheckbox = document.createElement('input');
autoSyncCheckbox.type = 'checkbox';
autoSyncCheckbox.checked = autoSyncEnabled;
autoSyncCheckbox.style.marginRight = '4px';

autoSyncStatusEl = document.createElement('span');
autoSyncStatusEl.style.opacity = '0.85';

autoSyncWrap.appendChild(autoSyncCheckbox);
autoSyncWrap.appendChild(autoSyncStatusEl);
hud.appendChild(autoSyncWrap);

autoSyncCheckbox.addEventListener('change', (event) => {
  setAutoSyncEnabled(event.target.checked);
});

updateAutoSyncIndicator();
updatePlaylistStatus(`Loading ${currentPlaylistLabel}…`);

// --- HUD: Interval Selector ---
const intervalLabel = document.createElement('label');
intervalLabel.textContent = 'Change Interval: ';
intervalLabel.style.marginRight = '6px';
intervalLabel.style.fontSize = '14px';
intervalLabel.style.verticalAlign = 'middle';

const intervalSelect = document.createElement('select');
intervalSelect.style.fontSize = '14px';
intervalSelect.style.padding = '2px 6px';
intervalSelect.style.borderRadius = '4px';

const INTERVAL_OPTIONS = {
  Off: 0,
  '5s': 5000,
  '10s': 10000,
  '30s': 30000,
  '60s': 60000,
};

Object.entries(INTERVAL_OPTIONS).forEach(([label, ms]) => {
  const option = document.createElement('option');
  option.value = ms;
  option.textContent = label;
  intervalSelect.appendChild(option);
});

intervalSelect.value = currentJumpInterval;

intervalSelect.addEventListener('change', (e) => {
  const newInterval = Number(e.target.value);
  currentJumpInterval = newInterval;
  startRandomJump(currentJumpInterval);
});

const intervalWrap = document.createElement('div');
intervalWrap.style.display = 'inline-block';
intervalWrap.style.marginLeft = '10px';
intervalWrap.appendChild(intervalLabel);
intervalWrap.appendChild(intervalSelect);

hud.appendChild(intervalWrap);

// --- Hook into API once loaded ---
window.onYouTubeIframeAPIReady = () => {
  ytPlayer = new YT.Player('yt-runner-player', {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 1,
      mute: 1,
      controls: 0,
      modestbranding: 1,
      loop: 1,
      rel: 0,
      listType: 'playlist',
      list: currentPlaylistId,
    },
    events: {
      onReady: (event) => {
        event.target.mute();
        event.target.playVideo();
        isPlayerReady = true;
        isPlaylistPlaying = true;
        refreshAvailablePlaybackRates();
        updatePlaylistStatus(`Playing – ${currentPlaylistLabel}`);
        applyPlaybackRate(desiredPlaybackRate, { immediate: true });
        startRandomJump(currentJumpInterval);
        overlayAlignment.refreshTarget();
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.ENDED) {
          ytPlayer.playVideo(); // Loop
          return;
        }

        if (e.data === YT.PlayerState.PLAYING) {
          isPlaylistPlaying = true;
          refreshAvailablePlaybackRates();
          updatePlaylistStatus(`Playing – ${currentPlaylistLabel}`);
          applyPlaybackRate(pendingPlaybackRate, { isTarget: false });
          overlayAlignment.schedule();
        } else if (e.data === YT.PlayerState.PAUSED) {
          isPlaylistPlaying = false;
          updatePlaylistStatus(`Paused – ${currentPlaylistLabel}`);
          overlayAlignment.schedule();
        } else if (e.data === YT.PlayerState.BUFFERING) {
          updatePlaylistStatus(`Buffering ${currentPlaylistLabel}…`);
          overlayAlignment.schedule();
        } else if (e.data === YT.PlayerState.CUED) {
          updatePlaylistStatus(`Ready – ${currentPlaylistLabel}`);
          overlayAlignment.schedule();
        } else if (e.data === YT.PlayerState.UNSTARTED) {
          updatePlaylistStatus(`Loading ${currentPlaylistLabel}…`);
          overlayAlignment.schedule();
        }
      },
      onPlaybackRateChange: () => {
        if (!ytPlayer) {
          return;
        }
        refreshAvailablePlaybackRates();
        const currentRate = ytPlayer.getPlaybackRate?.();
        if (Number.isFinite(currentRate)) {
          updatePlaybackRateIndicator(currentRate);
        }
      },
    },
  });
  overlayAlignment.refreshTarget();
};

// --- Randomize video position every 10s ---
function startRandomJump(intervalMs = 10000) {
  clearInterval(jumpTimer);

  if (!intervalMs || intervalMs <= 0) {
    jumpTimer = null;
    return;
  }

  jumpTimer = setInterval(() => {
    if (!ytPlayer || typeof ytPlayer.getDuration !== 'function') {
      return;
    }
    const duration = ytPlayer.getDuration();
    if (duration > 10) {
      const seekTime = Math.floor(Math.random() * (duration - 10));
      ytPlayer.seekTo(seekTime, true);
    }
  }, intervalMs);
}

// --- Expose helpers for other modules ---
if (!window.youtubeRunner) {
  window.youtubeRunner = {};
}

window.youtubeRunner.updatePace = (cadence) => {
  handleCadenceUpdate(cadence);
};

window.youtubeRunner.setAutoSyncEnabled = (enabled) => {
  setAutoSyncEnabled(enabled);
};

window.youtubeRunner.getState = () => ({
  autoSyncEnabled,
  desiredPlaybackRate,
  pendingPlaybackRate,
  lastKnownPace: lastKnownCadence,
  availablePlaybackRates: Array.isArray(availablePlaybackRates)
    ? [...availablePlaybackRates]
    : [],
});

window.onCadenceUpdate = (cadence) => {
  handleCadenceUpdate(cadence);
};

