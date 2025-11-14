import { start } from './spawnLoop.js';
import { startTimer } from './timer.js';
import { initTags } from './tagManager.js';
import { setTag } from './spawnLoop.js';
import { connectToStepServer } from './ws-client.js';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');
const GOOGLE_TOKEN_KEY = 'rtw.google.oauthToken';
const GOOGLE_TOKEN_REFRESH_MARGIN_MS = 60 * 1000;
const FIT_POLL_INTERVAL_MS = 5000;
const FIT_WINDOW_MS = 30000;
const PLAYLIST_STORAGE_KEY = 'rtw.youtube.selectedPlaylist';
const VOLUME_STORAGE_KEY = 'rtw.youtube.volume';

let googleTokenClient;
let googleAccessToken = null;
let tokenRefreshTimer;
let fitPollTimer;
let youtubePlayer;
let playerReady = false;
let youtubePlaylists = [];
let currentPlaylistId = null;
let desiredVolume = 50;
let latestCadence;
let latestSteps;

const elements = {};

initTags(setTag);
startTimer();
start();

document.addEventListener('DOMContentLoaded', () => {
  cacheDom();
  setupHudToggle();
  loadStoredPreferences();
  setupEventListeners();
  initializeYouTubePlayer();
  initializeGoogleAuth();
  connectStepServerFallback();
});

function cacheDom() {
  elements.hud = document.getElementById('hud');
  elements.hudHideButton = document.getElementById('hud-hide-button');
  elements.hudFloatingToggle = document.getElementById('hud-floating-toggle');
  elements.googleSignIn = document.getElementById('google-sign-in');
  elements.googleAuthStatus = document.getElementById('google-auth-status');
  elements.playlistRow = document.getElementById('youtube-playlist-row');
  elements.playlistSelect = document.getElementById('youtube-playlists');
  elements.playlistLoad = document.getElementById('youtube-load');
  elements.playlistPrev = document.getElementById('youtube-prev');
  elements.playlistNext = document.getElementById('youtube-next');
  elements.playlistShuffle = document.getElementById('youtube-shuffle');
  elements.playlistRefresh = document.getElementById('youtube-refresh');
  elements.playlistStatus = document.getElementById('playlist-status');
  elements.volumeSlider = document.getElementById('youtube-volume');
  elements.fitStatus = document.getElementById('fit-status');
  elements.stepCount = document.getElementById('step-count');
  elements.wsStatus = document.getElementById('ws-status');
  elements.hudSteps = document.getElementById('hud-steps');
  elements.hudBpm = document.getElementById('hud-bpm');
  elements.hudOfflineBadge = document.getElementById('hud-offline-badge');
}

function setupHudToggle() {
  if (!elements.hud || !elements.hudHideButton || !elements.hudFloatingToggle) {
    return;
  }

  const originalDisplay = getComputedStyle(elements.hud).display || 'block';

  elements.hudHideButton.addEventListener('click', () => {
    elements.hud.style.display = 'none';
    elements.hudFloatingToggle.style.display = 'block';
  });

  elements.hudFloatingToggle.addEventListener('click', () => {
    elements.hud.style.display = originalDisplay;
    elements.hudFloatingToggle.style.display = 'none';
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
    if (playerReady && youtubePlayer?.previousVideo) {
      youtubePlayer.previousVideo();
    }
  });

  elements.playlistNext?.addEventListener('click', () => {
    if (playerReady && youtubePlayer?.nextVideo) {
      youtubePlayer.nextVideo();
    }
  });

  elements.playlistShuffle?.addEventListener('click', () => {
    if (playerReady && youtubePlayer?.setShuffle) {
      youtubePlayer.setShuffle(true);
    }
  });

  elements.playlistRefresh?.addEventListener('click', () => {
    fetchYouTubePlaylists();
  });

  elements.volumeSlider?.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) {
      desiredVolume = Math.max(0, Math.min(100, value));
      safeWriteLocalStorage(VOLUME_STORAGE_KEY, String(desiredVolume));
      if (playerReady && youtubePlayer?.setVolume) {
        youtubePlayer.setVolume(desiredVolume);
      }
    }
  });
}

function initializeYouTubePlayer() {
  if (window.YT && window.YT.Player) {
    createYouTubePlayer();
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.async = true;
  script.onerror = () => {
    setPlaylistStatus('Failed to load YouTube API', '#f66');
  };
  window.onYouTubeIframeAPIReady = () => {
    createYouTubePlayer();
  };
  document.head.appendChild(script);
}

function createYouTubePlayer() {
  youtubePlayer = new YT.Player('youtube-player', {
    height: '360',
    width: '640',
    playerVars: {
      autoplay: 0,
      controls: 1,
      modestbranding: 1,
      rel: 0,
      mute: 0,
    },
    events: {
      onReady: onYouTubePlayerReady,
      onError: (event) => {
        console.error('[YouTube] Player error:', event.data);
        setPlaylistStatus('YouTube player error', '#f66');
      },
    },
  });
}

function onYouTubePlayerReady(event) {
  playerReady = true;
  if (Number.isFinite(desiredVolume)) {
    event.target.setVolume(desiredVolume);
  }

  if (currentPlaylistId) {
    loadPlaylist(currentPlaylistId);
  }
}

function loadPlaylist(playlistId) {
  if (!playlistId) return;

  currentPlaylistId = playlistId;
  safeWriteLocalStorage(PLAYLIST_STORAGE_KEY, playlistId);

  if (elements.playlistSelect) {
    elements.playlistSelect.value = playlistId;
  }

  if (playerReady && youtubePlayer?.loadPlaylist) {
    youtubePlayer.loadPlaylist({
      list: playlistId,
      index: 0,
    });
    setPlaylistStatus('Playlist loaded', '#4CAF50');
  } else {
    setPlaylistStatus('Playlist ready when player loads', '#aaa');
  }
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
        setPlaylistControlsEnabled(false);
      }
    })
    .catch((error) => {
      console.error('[GoogleAuth] Failed to initialise identity services:', error);
      setAuthStatus('Google auth unavailable', '#f66');
      setPlaylistControlsEnabled(false);
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

  fetchYouTubePlaylists();
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

function fetchYouTubePlaylists() {
  if (!googleAccessToken) {
    return;
  }

  setPlaylistStatus('Loading playlists…', '#ccc');
  setPlaylistControlsEnabled(false);

  const url = 'https://www.googleapis.com/youtube/v3/playlists?mine=true&part=snippet&maxResults=50';
  fetch(url, {
    headers: {
      Authorization: `Bearer ${googleAccessToken}`,
    },
  })
    .then(async (response) => {
      if (response.status === 401 || response.status === 403) {
        handleGoogleAuthExpiry('Google authentication expired');
        setPlaylistStatus('Google authentication expired', '#f66');
        return [];
      }

      if (!response.ok) {
        throw new Error(`YouTube API error ${response.status}`);
      }

      const payload = await response.json();
      return payload.items?.map((item) => ({
        id: item.id,
        title: item.snippet?.title ?? 'Untitled playlist',
      })) ?? [];
    })
    .then((playlists) => {
      youtubePlaylists = playlists;
      populatePlaylistDropdown(playlists);
      if (playlists.length === 0) {
        setPlaylistStatus('No playlists found', '#FF9800');
        setPlaylistControlsEnabled(false);
      } else {
        setPlaylistStatus(`${playlists.length} playlists loaded`, '#4CAF50');
        setPlaylistControlsEnabled(true);
        if (!currentPlaylistId && playlists[0]) {
          loadPlaylist(playlists[0].id);
        }
      }
    })
    .catch((error) => {
      console.error('[YouTube] Failed to load playlists:', error);
      setPlaylistStatus('Failed to load playlists', '#f66');
      setPlaylistControlsEnabled(false);
    });
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
      latestCadence = cadence;

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
  if (!playerReady || !youtubePlayer?.setPlaybackRate) {
    return;
  }

  const rate = cadenceToPlaybackRate(cadence);
  youtubePlayer.setPlaybackRate(rate);
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
  setPlaylistControlsEnabled(false);
  if (elements.googleSignIn) {
    elements.googleSignIn.disabled = false;
    elements.googleSignIn.textContent = 'Sign in with Google';
  }
}

function connectStepServerFallback() {
  if (typeof connectToStepServer !== 'function') {
    return;
  }

  connectToStepServer(
    (steps) => {
      if (!Number.isFinite(latestSteps)) {
        updateStepDisplays(steps);
      }
    },
    (statusText, color) => {
      if (elements.wsStatus) {
        elements.wsStatus.textContent = statusText;
        elements.wsStatus.style.color = color;
      }
      if (elements.hudOfflineBadge) {
        elements.hudOfflineBadge.hidden = statusText === 'Connected';
      }
    },
    (bpm) => {
      if (elements.hudBpm) {
        elements.hudBpm.textContent = Number.isFinite(bpm) ? Math.round(bpm) : '--';
      }
    },
    (cadence) => {
      if (!Number.isFinite(latestCadence)) {
        applyCadenceToPlayer(cadence);
      }
    },
  );
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
