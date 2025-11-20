// --- Load YouTube IFrame API ---
const ytScript = document.createElement('script');
ytScript.src = 'https://www.youtube.com/iframe_api';
document.body.appendChild(ytScript);

// Curated scenic / exploration clips for "Workahol Enabler"
// Each entry is designed to be remix‑friendly: lots of motion, minimal talking head.
const WORKAHOL_ENABLER_CLIPS = [
  {
    id: 'rural_canada_virtual_run',
    url: 'https://www.youtube.com/watch?v=T8X8acjT9T4',
    title: 'Virtual Running – Rural Canada 4K (Treadmill Scenery)',
    location: 'Rural Canada',
    vibe: 'open road / countryside run',
    environments: ['OUTDOOR', 'NATURE', 'RURAL'],
    peopleDensity: 'LOW',
    tags: ['virtual run', 'treadmill scenery', '4k', 'nature', 'canada', 'running'],
  },

  {
    id: 'haut_gorges_fall_run',
    url: 'https://www.youtube.com/watch?v=bWaQ59nbO2Q',
    title: '[4K] Treadmill Scenery – Fall Foliage Run (Hautes-Gorges, Canada)',
    location: 'Hautes-Gorges, Quebec',
    vibe: 'fall colors / cozy cardio',
    environments: ['OUTDOOR', 'NATURE', 'MOUNTAIN'],
    peopleDensity: 'LOW',
    tags: ['treadmill', 'virtual run', '4k', 'autumn', 'fall foliage', 'river', 'mountains'],
  },

  {
    id: 'nyc_night_walk',
    url: 'https://www.youtube.com/watch?v=XhqN9_9s-dk',
    title: 'NEW YORK CITY Walking Tour at Night – 4K UHD',
    location: 'New York City, USA',
    vibe: 'city lights / busy streets / “city that never sleeps”',
    environments: ['OUTDOOR', 'CITY', 'URBAN'],
    peopleDensity: 'HIGH',
    tags: ['walking tour', 'NYC', 'Times Square', 'night city', '4k', 'manhattan', 'city walk'],
  },

  {
    id: 'hong_kong_harbor_night',
    url: 'https://youtu.be/vXo5X8bJEcY',
    title: 'Hong Kong City Walking Tour – Tsim Sha Tsui Waterfront 4K',
    location: 'Hong Kong – Tsim Sha Tsui / Victoria Harbour',
    vibe: 'waterfront skyline / neon reflections',
    environments: ['OUTDOOR', 'CITY', 'WATERFRONT'],
    peopleDensity: 'MEDIUM',
    tags: ['hong kong', 'tsim sha tsui', '4k walk', 'harbourfront', 'city walking tour', 'night walk'],
  },

  {
    id: 'macau_city_walk',
    url: 'https://youtu.be/BOxzvk3uA1k',
    title: 'Macau City Walking Tour – 4K',
    location: 'Macau',
    vibe: 'dense narrow streets / mix of old & new',
    environments: ['OUTDOOR', 'CITY'],
    peopleDensity: 'MEDIUM',
    tags: ['macau', 'city walking tour', '4k', 'streets', 'urban walk'],
  },

  {
    id: 'macau_portuguese_streets',
    url: 'https://youtu.be/Z3cU8Xf3MKI',
    title: 'Macau Portuguese Streets Walk – 4K',
    location: 'Macau – historic Portuguese district',
    vibe: 'historic alleyways / colorful facades',
    environments: ['OUTDOOR', 'CITY', 'HISTORIC'],
    peopleDensity: 'LOW',
    tags: ['macau', 'portuguese streets', '4k', 'historic district', 'walking tour'],
  },

  {
    id: 'kyoto_night_district',
    url: 'https://youtu.be/XjR7eGiQkeM',
    title: 'Kyoto Historical District Night Walk – 4K',
    location: 'Kyoto, Japan',
    vibe: 'lanterns / narrow lanes / very “wandering at night” energy',
    environments: ['OUTDOOR', 'CITY', 'HISTORIC'],
    peopleDensity: 'LOW',
    tags: ['kyoto', 'night walk', '4k', 'japan', 'historical district', 'virtual walking tour'],
  },

  {
    id: 'rio_carnival_street_party',
    url: 'https://www.youtube.com/watch?v=gIb1vU_utgc',
    title: 'Rio Carnival Street Party 2023 – 4K Street Carnival',
    location: 'Rio de Janeiro, Brazil',
    vibe: 'full‑tilt carnival / confetti / parade',
    environments: ['OUTDOOR', 'CITY', 'EVENT'],
    peopleDensity: 'VERY_HIGH',
    tags: ['rio carnival', 'street carnival', '4k', 'brazil', 'parade', 'festival'],
  },

  {
    id: 'abandoned_farm_urbex',
    url: 'https://www.youtube.com/watch?v=7c0meDBxIes',
    title: 'Urban Exploration – Abandoned Farm in Finland (4K)',
    location: 'Rural Finland – abandoned farm',
    vibe: 'quiet / eerie / exploration',
    environments: ['OUTDOOR', 'INDOOR', 'ABANDONED'],
    peopleDensity: 'NONE',
    tags: ['urban exploration', 'abandoned', '4k', 'farm', 'urbex', 'tunnels', 'outbuildings'],
  },
];

const WORKAHOL_ENABLER_PLAYLIST_ID = 'workahol_enabler';

// --- Playlist Map ---
const PLAYLISTS = [
  {
    label: 'Workahol Enabler – Scenic / Urban / Urbex',
    id: WORKAHOL_ENABLER_PLAYLIST_ID,
    description: 'Curated scenic runs, city walks, carnival energy, and urbex exploration.',
    clips: WORKAHOL_ENABLER_CLIPS,
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

function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '');
    }
    return parsed.searchParams.get('v');
  } catch (err) {
    console.warn('Failed to parse YouTube URL', url, err);
    return null;
  }
}

function getPlaylistVideoIds(id) {
  const clips = PLAYLIST_BY_ID.get(id)?.clips ?? [];
  return clips
    .map((clip) => extractVideoId(clip.url))
    .filter((videoId) => typeof videoId === 'string' && videoId.length > 0);
}

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
  const playlistVideoIds = getPlaylistVideoIds(currentPlaylistId);
  if (ytPlayer?.loadPlaylist && playlistVideoIds.length > 0) {
    updatePlaylistStatus(`Loading ${currentPlaylistLabel}…`);
    ytPlayer.loadPlaylist(playlistVideoIds);
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
  const initialPlaylist = getPlaylistVideoIds(currentPlaylistId);
  const [initialVideo, ...queuedVideos] = initialPlaylist;
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
      videoId: initialVideo,
      playlist: queuedVideos,
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
        const playlistVideoIds = getPlaylistVideoIds(currentPlaylistId);
        if (playlistVideoIds.length > 0) {
          ytPlayer.loadPlaylist(playlistVideoIds);
        }
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

