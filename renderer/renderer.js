/**
 * ------------------------------------------------------------
 * HUD NAVIGATION NOTES
 * ------------------------------------------------------------
 * The HUD does not mount <rv-app>.
 * The “Open default” button opens rv-app in a new window/tab.
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
import {
  start as startAtomEngine,
  stop as stopAtomEngine,
  pause as pauseAtomEngine,
  next as nextAtom,
  prev as prevAtom,
  getState as getAtomEngineState,
  setPlan as setAtomPlan,
  setVolume as setAtomVolume,
  setPlaybackRate as setAtomPlaybackRate,
} from './renderer/runEngine.js';

const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/fitness.activity.read'].join(' ');
const GOOGLE_TOKEN_KEY = 'rtw.google.oauthToken';
const GOOGLE_TOKEN_REFRESH_MARGIN_MS = 60 * 1000;
const FIT_POLL_INTERVAL_MS = 5000;
const FIT_WINDOW_MS = 30000;
const VOLUME_STORAGE_KEY = 'rtw.video.volume';
const HALLUCINATION_SETTINGS_KEY = 'rv.hallucination.settings';
const RV_APP_BASE_PATH = '/rv/';
const RV_APP_DEV_URL = RV_APP_BASE_PATH;
const RV_APP_PROD_URL = RV_APP_BASE_PATH;
const STARTUP_READY_STATUS = 'Ready — press Play';
const ATOM_MODE_STATUS = 'Atoms mode active — playlist controls disabled';
const PLAYLIST_DISABLED_STATUS = 'Atoms mode active — playlists disabled';

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

let googleTokenClient;
let googleAccessToken = null;
let tokenRefreshTimer;
let fitPollTimer;
let userRequestedPlay = false;
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
  const state = getAtomEngineState();
  if (state?.running && Number.isInteger(state.currentAtomIndex)) {
    const total = Number.isFinite(state.totalAtoms) ? state.totalAtoms : '??';
    return `Atom ${state.currentAtomIndex + 1} / ${total}`;
  }
  return 'Atoms idle — press Play';
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
    elements.openRVApp.textContent = 'Open default';
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

  const warnPlaylistDisabled = () => {
    console.warn('[Playlist] Controls disabled in atom mode');
    const state = getAtomEngineState();
    const position = Number.isInteger(state.currentAtomIndex) ? `${state.currentAtomIndex + 1}/${state.totalAtoms || '?'}` : 'idle';
    const status = state.running ? 'running' : 'idle';
    setPlaylistStatus(`${PLAYLIST_DISABLED_STATUS} (${status} ${position})`, '#ccc');
  };

  elements.playlistSelect?.addEventListener('change', warnPlaylistDisabled);
  elements.playlistLoad?.addEventListener('click', warnPlaylistDisabled);
  elements.playlistRefresh?.addEventListener('click', warnPlaylistDisabled);
  elements.playlistShuffle?.addEventListener('click', () => {
    warnPlaylistDisabled();
    console.warn('[Playlist] Shuffle disabled — no truthful implementation available');
  });

  elements.testClipApi?.addEventListener('click', () => {
    testClipAPI();
  });

  elements.playButton?.addEventListener('click', async () => {
    console.log('[Play Button] Clicked');
    userRequestedPlay = true;
    updateHallucinationVisibility();
    await startAtomTransport();
  });

  elements.pauseButton?.addEventListener('click', () => {
    pauseAtomEngine();
    setPlaylistStatus('Atom engine paused (pause behaves like stop; press Play to restart)', '#aaa');
    updateTransportStatus();
  });

  elements.stopButton?.addEventListener('click', () => {
    stopAtomEngine();
    userRequestedPlay = false;
    updateHallucinationVisibility();
    setPlaylistStatus('Atom engine stopped — press Play to restart', '#aaa');
    updateTransportStatus();
  });

  elements.playlistNext?.addEventListener('click', () => {
    console.log('[Transport] Next atom requested');
    nextAtom();
    updateTransportStatus();
  });

  elements.playlistPrev?.addEventListener('click', () => {
    console.log('[Transport] Previous atom requested');
    prevAtom();
    updateTransportStatus();
  });

  elements.volumeSlider?.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) {
      desiredVolume = Math.max(0, Math.min(100, value));
      safeWriteLocalStorage(VOLUME_STORAGE_KEY, String(desiredVolume));
      setAtomVolume(desiredVolume);
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
  setAtomVolume(desiredVolume);
  lockPlaylistControlsForAtoms();
  updateTransportStatus();
  setPlaylistStatus(STARTUP_READY_STATUS, '#ccc');
  updateHallucinationVisibility();
  console.log('[Video] Transport UI initialized for atom playback');
}

function updateHallucinationVisibility() {
  const state = getAtomEngineState();
  const allowHallucination = userRequestedPlay || state.running;
  setHallucinationVisibility(allowHallucination);
}

function disablePlaylistUi() {
  if (elements.playlistSelect) {
    elements.playlistSelect.disabled = true;
    elements.playlistSelect.title = PLAYLIST_DISABLED_STATUS;
  }
  const disabledControls = [
    elements.playlistLoad,
    elements.playlistPrev,
    elements.playlistNext,
    elements.playlistShuffle,
    elements.playlistRefresh,
  ];
  disabledControls.forEach((control) => {
    if (control) {
      control.disabled = true;
      control.title = PLAYLIST_DISABLED_STATUS;
    }
  });
}

/* ------------------------------------------------------------
 * Atom Player – Backblaze B2 Integration
 * ------------------------------------------------------------ */

let atomManifest = null;
let atomPlan = [];
let atomsLoaded = false;

async function startAtomTransport() {
  const engineState = getAtomEngineState();
  if (engineState.running) {
    setPlaylistStatus('Atom engine already running', '#aaa');
    updateTransportStatus();
    return;
  }

  if (!atomsLoaded) {
    const loaded = await loadAtomsFromBackblaze(5);
    if (!loaded) {
      userRequestedPlay = false;
      updateHallucinationVisibility();
      return;
    }
  }

  await startAtomEngine(atomPlan);
  setPlaylistStatus('Atom engine starting…', '#4CAF50');
  updateTransportStatus();
  updateHallucinationVisibility();
}

async function loadAtomsFromBackblaze(durationMinutes = 5) {
  try {
    setPlaylistStatus('Loading atoms from Backblaze...', '#4CAF50');

    const manifestRes = await fetch('/api/media/manifest');
    if (!manifestRes.ok) {
      throw new Error('Failed to fetch manifest');
    }
    atomManifest = await manifestRes.json();

    atomPlan = await buildAtomPlanForEngine(atomManifest, durationMinutes);
    atomsLoaded = true;
    lockPlaylistControlsForAtoms();
    setAtomPlan(atomPlan);

    console.log(`[Atoms] Plan ready with ${atomPlan.length} atoms for ~${durationMinutes} minutes`);
    updateTransportStatus();

    if (userRequestedPlay) {
      await startAtomEngine(atomPlan);
      setPlaylistStatus('Starting atom engine...', '#4CAF50');
      updateTransportStatus();
    }

    return true;
  } catch (err) {
    console.error('[Atoms] Failed to load:', err);
    setPlaylistStatus('Failed to load atoms', '#f66');
    atomsLoaded = false;
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
  setPlaylistControlsEnabled();
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

function renderPlaylistRegistry() {
  disablePlaylistUi();
  if (elements.playlistStatus) {
    elements.playlistStatus.title = PLAYLIST_DISABLED_STATUS;
  }
  updateTransportStatus();
}

function setPlaylistControlsEnabled() {
  disablePlaylistUi();
  if (elements.volumeSlider) {
    elements.volumeSlider.disabled = false;
  }
}

function lockPlaylistControlsForAtoms() {
  setPlaylistControlsEnabled();
  if (elements.playlistStatus) {
    elements.playlistStatus.title = ATOM_MODE_STATUS;
  }
  updateTransportStatus();
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

function updateTransportStatus() {
  const state = getAtomEngineState();
  const playlistNote = ' — playlists disabled';
  const total = Number.isFinite(state.totalAtoms) ? state.totalAtoms : '?';
  if (!atomsLoaded) {
    setPlaylistStatus(`${STARTUP_READY_STATUS}${playlistNote}`, '#ccc');
    return;
  }

  if (state.running) {
    const position = Number.isInteger(state.currentAtomIndex) ? state.currentAtomIndex + 1 : '?';
    setPlaylistStatus(`Atoms running (${position} / ${total})${playlistNote}`, '#4CAF50');
    return;
  }

  if (Number.isInteger(state.currentAtomIndex)) {
    const position = state.currentAtomIndex + 1;
    setPlaylistStatus(`Paused at atom ${position} / ${total}${playlistNote}`, '#aaa');
    return;
  }

  const readyPrefix = total !== '?' ? `${total} atoms ready — ` : '';
  setPlaylistStatus(`${readyPrefix}Idle — press Play${playlistNote}`, '#ccc');
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
  const rate = cadenceToPlaybackRate(cadence);
  setAtomPlaybackRate(rate);
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
  setPlaylistControlsEnabled();
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
