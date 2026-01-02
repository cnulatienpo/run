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
import { startRun, initVideos } from './renderer/runEngine.js';

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

const WORKAHOL_ENABLER_PLAYLIST = [
  {
    id: WORKAHOL_ENABLER_PLAYLIST_ID,
    title: 'Workahol Enabler – Scenic / Urban / Urbex',
    clips: WORKAHOL_ENABLER_CLIPS,
  },
];

let googleTokenClient;
let googleAccessToken = null;
let tokenRefreshTimer;
let fitPollTimer;
let videoPlayer;
let playerReady = false;
let userRequestedPlay = false;
let availablePlaylists = WORKAHOL_ENABLER_PLAYLIST;
let currentPlaylistId = WORKAHOL_ENABLER_PLAYLIST_ID;
let currentPlaylist = WORKAHOL_ENABLER_CLIPS;
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
    populateHardcodedPlaylists();
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
    currentPlaylistId = storedPlaylist;
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
    playPreviousClip();
  });

  elements.playlistNext?.addEventListener('click', () => {
    playNextClip();
  });

  elements.playlistShuffle?.addEventListener('click', () => {
    shuffleCurrentPlaylist();
  });

  elements.playlistRefresh?.addEventListener('click', () => {
    populateHardcodedPlaylists();
    setPlaylistStatus('Playlist refreshed', '#4CAF50');
  });

  elements.testClipApi?.addEventListener('click', () => {
    testClipAPI();
  });

  elements.playButton?.addEventListener('click', async () => {
    console.log('[Play Button] Clicked');
    userRequestedPlay = true;
    
    // ALWAYS load atoms, never use the old playlist system
    console.log('[Play Button] Loading atoms from Backblaze');
    try {
      await loadAtomsFromBackblaze(5); // Default 5 minutes
    } catch (err) {
      console.error('[Play Button] Error loading atoms:', err);
      setPlaylistStatus('Failed to load atoms', '#f66');
    }
  });

  elements.pauseButton?.addEventListener('click', () => {
    if (videoPlayer) {
      videoPlayer.pause();
    }
  });

  elements.stopButton?.addEventListener('click', () => {
    if (videoPlayer) {
      videoPlayer.pause();
      videoPlayer.currentTime = 0;
    }
    userRequestedPlay = false;
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
    return;
  }

  setVideoAttributes();
  // Don't bind video events - atoms system handles everything
  playerReady = true;

  if (Number.isFinite(desiredVolume)) {
    setVideoVolume(desiredVolume);
  }

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

function loadPlaylist(playlistId) {
  if (!playlistId || atomsLoaded) return; // Don't load playlists if atoms are active

  const playlist = availablePlaylists.find((entry) => entry.id === playlistId);
  if (!playlist) {
    setPlaylistStatus('Playlist not found', '#f66');
    return;
  }

  currentPlaylistId = playlistId;
  currentPlaylist = Array.isArray(playlist.clips) ? playlist.clips : [];
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
    
    setPlaylistStatus(`Loaded ${atomPlan.length} atoms (${durationMinutes} min)`, '#4CAF50');
    
    // Start playing using runEngine
    if (playerReady && userRequestedPlay) {
      await startRun(atomPlan);
      setPlaylistStatus('Playing atoms...', '#4CAF50');
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
  
  // Handle manifest structure: videos is an object with video names as keys
  const videosObj = manifest.videos || {};
  const videoNames = Object.keys(videosObj);
  
  if (!videoNames.length) {
    throw new Error('Manifest has no videos');
  }
  
  // Pick first video
  const stem = videoNames[0];
  const atomCount = videosObj[stem].atom_count || 0;
  
  if (!atomCount) {
    throw new Error('Video has no atoms');
  }
  
  const plan = [];
  let estimate = 0;
  let index = 1;
  
  while (estimate < targetSeconds) {
    const padded = String(index).padStart(4, '0');
    const atomPath = `atoms/${stem}/chunk_${padded}_v1.json`;
    
    // Build plan item with structure expected by runEngine
    plan.push({
      url: `/api/media/atom?path=${encodeURIComponent(atomPath)}`,
      effectiveDuration: DEFAULT_ATOM_SECONDS,
      stretch: 1,
    });
    
    estimate += DEFAULT_ATOM_SECONDS;
    index = index >= atomCount ? 1 : index + 1;
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
  for (const playlist of playlists) {
    const option = document.createElement('option');
    option.value = playlist.id;
    option.textContent = playlist.title;
    elements.playlistSelect.appendChild(option);
  }

  if (currentPlaylistId) {
    elements.playlistSelect.value = currentPlaylistId;
  }
}

function populateHardcodedPlaylists() {
  const hardcodedPlaylists = WORKAHOL_ENABLER_PLAYLIST;
  availablePlaylists = hardcodedPlaylists;

  if (elements.playlistSelect) {
    populatePlaylistDropdown(hardcodedPlaylists);
    setPlaylistControlsEnabled(true);
    setPlaylistStatus('Select a playlist', '#ccc');
  }
}

function setPlaylistControlsEnabled(enabled) {
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
      control.disabled = !enabled;
    }
  }
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
