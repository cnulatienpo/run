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

// --- Pace to Playback Rate Configuration ---
const BASELINE_PACE = 100; // steps per minute for 1.0× speed
const MIN_PLAYBACK_RATE = 0.8;
const MAX_PLAYBACK_RATE = 1.2;
const PACE_TO_RATE_FACTOR = 0.5; // map pace delta to playback delta (50%)
const RATE_STEP = 0.025;
const RATE_STEP_INTERVAL = 180;

let desiredPlaybackRate = 1;
let pendingPlaybackRate = 1;
let availablePlaybackRates = [1];
let playbackRateTweenTimer = null;
let autoSyncEnabled = true;
let lastKnownPace = null;

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

function handlePaceUpdate(pace) {
  lastKnownPace = Number.isFinite(pace) ? Math.max(0, pace) : null;
  if (!autoSyncEnabled || lastKnownPace === null) {
    return;
  }

  if (lastKnownPace === 0) {
    applyPlaybackRate(MIN_PLAYBACK_RATE, { isTarget: !isPlaylistPlaying });
    return;
  }

  const paceRatio = lastKnownPace / BASELINE_PACE;
  let targetRate = 1;
  if (paceRatio > 1) {
    targetRate = 1 + (paceRatio - 1) * PACE_TO_RATE_FACTOR;
  } else if (paceRatio < 1) {
    targetRate = 1 - (1 - paceRatio) * PACE_TO_RATE_FACTOR;
  }
  targetRate = clampPlaybackRate(targetRate);

  if (Math.abs(targetRate - desiredPlaybackRate) < 0.01) {
    return;
  }
  applyPlaybackRate(targetRate, { isTarget: !isPlaylistPlaying });
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
    applyPlaybackRate(1, { immediate: true });
  } else if (Number.isFinite(lastKnownPace)) {
    handlePaceUpdate(lastKnownPace);
  } else {
    applyPlaybackRate(1, { immediate: true });
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
        } else if (e.data === YT.PlayerState.PAUSED) {
          isPlaylistPlaying = false;
          updatePlaylistStatus(`Paused – ${currentPlaylistLabel}`);
        } else if (e.data === YT.PlayerState.BUFFERING) {
          updatePlaylistStatus(`Buffering ${currentPlaylistLabel}…`);
        } else if (e.data === YT.PlayerState.CUED) {
          updatePlaylistStatus(`Ready – ${currentPlaylistLabel}`);
        } else if (e.data === YT.PlayerState.UNSTARTED) {
          updatePlaylistStatus(`Loading ${currentPlaylistLabel}…`);
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

window.youtubeRunner.updatePace = (pace) => {
  handlePaceUpdate(pace);
};

window.youtubeRunner.setAutoSyncEnabled = (enabled) => {
  setAutoSyncEnabled(enabled);
};

window.youtubeRunner.getState = () => ({
  autoSyncEnabled,
  desiredPlaybackRate,
  pendingPlaybackRate,
  lastKnownPace,
  availablePlaybackRates: Array.isArray(availablePlaybackRates)
    ? [...availablePlaybackRates]
    : [],
});

