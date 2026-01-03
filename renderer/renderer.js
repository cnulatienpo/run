/**
 * ------------------------------------------------------------
 * HUD NAVIGATION NOTES
 * ------------------------------------------------------------
 * The HUD does not mount <rv-app>.
 * The “Open Workahol Enabler” button opens rv-app in a new window/tab.
 * rv-app is served at:
 *      DEV: http://localhost:3000/rv (proxied to :3001)
 *      PROD: /rv
 *
 * Reason:
 *   - Keeps HUD and rv-app isolated
 *   - Prevents CSS and component collisions
 *   - HUD stays minimal and fast
 * ------------------------------------------------------------
 */

/**
 * ============================================================
 *  HUD (renderer/) – PROJECT MAP
 * ------------------------------------------------------------
 *  Role:
 *    - This is the web-based heads-up display (HUD) shown inside Electron.
 *    - Contains video controls, playlist manager, step counter,
 *      telemetry status, Google Fit integration, and passport export.
 *
 *  Structure:
 *    index.html       → Loads HUD layout + scripts
 *    renderer.js      → Main HUD logic (video playback, Fit, playlists)
 *    passport.js      → Passport export/logic
 *    style.css        → Static HUD styling (no bundler)
 *    package.json     → HUD-specific metadata (no build step)
 *
 *  Notes:
 *    - No bundler, no Vite/Webpack. Everything is served as static files.
 *    - HUD is distinct from rv-app (learning studio).
 *    - Renderer receives data but does not compile, bundle, or transform it.
 * ============================================================
 */

import {
  initCanvas,
  spawnLoop as runHallucinationLoop,
  notifyStep,
  startStillnessWatcher,
  monitorEnvironment,
  updateBPM as updateEngineBPM,
  recordTag,
  registerEffectPlugin,
  exportSessionLog,
  replaySession,
  switchEffectPack,
  configureEffectPacks,
  setEffectInterval,
  setRareChance,
  setIntensityMultiplier,
  setHallucinationVisibility,
  enableMusicDrivenMode,
  onBeat,
  onOnset,
  onEnergyRise,
  onEnergyDrop,
} from './hallucinationEngine.js';
import { startTimer } from './timer.js';
import { initTags } from './tagManager.js';
import { createNetworkClient } from './network.js';
import { getPassportStamps, computePassportStats } from './passport.js';
import { startRun, initVideos, pauseRun, stopRun, getRunState } from './renderer/runEngine.js';

const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/fitness.activity.read'].join(' ');
const GOOGLE_TOKEN_KEY = 'rtw.google.oauthToken';
const GOOGLE_TOKEN_REFRESH_MARGIN_MS = 60 * 1000;
const FIT_POLL_INTERVAL_MS = 5000;
const FIT_WINDOW_MS = 30000;
const PLAYLIST_STORAGE_KEY = 'rtw.video.selectedPlaylist';
const VOLUME_STORAGE_KEY = 'rtw.video.volume';
const HALLUCINATION_SETTINGS_KEY = 'rv.hallucination.settings';
const RV_APP_BASE_PATH = '/rv/';
const RV_APP_DEV_URL = RV_APP_BASE_PATH;
const RV_APP_PROD_URL = RV_APP_BASE_PATH;
const IDLE_POSTER_SRC = '/assets/frame-rectangle.jpg';
const STARTUP_READY_STATUS = 'Ready — press Play';
const ATOM_MODE_STATUS = 'Atoms mode active — playlist controls disabled';

const DEFAULT_HALLUCINATION_SETTINGS = {
  selectedPacks: ['default'],
  packMoods: {},
  effectInterval: 4000,
  rareChance: 0.02,
  intensityMultiplier: 1,
  bpm: 100,
  bpmOverride: false,
  stepRate: 0,
};

// Curated scenic / exploration clips for "Workahol Enabler"
// Now mapped to direct MP4/WebM sources for the native video element.
const WORKAHOL_ENABLER_CLIPS = [
  {
    id: 'rural_canada_virtual_run',
    src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    title: 'Virtual Running – Rural Canada 4K (Treadmill Scenery)',
    location: 'Rural Canada',
    vibe: 'open road / countryside run',
    environments: ['OUTDOOR', 'NATURE', 'RURAL'],
    peopleDensity: 'LOW',
    tags: ['virtual run', 'treadmill scenery', '4k', 'nature', 'canada', 'running'],
  },

  {
    id: 'haut_gorges_fall_run',
    src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    title: '[4K] Treadmill Scenery – Fall Foliage Run (Hautes-Gorges, Canada)',
    location: 'Hautes-Gorges, Quebec',
    vibe: 'fall colors / cozy cardio',
    environments: ['OUTDOOR', 'NATURE', 'MOUNTAIN'],
    peopleDensity: 'LOW',
    tags: ['treadmill', 'virtual run', '4k', 'autumn', 'fall foliage', 'river', 'mountains'],
  },

  {
    id: 'nyc_night_walk',
    src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    title: 'NEW YORK CITY Walking Tour at Night – 4K UHD',
    location: 'New York City, USA',
    vibe: 'city lights / busy streets / “city that never sleeps”',
    environments: ['OUTDOOR', 'CITY', 'URBAN'],
    peopleDensity: 'HIGH',
    tags: ['walking tour', 'NYC', 'Times Square', 'night city', '4k', 'manhattan', 'city walk'],
  },

  {
    id: 'hong_kong_harbor_night',
    src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    title: 'Hong Kong City Walking Tour – Tsim Sha Tsui Waterfront 4K',
    location: 'Hong Kong – Tsim Sha Tsui / Victoria Harbour',
    vibe: 'waterfront skyline / neon reflections',
    environments: ['OUTDOOR', 'CITY', 'WATERFRONT'],
    peopleDensity: 'MEDIUM',
    tags: ['hong kong', 'tsim sha tsui', '4k walk', 'harbourfront', 'city walking tour', 'night walk'],
  },
];

const WORKAHOL_ENABLER_PLAYLIST_ID = 'workahol_enabler';

// Playlist registry defines media sources only.
// Tags (Dreamcore / Ambient / Urban) influence hallucination weighting, not playlist membership.
const PLAYLIST_REGISTRY = [
  {
    id: WORKAHOL_ENABLER_PLAYLIST_ID,
    name: 'Workahol Enabler – Scenic / Urban / Urbex',
    source: 'local',
    items: WORKAHOL_ENABLER_CLIPS,
  },
];

let googleTokenClient;
let googleAccessToken = null;
let tokenRefreshTimer;
let fitPollTimer;
let videoPlayer;
let playerReady = false;
let userRequestedPlay = false;
let idlePosterAssigned = false;
let currentPlaylistId = PLAYLIST_REGISTRY[0]?.id || null;
let currentPlaylist = PLAYLIST_REGISTRY[0]?.items || [];
let currentClipIndex = 0;
let desiredVolume = 50;
let latestCadence;
let latestSteps;
let latestBpmValue = 100;
let latestStepRate = 0;
let hallucinationEngineStarted = false;
let hallucinationLoopId;
let activityListenersBound = false;
let hallucinationSettings = null;

// Music system state
let musicBridge = null;
let musicActive = false;

const elements = {};

// Music event integration
export function setupMusicBridge(bridge) {
  musicBridge = bridge;
  
  if (bridge) {
    bridge.setCallbacks({
      onBeat: (beatEvent) => {
        onBeat(beatEvent);
      },
      onOnset: (onsetEvent) => {
        onOnset(onsetEvent);
      },
      onEnergyRise: (energyEvent) => {
        onEnergyRise(energyEvent);
      },
      onEnergyDrop: (energyEvent) => {
        onEnergyDrop(energyEvent);
      },
      onBpmUpdate: (bpm, confidence) => {
        if (confidence > 0.3) {
          latestBpmValue = bpm;
          updateEngineBPM(bpm);
        }
      },
    });
  }
}

export function setMusicActive(active) {
  musicActive = active;
  enableMusicDrivenMode(active);
  
  if (active && musicBridge) {
    musicBridge.start();
  } else if (musicBridge) {
    musicBridge.stop();
    // Fall back to synthetic BPM
    enableMusicDrivenMode(false);
  }
}

function handleTagChange(tag) {
  // Tags steer hallucination weighting only; playlists remain fixed media sources.
  recordTag(tag);
}

function loadHallucinationSettingsFromStorage() {
  try {
    const raw = safeReadLocalStorage(HALLUCINATION_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_HALLUCINATION_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_HALLUCINATION_SETTINGS,
      ...parsed,
    };
  } catch (error) {
    console.warn('[Hallucination] Failed to parse settings', error);
    return { ...DEFAULT_HALLUCINATION_SETTINGS };
  }
}

function applyHallucinationPreferences() {
  hallucinationSettings = loadHallucinationSettingsFromStorage();
  const settings = hallucinationSettings;
  const selectedPacks = Array.isArray(settings?.selectedPacks) && settings.selectedPacks.length
    ? settings.selectedPacks
    : DEFAULT_HALLUCINATION_SETTINGS.selectedPacks;
  configureEffectPacks({ selectedPacks, moodFilters: settings.packMoods });
  setEffectInterval(settings.effectInterval ?? DEFAULT_HALLUCINATION_SETTINGS.effectInterval);
  setRareChance(settings.rareChance ?? DEFAULT_HALLUCINATION_SETTINGS.rareChance);
  setIntensityMultiplier(settings.intensityMultiplier ?? DEFAULT_HALLUCINATION_SETTINGS.intensityMultiplier);

  if (Number.isFinite(settings.stepRate)) {
    latestStepRate = settings.stepRate;
  }
  if (settings.bpmOverride && Number.isFinite(settings.bpm)) {
    latestBpmValue = settings.bpm;
    updateEngineBPM(settings.bpm);
  }
}

function initializeHallucinationEngine() {
  if (hallucinationEngineStarted) return;
  hallucinationEngineStarted = true;
  applyHallucinationPreferences();
  initCanvas();
  startStillnessWatcher();
  monitorEnvironment(getCurrentVideoTitle);
  bindActivityListeners();
  notifyStep();
  updateEngineBPM(latestBpmValue);
  startHallucinationLoop();
  exposeHallucinationControls();
  
  // Listen for settings changes from the controls window
  window.addEventListener('storage', (e) => {
    if (e.key === HALLUCINATION_SETTINGS_KEY && e.newValue) {
      console.log('[Hallucination] Settings updated from controls window');
      applyHallucinationPreferences();
    }
  });
}

function startHallucinationLoop() {
  if (hallucinationLoopId) return;
  const loop = () => {
    runHallucinationLoop(latestStepRate || 0, latestBpmValue || 0);
    hallucinationLoopId = requestAnimationFrame(loop);
  };
  hallucinationLoopId = requestAnimationFrame(loop);
}

function bindActivityListeners() {
  if (activityListenersBound) return;
  const events = ['pointermove', 'keydown', 'click', 'touchstart', 'scroll'];
  events.forEach((eventName) => document.addEventListener(eventName, notifyStep, { passive: true }));
  window.addEventListener('focus', notifyStep);
  activityListenersBound = true;
}

function getCurrentVideoTitle() {
  const clip = currentPlaylist?.[currentClipIndex];
  if (clip?.title) {
    return clip.title;
  }
  return document.title || '';
}

function exposeHallucinationControls() {
  window.hallucinationEngine = {
    exportSessionLog,
    replaySession,
    switchEffectPack,
    registerEffectPlugin,
    configureEffectPacks,
    setEffectInterval,
    setRareChance,
    setIntensityMultiplier,
  };
}

function updateReactiveStreams({ cadence, bpm }) {
  if (Number.isFinite(cadence)) {
    latestCadence = cadence;
    latestStepRate = cadence;
    notifyStep();
  }
  if (Number.isFinite(bpm)) {
    latestBpmValue = bpm;
    updateEngineBPM(bpm);
  }
}

initTags(handleTagChange);
startTimer();

document.addEventListener('DOMContentLoaded', () => {
  // Delay initialization slightly to allow button SVG conversion to complete
  setTimeout(() => {
    cacheDom();
    setupHudToggle();
    loadStoredPreferences();
    setupEventListeners();
    initializeVideoPlayer();
    initializeGoogleAuth();
    // Disabled: step server not running in dev environment
    // connectStepServerFallback();
    renderPlaylistRegistry();
    initializeHallucinationEngine();
  }, 100);
});

/**
 * INTEGRATION NOTE (A1/A2):
 * The HUD historically had no UI entry to rv-app.
 * This file now supports a button that opens /rv,
 * but the HUD still does NOT embed or mount rv-app.
 */

function cacheDom() {
  elements.hud = document.getElementById('hud');
  elements.hudHideButton = document.getElementById('hud-hide-button');
  elements.hudFloatingToggle = document.getElementById('hud-floating-toggle');
  elements.openRVApp = document.getElementById('open-rv-app');
  elements.testClipApi = document.getElementById('test-clip-api');
  elements.googleSignIn = document.getElementById('google-sign-in');
  elements.googleAuthStatus = document.getElementById('google-auth-status');
  elements.playlistRow = document.getElementById('video-playlist-row');
  elements.playlistSelect = document.getElementById('video-playlists');
  elements.playlistLoad = document.getElementById('video-load');
  elements.playlistPrev = document.getElementById('video-prev');
  elements.playlistNext = document.getElementById('video-next');
  elements.playlistShuffle = document.getElementById('video-shuffle');
  elements.playlistRefresh = document.getElementById('video-refresh');
  elements.playlistStatus = document.getElementById('playlist-status');
  elements.volumeSlider = document.getElementById('video-volume');
  elements.fitStatus = document.getElementById('fit-status');
  elements.stepCount = document.getElementById('step-count');
  elements.wsStatus = document.getElementById('ws-status');
  elements.hudSteps = document.getElementById('hud-steps');
  elements.hudBpm = document.getElementById('hud-bpm');
  elements.hudOfflineBadge = document.getElementById('hud-offline-badge');
  elements.hallucinationControls = document.getElementById('open-hallucination-controls');
  elements.playButton = document.getElementById('video-play');
  elements.pauseButton = document.getElementById('video-pause');
  elements.stopButton = document.getElementById('video-stop');

  console.log('[DOM] Play button element:', elements.playButton);
  console.log('[DOM] Pause button element:', elements.pauseButton);
  console.log('[DOM] Stop button element:', elements.stopButton);

  if (elements.openRVApp) {
    elements.openRVApp.textContent = 'Open Workahol Enabler';
  }
}

function setupHudToggle() {
  if (!elements.hud || !elements.hudHideButton || !elements.hudFloatingToggle) {
    return;
  }

  const originalDisplay = getComputedStyle(elements.hud).display || 'flex';

  elements.hudHideButton.addEventListener('click', () => {
    elements.hud.style.display = 'none';
    elements.hudFloatingToggle.removeAttribute('hidden');
    elements.hudFloatingToggle.setAttribute('aria-expanded', 'false');
  });

  elements.hudFloatingToggle.addEventListener('click', () => {
    elements.hud.style.display = originalDisplay;
    elements.hudFloatingToggle.setAttribute('hidden', '');
    elements.hudFloatingToggle.setAttribute('aria-expanded', 'true');
  });
}

function loadStoredPreferences() {
  const storedPlaylist = safeReadLocalStorage(PLAYLIST_STORAGE_KEY);
  if (storedPlaylist && typeof storedPlaylist === 'string') {
    syncCurrentPlaylistSelection(storedPlaylist);
  } else {
    syncCurrentPlaylistSelection();
  }

  const storedVolume = Number(safeReadLocalStorage(VOLUME_STORAGE_KEY));
  if (!Number.isNaN(storedVolume) && storedVolume >= 0 && storedVolume <= 100) {
    desiredVolume = storedVolume;
  }

  if (elements.volumeSlider) {
    elements.volumeSlider.value = String(desiredVolume);
  }
}

function setupEventListeners() {
  elements.googleSignIn?.addEventListener('click', () => {
    requestGoogleAccessToken('consent');
  });

  elements.playlistSelect?.addEventListener('change', () => {
    const playlistId = elements.playlistSelect.value;
    if (playlistId) {
      loadPlaylist(playlistId);
    }
  });

  elements.playlistLoad?.addEventListener('click', () => {
    if (elements.playlistSelect?.value) {
      loadPlaylist(elements.playlistSelect.value);
    }
  });

  elements.playlistPrev?.addEventListener('click', () => {
    if (atomsLoaded) {
      setPlaylistStatus(ATOM_MODE_STATUS, '#ccc');
      return;
    }
    playPreviousClip();
  });

  elements.playlistNext?.addEventListener('click', () => {
    if (atomsLoaded) {
      setPlaylistStatus(ATOM_MODE_STATUS, '#ccc');
      return;
    }
    playNextClip();
  });

  elements.playlistShuffle?.addEventListener('click', () => {
    if (atomsLoaded) {
      setPlaylistStatus(ATOM_MODE_STATUS, '#ccc');
      return;
    }
    shuffleCurrentPlaylist();
  });

  elements.playlistRefresh?.addEventListener('click', () => {
    renderPlaylistRegistry();
    setPlaylistStatus('Playlist dropdown refreshed from registry', '#4CAF50');
  });

  elements.testClipApi?.addEventListener('click', () => {
    testClipAPI();
  });

  // Transport controls only command the atom engine; legacy background players (#videoA/#videoB, RunnyVisionPlayer)
  // stay untouched to keep atom playback as the single authority for HUD video.
  elements.playButton?.addEventListener('click', async () => {
    console.log('[Play Button] Clicked');
    userRequestedPlay = true;
    updateHallucinationVisibility();
    const engineState = getRunState();

    if (atomsLoaded) {
      if (engineState === 'paused') {
        setPlaylistStatus('Resuming atom engine...', '#4CAF50');
        await startRun();
        return;
      }
      if (engineState === 'running') {
        setPlaylistStatus('Atom engine already running', '#aaa');
        return;
      }
    }
    
    // ALWAYS load atoms, never use the old playlist system
    console.log('[Play Button] Loading atoms from Backblaze');
    try {
      const loaded = await loadAtomsFromBackblaze(5); // Default 5 minutes
      if (!loaded) {
        userRequestedPlay = false;
        updateHallucinationVisibility();
        setIdleReadyStatus();
      }
    } catch (err) {
      console.error('[Play Button] Error loading atoms:', err);
      setPlaylistStatus('Failed to load atoms', '#f66');
      userRequestedPlay = false;
      updateHallucinationVisibility();
      setIdleReadyStatus();
    }
  });

  elements.pauseButton?.addEventListener('click', () => {
    const state = getRunState();
    if (state === 'idle') {
      setPlaylistStatus('Atom engine idle — press Play to start', '#aaa');
      return;
    }
    pauseRun();
    setPlaylistStatus('Atom engine paused (v1 + v2 held)', '#aaa');
  });

  elements.stopButton?.addEventListener('click', () => {
    stopRun();
    userRequestedPlay = false;
    updateHallucinationVisibility();
    setPlaylistStatus('Atom engine stopped — press Play to restart', '#aaa');
  });

  elements.volumeSlider?.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) {
      desiredVolume = Math.max(0, Math.min(100, value));
      safeWriteLocalStorage(VOLUME_STORAGE_KEY, String(desiredVolume));
      setVideoVolume(desiredVolume);
    }
  });

  document.getElementById('passport-button')?.addEventListener('click', () => {
    window.open('passport-page.html', '_blank');
  });

  /**
   * NOTE (A10):
   *   HUD UI intentionally does NOT provide CSV/JSON ingestion.
   *   Users must open RV Studio to access mnemonic generation tools.
   */
  elements.openRVApp?.addEventListener('click', () => {
    if (window.isProd) {
      window.location.href = RV_APP_PROD_URL;
    } else {
      window.open(RV_APP_DEV_URL, '_blank');
    }
  });

  elements.hallucinationControls?.addEventListener('click', () => {
    window.location.href = `hallucination-controls.html?v=${Date.now()}`;
  });
}

async function testClipAPI() {
  const res = await fetch('/api/clips');
  console.log('Clips from server:', await res.json());
}

function initializeVideoPlayer() {
  // Use the first video element (v1) as the primary player for legacy code
  videoPlayer = document.getElementById('v1');
  if (!videoPlayer) {
    console.warn('[Video] Player element not found');
    playerReady = false;
    return;
  }

  setVideoAttributes();
  idlePosterAssigned = applyIdlePoster();
  playerReady = hasVisibleVideoSurface();
  updateHallucinationVisibility();

  if (!playerReady) {
    setPlaylistStatus('Preparing idle surface...', '#aaa');
    return;
  }
  // Atom engine stays idle until the user presses Play; there is no hidden autoplay on load.

  if (Number.isFinite(desiredVolume)) {
    setVideoVolume(desiredVolume);
  }

  setIdleReadyStatus();
  // Don't auto-load playlists - we're using atoms only
  console.log('[Video] Player initialized for atom playback');
}

function setVideoAttributes() {
  if (!videoPlayer) return;
  videoPlayer.setAttribute('playsinline', '');
  videoPlayer.autoplay = false;
  videoPlayer.loop = false;
  videoPlayer.muted = false;
  videoPlayer.controls = false;
  videoPlayer.preload = 'none';
}

function applyIdlePoster() {
  if (!videoPlayer) return false;
  try {
    videoPlayer.poster = IDLE_POSTER_SRC;
    videoPlayer.preload = 'none';
    if (!videoPlayer.src) {
      videoPlayer.removeAttribute('src');
      videoPlayer.load();
    }
    idlePosterAssigned = Boolean(videoPlayer.poster);
    return idlePosterAssigned;
  } catch (error) {
    console.warn('[Video] Failed to set idle poster', error);
    idlePosterAssigned = false;
    return false;
  }
}

function hasVisibleVideoSurface() {
  if (!videoPlayer) return false;
  const hasPoster = Boolean(videoPlayer.poster);
  const hasSource = Boolean(videoPlayer.currentSrc || videoPlayer.src);
  return hasPoster || hasSource;
}

function updateHallucinationVisibility() {
  const allowHallucination = userRequestedPlay || (hasVisibleVideoSurface() && !idlePosterAssigned);
  setHallucinationVisibility(allowHallucination);
}

function bindVideoEvents() {
  if (!videoPlayer) return;
  videoPlayer.addEventListener('ended', () => {
    if (!videoPlayer.loop && userRequestedPlay) {
      // If atoms are loaded, play next atom, otherwise play next clip
      if (atomsLoaded) {
        playNextAtom();
      } else {
        playNextClip(true);
      }
    }
  });
}

function getPlaylistFromRegistry(playlistId) {
  if (!playlistId) return undefined;
  return PLAYLIST_REGISTRY.find((entry) => entry.id === playlistId);
}

function syncCurrentPlaylistSelection(preferredId) {
  const playlist = getPlaylistFromRegistry(preferredId) || PLAYLIST_REGISTRY[0];
  if (playlist) {
    currentPlaylistId = playlist.id;
    currentPlaylist = Array.isArray(playlist.items) ? playlist.items : [];
    return playlist;
  }

  currentPlaylistId = null;
  currentPlaylist = [];
  return null;
}

function loadPlaylist(playlistId) {
  if (!playlistId || atomsLoaded) return; // Don't load playlists if atoms are active

  const playlist = getPlaylistFromRegistry(playlistId);
  if (!playlist) {
    setPlaylistStatus('Playlist not found', '#f66');
    return;
  }

  currentPlaylistId = playlistId;
  currentPlaylist = Array.isArray(playlist.items) ? playlist.items : [];
  currentClipIndex = 0;
  safeWriteLocalStorage(PLAYLIST_STORAGE_KEY, playlistId);

  if (elements.playlistSelect) {
    elements.playlistSelect.value = playlistId;
  }

  // Don't auto-play, just set status
  setPlaylistStatus('Playlist ready', '#aaa');
}

function playClipAt(index) {
  if (!videoPlayer || !currentPlaylist.length) return;
  const nextIndex = (index + currentPlaylist.length) % currentPlaylist.length;
  const clip = currentPlaylist[nextIndex];
  if (!clip?.src) {
    setPlaylistStatus('Clip missing source', '#f66');
    return;
  }

  currentClipIndex = nextIndex;
  if (clip.title) {
    videoPlayer.dataset.title = clip.title;
  } else {
    delete videoPlayer.dataset.title;
  }
  videoPlayer.src = clip.src;
  videoPlayer.currentTime = 0;
  if (userRequestedPlay) {
    const playPromise = videoPlayer.play();
    if (playPromise?.catch) {
      playPromise.catch((error) => console.warn('[Video] Autoplay blocked:', error));
    }
  }
}

function playNextClip(autoTriggered = false) {
  if (!currentPlaylist.length) return;
  playClipAt(currentClipIndex + 1);
  if (!autoTriggered) {
    setPlaylistStatus('Skipped to next clip', '#4CAF50');
  }
}

function playPreviousClip() {
  if (!currentPlaylist.length) return;
  playClipAt(currentClipIndex - 1);
  setPlaylistStatus('Went to previous clip', '#4CAF50');
}

function shuffleCurrentPlaylist() {
  if (!currentPlaylist.length) return;
  const randomIndex = Math.floor(Math.random() * currentPlaylist.length);
  playClipAt(randomIndex);
  setPlaylistStatus('Shuffled playlist', '#4CAF50');
}

function setVideoVolume(volume) {
  const normalized = Math.max(0, Math.min(100, volume));
  desiredVolume = normalized;
  if (!videoPlayer) return;
  videoPlayer.volume = normalized / 100;
  videoPlayer.muted = normalized === 0;
}

/* ------------------------------------------------------------
 * Atom Player – Backblaze B2 Integration
 * ------------------------------------------------------------ */

let atomManifest = null;
let atomPlan = [];
let atomIndex = 0;
let atomsLoaded = false;
let playlistControlsLocked = false;

async function loadAtomsFromBackblaze(durationMinutes = 5) {
  try {
    setPlaylistStatus('Loading atoms from Backblaze...', '#4CAF50');
    
    // Initialize video elements for crossfading
    initVideos();
    
    // Fetch manifest
    const manifestRes = await fetch('/api/media/manifest');
    if (!manifestRes.ok) {
      throw new Error('Failed to fetch manifest');
    }
    atomManifest = await manifestRes.json();
    
    // Build plan with proper structure for runEngine
    atomPlan = await buildAtomPlanForEngine(atomManifest, durationMinutes);
    atomIndex = 0;
    atomsLoaded = true;
    playlistControlsLocked = true;
    lockPlaylistControlsForAtoms();
    
    setPlaylistStatus(`Atoms mode active — loaded ${atomPlan.length} atoms (${durationMinutes} min)`, '#4CAF50');
    
    // Start playing using runEngine
    if (playerReady && userRequestedPlay) {
      await startRun(atomPlan);
      setPlaylistStatus('Starting atom engine...', '#4CAF50');
    }
    
    return true;
  } catch (err) {
    console.error('[Atoms] Failed to load:', err);
    setPlaylistStatus('Failed to load atoms', '#f66');
    return false;
  }
}

async function buildAtomPlanForEngine(manifest, minutes) {
  const DEFAULT_ATOM_SECONDS = 5;
  const targetSeconds = minutes * 60;
  
  const videosObj = manifest.videos || {};
  const version = typeof manifest.atom_version === 'string' && manifest.atom_version.trim()
    ? manifest.atom_version.trim()
    : 'v1';
  const entries = Object.entries(videosObj)
    .map(([stem, data]) => ({ stem, atomCount: Number(data?.atom_count) || 0 }))
    .filter(({ atomCount }) => atomCount > 0);
  
  if (!entries.length) {
    throw new Error('Manifest has no videos');
  }
  
  const atoms = [];
  for (const { stem, atomCount } of entries) {
    for (let i = 0; i < atomCount; i += 1) {
      const padded = String(i).padStart(4, '0');
      atoms.push({
        stem,
        index: i,
        atomPath: `atoms/${stem}/chunk_${padded}_${version}.json`,
      });
    }
  }
  
  if (!atoms.length) {
    throw new Error('Manifest has no atoms');
  }
  
  const plan = [];
  let estimate = 0;
  let cursor = 0;
  const allowWrap = atoms.length > 1;
  
  while (estimate < targetSeconds && atoms[cursor]) {
    const atom = atoms[cursor];
    plan.push({
      url: `/api/media/atom?path=${encodeURIComponent(atom.atomPath)}`,
      effectiveDuration: DEFAULT_ATOM_SECONDS,
      stretch: 1,
      atomPath: atom.atomPath,
      stem: atom.stem,
      index: atom.index,
    });
    
    estimate += DEFAULT_ATOM_SECONDS;
    cursor += 1;
    if (cursor >= atoms.length) {
      if (!allowWrap) {
        break;
      }
      cursor = 0;
    }
  }
  
  return plan;
}

async function playAtomAt(index) {
  if (!videoPlayer || !atomPlan.length) return;
  
  const nextIndex = (index + atomPlan.length) % atomPlan.length;
  const atom = atomPlan[nextIndex];
  
  try {
    // Fetch atom metadata
    const atomRes = await fetch(`/api/media/atom?path=${encodeURIComponent(atom.atomPath)}`);
    if (!atomRes.ok) {
      throw new Error('Failed to fetch atom');
    }
    
    const atomMeta = await atomRes.json();
    const videoUrl = atomMeta.signed_url;
    
    if (!videoUrl) {
      throw new Error('Atom has no video URL');
    }
    
    atomIndex = nextIndex;
    videoPlayer.dataset.title = `Atom ${atom.index} - ${atom.stem}`;
    videoPlayer.src = videoUrl;
    videoPlayer.currentTime = 0;
    
    if (userRequestedPlay) {
      const playPromise = videoPlayer.play();
      if (playPromise?.catch) {
        playPromise.catch((error) => console.warn('[Atoms] Autoplay blocked:', error));
      }
    }
  } catch (err) {
    console.error('[Atoms] Failed to play:', err);
    setPlaylistStatus('Failed to play atom', '#f66');
  }
}

function playNextAtom() {
  if (!atomsLoaded) return;
  playAtomAt(atomIndex + 1);
}

function initializeGoogleAuth() {
  const storedToken = readStoredToken();
  if (storedToken && isTokenValid(storedToken)) {
    applyToken(storedToken);
    const remainingMs = storedToken.expiry - Date.now();
    if (remainingMs > 0) {
      scheduleTokenRefresh(remainingMs / 1000);
    }
  } else if (storedToken) {
    clearStoredToken();
  }

  waitForGoogleIdentity()
    .then((identity) => {
      const clientId = getGoogleClientId();
      if (!clientId) {
        setAuthStatus('Missing Google client ID', '#f66');
        return;
      }

      googleTokenClient = identity.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_SCOPES,
        prompt: 'consent',
        callback: (response) => {
          if (response.error) {
            console.error('[GoogleAuth] Token error:', response.error);
            setAuthStatus('Google sign-in failed', '#f66');
            return;
          }

          const expiresInSec = Number(response.expires_in ?? 0);
          const expiry = Date.now() + (Number.isFinite(expiresInSec) ? expiresInSec * 1000 : 3600 * 1000);
          const token = {
            accessToken: response.access_token,
            expiry,
          };
          applyToken(token);
          scheduleTokenRefresh(expiresInSec);
        },
      });

      if (googleAccessToken) {
        onAuthenticated();
      } else {
        setAuthStatus('Sign in to enable Google services', '#ccc');
      }
    })
    .catch((error) => {
      console.error('[GoogleAuth] Failed to initialise identity services:', error);
      setAuthStatus('Google auth unavailable', '#f66');
    });
}

function waitForGoogleIdentity() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve(window.google.accounts.oauth2);
      return;
    }

    let attempts = 0;
    const maxAttempts = 40; // ~20 seconds
    const interval = setInterval(() => {
      attempts += 1;
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve(window.google.accounts.oauth2);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        reject(new Error('Google Identity Services script not available'));
      }
    }, 500);
  });
}

function getGoogleClientId() {
  const fromConfig = window.googleOAuthConfig?.clientId;
  if (typeof fromConfig === 'string' && fromConfig.trim()) {
    return fromConfig.trim();
  }

  const fromDataset = document.body?.dataset?.googleClientId;
  if (typeof fromDataset === 'string' && fromDataset.trim()) {
    return fromDataset.trim();
  }

  return undefined;
}

function requestGoogleAccessToken(prompt = '') {
  if (!googleTokenClient) {
    console.warn('[GoogleAuth] Token client not ready yet');
    return;
  }

  setAuthStatus('Opening Google sign-in…', '#ccc');
  googleTokenClient.callback = (response) => {
    if (response.error) {
      console.error('[GoogleAuth] Token error:', response.error);
      setAuthStatus('Google sign-in failed', '#f66');
      return;
    }

    const expiresInSec = Number(response.expires_in ?? 0);
    const expiry = Date.now() + (Number.isFinite(expiresInSec) ? expiresInSec * 1000 : 3600 * 1000);
    const token = {
      accessToken: response.access_token,
      expiry,
    };
    applyToken(token);
    scheduleTokenRefresh(expiresInSec);
  };

  googleTokenClient.requestAccessToken({ prompt });
}

function applyToken(token) {
  googleAccessToken = token.accessToken;
  safeWriteLocalStorage(GOOGLE_TOKEN_KEY, JSON.stringify(token));
  setAuthStatus('Signed in with Google', '#4CAF50');
  setPlaylistControlsEnabled(true);
  onAuthenticated();
}

function onAuthenticated() {
  if (elements.googleSignIn) {
    elements.googleSignIn.disabled = true;
    elements.googleSignIn.textContent = 'Connected to Google';
  }

  startFitPolling();
}

function scheduleTokenRefresh(expiresInSec) {
  clearTimeout(tokenRefreshTimer);
  if (!Number.isFinite(expiresInSec) || expiresInSec <= 0) {
    return;
  }

  const refreshInMs = Math.max(0, expiresInSec * 1000 - GOOGLE_TOKEN_REFRESH_MARGIN_MS);
  tokenRefreshTimer = setTimeout(() => {
    if (!googleTokenClient) {
      return;
    }
    requestGoogleAccessToken('');
  }, refreshInMs);
}

function readStoredToken() {
  const raw = safeReadLocalStorage(GOOGLE_TOKEN_KEY);
  if (typeof raw !== 'string' || !raw.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.accessToken === 'string' && Number.isFinite(parsed?.expiry)) {
      return parsed;
    }
  } catch (error) {
    console.warn('[GoogleAuth] Failed to parse stored token:', error);
  }

  return undefined;
}

function clearStoredToken() {
  safeRemoveLocalStorage(GOOGLE_TOKEN_KEY);
}

function isTokenValid(token) {
  if (!token?.accessToken || !Number.isFinite(token?.expiry)) {
    return false;
  }
  return token.expiry - Date.now() > GOOGLE_TOKEN_REFRESH_MARGIN_MS;
}

function populatePlaylistDropdown(playlists) {
  if (!elements.playlistSelect) {
    return;
  }

  elements.playlistSelect.innerHTML = '';
  if (!playlists.length) {
    currentPlaylistId = null;
    currentPlaylist = [];
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No playlists available';
    elements.playlistSelect.appendChild(option);
    elements.playlistSelect.disabled = true;
    return;
  }

  elements.playlistSelect.disabled = false;

  for (const playlist of playlists) {
    const option = document.createElement('option');
    option.value = playlist.id;
    option.textContent = playlist.name;
    elements.playlistSelect.appendChild(option);
  }

  const active = syncCurrentPlaylistSelection(currentPlaylistId) || playlists[0];
  if (active) {
    elements.playlistSelect.value = active.id;
  }

  if (playlists.length === 1) {
    elements.playlistSelect.title = `Single playlist available: ${playlists[0].name}`;
  } else {
    elements.playlistSelect.title = 'Select a playlist';
  }
}

function setIdleReadyStatus() {
  if (!playerReady || userRequestedPlay) {
    return;
  }
  setPlaylistStatus(STARTUP_READY_STATUS, '#ccc');
}

function renderPlaylistRegistry() {
  populatePlaylistDropdown(PLAYLIST_REGISTRY);
  const hasPlaylists = PLAYLIST_REGISTRY.length > 0;
  setPlaylistControlsEnabled(hasPlaylists);

  if (!hasPlaylists) {
    setPlaylistStatus('No playlists available', '#f66');
    return;
  }

  if (playlistControlsLocked) {
    setPlaylistStatus(ATOM_MODE_STATUS, '#ccc');
    return;
  }

  if (!playerReady) {
    setPlaylistStatus('Preparing idle surface...', '#aaa');
    return;
  }

  if (playerReady && !userRequestedPlay && !atomsLoaded) {
    setIdleReadyStatus();
    return;
  }

  if (PLAYLIST_REGISTRY.length === 1) {
    setPlaylistStatus(`Single playlist available: ${PLAYLIST_REGISTRY[0].name}`, '#ccc');
  } else {
    setPlaylistStatus('Select a playlist', '#ccc');
  }
}

function setPlaylistControlsEnabled(enabled) {
  const nextEnabled = playlistControlsLocked ? false : enabled;
  const controls = [
    elements.playlistSelect,
    elements.playlistLoad,
    elements.playlistPrev,
    elements.playlistNext,
    elements.playlistShuffle,
    elements.playlistRefresh,
    elements.volumeSlider,
  ];

  for (const control of controls) {
    if (control) {
      control.disabled = !nextEnabled;
      if (playlistControlsLocked) {
        control.title = 'Atom engine active — playlist controls are disabled';
      }
    }
  }
}

function lockPlaylistControlsForAtoms() {
  playlistControlsLocked = true;
  setPlaylistControlsEnabled(false);
  setPlaylistStatus(ATOM_MODE_STATUS, '#ccc');
}

function setAuthStatus(message, color) {
  if (!elements.googleAuthStatus) {
    return;
  }
  elements.googleAuthStatus.textContent = message;
  elements.googleAuthStatus.style.color = color || '#fff';
}

function setPlaylistStatus(message, color) {
  if (!elements.playlistStatus) {
    return;
  }
  elements.playlistStatus.textContent = message;
  elements.playlistStatus.style.color = color || '#fff';
}

function startFitPolling() {
  if (!googleAccessToken) {
    return;
  }

  stopFitPolling();
  fetchFitSummary();
  fitPollTimer = setInterval(fetchFitSummary, FIT_POLL_INTERVAL_MS);
}

function stopFitPolling() {
  if (fitPollTimer) {
    clearInterval(fitPollTimer);
    fitPollTimer = undefined;
  }
}

function fetchFitSummary() {
  if (!googleAccessToken) {
    updateFitStatus('Google Fit unavailable', '#f66');
    return;
  }

  const now = Date.now();
  const requestBody = {
    aggregateBy: [
      {
        dataTypeName: 'com.google.step_count.delta',
        dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps',
      },
    ],
    bucketByTime: {
      durationMillis: FIT_WINDOW_MS,
    },
    startTimeMillis: now - FIT_WINDOW_MS,
    endTimeMillis: now,
  };

  fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })
    .then((response) => {
      if (response.status === 401 || response.status === 403) {
        updateFitStatus('Google Fit authentication expired', '#f66');
        handleGoogleAuthExpiry('Google Fit authentication expired');
        return null;
      }

      if (!response.ok) {
        throw new Error(`Google Fit API error ${response.status}`);
      }

      return response.json();
    })
    .then((payload) => {
      if (!payload) {
        return;
      }

      const { steps, cadence } = extractFitMetrics(payload);
      latestSteps = steps;
      updateReactiveStreams({ cadence });
      updateStepDisplays(steps);
      applyCadenceToPlayer(cadence);
      updateFitStatus(`Steps (30s): ${steps} • Cadence: ${cadence.toFixed(1)} spm`, '#4CAF50');
    })
    .catch((error) => {
      console.error('[Google Fit] Failed to fetch cadence:', error);
      updateFitStatus('Failed to reach Google Fit', '#f66');
    });
}

function extractFitMetrics(payload) {
  let totalSteps = 0;

  for (const bucket of payload.bucket ?? []) {
    for (const dataset of bucket.dataset ?? []) {
      for (const point of dataset.point ?? []) {
        const values = point.value ?? [];
        const value = values[0] ?? {};
        const steps = value.intVal ?? value.fpVal ?? 0;
        if (Number.isFinite(steps)) {
          totalSteps += steps;
        }
      }
    }
  }

  const cadence = totalSteps / (FIT_WINDOW_MS / 60000);
  return {
    steps: Math.max(0, Math.round(totalSteps)),
    cadence: Math.max(0, cadence),
  };
}

function applyCadenceToPlayer(cadence) {
  if (!playerReady || !videoPlayer) {
    return;
  }

  const rate = cadenceToPlaybackRate(cadence);
  videoPlayer.playbackRate = rate;
}

function cadenceToPlaybackRate(cadence) {
  if (!Number.isFinite(cadence) || cadence <= 0) {
    return 1;
  }

  const minCadence = 80;
  const maxCadence = 140;
  const clamped = Math.min(Math.max(cadence, minCadence), maxCadence);
  const ratio = (clamped - minCadence) / (maxCadence - minCadence);
  const minRate = 0.85;
  const maxRate = 1.15;
  const rate = minRate + ratio * (maxRate - minRate);
  return Math.round(rate * 100) / 100;
}

function updateStepDisplays(steps) {
  const text = Number.isFinite(steps) ? String(steps) : '—';
  if (elements.stepCount) {
    elements.stepCount.textContent = text;
  }
  if (elements.hudSteps) {
    elements.hudSteps.textContent = text;
  }
}

function updateFitStatus(message, color) {
  if (!elements.fitStatus) {
    return;
  }
  elements.fitStatus.textContent = message;
  elements.fitStatus.style.color = color || '#fff';
}

function handleGoogleAuthExpiry(message) {
  googleAccessToken = null;
  stopFitPolling();
  clearStoredToken();
  setAuthStatus(message, '#f66');
  setPlaylistControlsEnabled(true);
  if (elements.googleSignIn) {
    elements.googleSignIn.disabled = false;
    elements.googleSignIn.textContent = 'Sign in with Google';
  }
}

function connectStepServerFallback() {
  const networkClient = createNetworkClient({
    url: 'wss://redesigned-cod-g95ww76g4g5fvqxj-6789.app.github.dev',
    onStatus: (statusText, state) => {
      const color = state === 'connected' ? '#4CAF50' : state === 'error' ? '#f66' : '#ccc';
      if (elements.wsStatus) {
        elements.wsStatus.textContent = statusText;
        elements.wsStatus.style.color = color;
      }
      if (elements.hudOfflineBadge) {
        elements.hudOfflineBadge.hidden = state === 'connected';
      }
    },
    onStepData: (data) => {
      updateReactiveStreams({ cadence: data.cadence, bpm: data.bpm });

      if (Number.isFinite(data.steps)) {
        latestSteps = data.steps;
        updateStepDisplays(data.steps);
      }
      if (Number.isFinite(data.bpm) && elements.hudBpm) {
        elements.hudBpm.textContent = Math.round(data.bpm);
      }
      if (Number.isFinite(data.cadence)) {
        applyCadenceToPlayer(data.cadence);
      }
    }
  });
}

function safeReadLocalStorage(key) {
  try {
    return window.localStorage?.getItem(key) ?? undefined;
  } catch (error) {
    console.warn('[Storage] Read failed:', error);
    return undefined;
  }
}

function safeWriteLocalStorage(key, value) {
  try {
    window.localStorage?.setItem(key, value);
  } catch (error) {
    console.warn('[Storage] Write failed:', error);
  }
}

function safeRemoveLocalStorage(key) {
  try {
    window.localStorage?.removeItem(key);
  } catch (error) {
    console.warn('[Storage] Remove failed:', error);
  }
}
