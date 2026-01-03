let plan = [];
let cursor = 0;
let currentAtomIndex = null;
let A = null;
let B = null;
let active = null;
let standby = null;
let loadingNext = false;
let isCrossfading = false;
let lastVideoUrl = null;
let engineState = 'idle'; // idle | running | paused
let pendingLoadController = null;
let backgroundStartIssueLogged = false;
const timers = new Set();
const history = [];

// HUD transport controls talk exclusively to this atom engine; legacy background players stay isolated.

export function initVideos() {
  A = document.getElementById('v1');
  B = document.getElementById('v2');
  console.log('[runEngine] Initialized videos:', { A: A?.id, B: B?.id });

  if (!A || !B) {
    console.error('[runEngine] Video elements not found! v1:', A, 'v2:', B);
    return;
  }

  active = A;
  standby = B;

  // Ensure initial visibility
  active.classList.add('active');
  standby.classList.remove('active');
  console.log('[runEngine] Active video set to:', active.id);
}

function ensureVideosReady() {
  if (!A || !B) {
    initVideos();
  }
  return Boolean(A && B && active && standby);
}

function normalizeIndex(index) {
  if (!plan.length) return 0;
  const mod = index % plan.length;
  return mod < 0 ? mod + plan.length : mod;
}

export function setPlan(planInput) {
  if (Array.isArray(planInput) && planInput.length) {
    plan = [...planInput];
    cursor = 0;
    history.length = 0;
    currentAtomIndex = null;
    lastVideoUrl = null;
    console.log('[runEngine] Plan loaded with', plan.length, 'atoms');
  }
}

export async function start(planInput) {
  if (planInput?.length) {
    setPlan(planInput);
  }

  backgroundStartIssueLogged = false;

  if (!ensureVideosReady()) {
    console.warn('[runEngine] Cannot start — videos not ready');
    return;
  }

  if (!plan.length) {
    console.warn('[runEngine] Cannot start — empty plan');
    return;
  }
  if (engineState === 'running') {
    console.log('[runEngine] Ignoring start() — engine already running');
    return;
  }

  engineState = 'running';

  if (active) {
    active.onended = () => {
      if (!isCrossfading && engineState === 'running') {
        loadNextAtom();
      }
    };
    if (active.paused && active.src) {
      active.play().catch((err) => console.warn('[runEngine] Resume active play blocked:', err));
    }
  }
  if (standby && standby.paused && standby.src) {
    standby.play().catch((err) => console.warn('[runEngine] Resume standby play blocked:', err));
  }

  loadNextAtom();
}

// NOTE: pause() behaves as a hard stop. Resuming requires start() which rebuilds playback from the plan head.
export function pause() {
  if (engineState === 'idle') {
    return;
  }
  stopInternal('paused');
}

export function stop() {
  stopInternal('idle');
}

export function next() {
  if (!plan.length) {
    console.warn('[runEngine] next() ignored — no plan loaded');
    return;
  }
  if (!ensureVideosReady()) return;

  if (currentAtomIndex !== null) {
    history.push(currentAtomIndex);
  }
  engineState = 'running';
  resetActivePlayback();
  loadNextAtom(0, cursor);
}

export function prev() {
  if (!plan.length) {
    console.warn('[runEngine] prev() ignored — no plan loaded');
    return;
  }
  if (!ensureVideosReady()) return;

  const targetIndex = history.length ? history.pop() : currentAtomIndex;
  if (typeof targetIndex !== 'number') {
    console.log('[runEngine] prev() restarting current atom');
    resetActivePlayback(true);
    return;
  }
  cursor = normalizeIndex(targetIndex);
  engineState = 'running';
  resetActivePlayback();
  loadNextAtom(0, targetIndex);
}

export function isRunning() {
  return engineState === 'running';
}

export function getState() {
  return {
    running: engineState === 'running',
    currentAtomIndex,
    totalAtoms: plan.length,
  };
}

export function setVolume(volume) {
  const normalized = Math.max(0, Math.min(100, Number(volume)));
  [A, B].forEach((video) => {
    if (!video) return;
    video.volume = normalized / 100;
    video.muted = normalized === 0;
  });
}

export function setPlaybackRate(rate) {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  [active, standby].forEach((video) => {
    if (video) {
      video.playbackRate = safeRate;
    }
  });
}

function stopInternal(nextState) {
  engineState = nextState;
  abortPendingLoad();
  clearTimers();
  loadingNext = false;
  isCrossfading = false;
  cursor = 0;
  lastVideoUrl = null;
  currentAtomIndex = null;
  history.length = 0;

  [active, standby].forEach((video) => {
    if (!video) return;
    video.onended = null;
    video.oncanplay = null;
    video.onerror = null;
    try {
      video.pause();
      video.currentTime = 0;
      video.removeAttribute('src');
      video.load();
    } catch (err) {
      console.warn('[runEngine] Failed to reset video state:', err);
    }
  });

  if (A && B) {
    active = A;
    standby = B;
    A.classList.add('active');
    B.classList.remove('active');
  }
}

function resetActivePlayback(restartOnly = false) {
  abortPendingLoad();
  clearTimers();
  isCrossfading = false;
  loadingNext = false;

  [active, standby].forEach((video) => {
    if (!video) return;
    try {
      video.pause();
      video.currentTime = 0;
    } catch (err) {
      console.warn('[runEngine] Failed to reset playback state:', err);
    }
  });

  if (restartOnly && active) {
    active.play().catch((err) => console.warn('[runEngine] Restart current atom failed:', err));
  }
}

function nextAtom(forcedIndex) {
  if (!plan?.length) {
    return null;
  }
  const index = typeof forcedIndex === 'number' ? normalizeIndex(forcedIndex) : cursor;
  const atom = plan[index];
  cursor = normalizeIndex(index + 1);
  return { atom, index };
}

function loadNextAtom(skipCount = 0, forcedIndex) {
  if (engineState !== 'running') {
    return;
  }
  if (loadingNext || isCrossfading) {
    return;
  }
  if (!plan?.length) {
    return;
  }
  if (skipCount >= plan.length) {
    console.warn('[runEngine] Exhausted atom list without valid source');
    return;
  }

  const selection = nextAtom(forcedIndex);
  if (!selection) return;
  const { atom, index } = selection;
  console.log('[runEngine] fetching atom:', atom);

  loadingNext = true;
  abortPendingLoad();
  pendingLoadController = new AbortController();
  fetch(atom.url, { signal: pendingLoadController.signal })
    .then((r) => {
      if (!r.ok) {
        throw new Error('Failed to fetch atom metadata');
      }
      return r.json();
    })
    .then((meta) => {
      pendingLoadController = null;
      if (engineState !== 'running') {
        loadingNext = false;
        return;
      }
      const videoUrl = meta?.signed_url;
      if (!videoUrl) {
        console.error('[runEngine] No signed_url in atom metadata:', meta);
        loadingNext = false;
        loadNextAtom(skipCount + 1);
        return;
      }

      if (videoUrl === lastVideoUrl) {
        console.warn('[runEngine] Duplicate signed_url, skipping atom');
        loadingNext = false;
        loadNextAtom(skipCount + 1);
        return;
      }

      standby.oncanplay = null;
      standby.onerror = null;
      standby.src = '';
      standby.src = videoUrl;
      standby.playbackRate = 1 / (atom.stretch || 1);
      standby.className = 'atom-video ' + (Math.random() > 0.5 ? 'dark' : 'light');

      standby.oncanplay = () => handleStandbyReady(videoUrl, index);
      standby.onerror = (e) => {
        logBackgroundStartupIssue('[runEngine] Video error on standby layer', e || standby.error);
        standby.onerror = null;
        loadingNext = false;
        loadNextAtom(skipCount + 1);
      };
    })
    .catch((error) => {
      pendingLoadController = null;
      if (error?.name === 'AbortError') {
        console.log('[runEngine] Atom load aborted');
        return;
      }
      logBackgroundStartupIssue('[runEngine] Failed to load atom metadata:', error);
      loadingNext = false;
      loadNextAtom(skipCount + 1);
    });
}

function handleStandbyReady(videoUrl, atomIndex) {
  if (engineState !== 'running') {
    loadingNext = false;
    return;
  }
  standby.oncanplay = null;
  if (isCrossfading) {
    return;
  }

  isCrossfading = true;
  standby.play().catch((err) => logBackgroundStartupIssue('[runEngine] Autoplay blocked on standby layer', err));

  const outgoing = active;
  if (outgoing) {
    outgoing.classList.remove('active');
  }
  standby.classList.add('active');

  active = standby;
  standby = outgoing;
  lastVideoUrl = videoUrl;
  currentAtomIndex = atomIndex;
  isCrossfading = false;
  pendingLoadController = null;
  loadingNext = false;

  if (active) {
    active.onended = () => {
      if (!isCrossfading && engineState === 'running') {
        loadNextAtom();
      }
    };
  }

  loadNextAtom();
}

function logBackgroundStartupIssue(message, error) {
  if (backgroundStartIssueLogged) {
    return;
  }
  backgroundStartIssueLogged = true;
  console.warn(message, error);
}

function abortPendingLoad() {
  if (pendingLoadController) {
    pendingLoadController.abort();
    pendingLoadController = null;
  }
}

function clearTimers() {
  timers.forEach((id) => clearTimeout(id));
  timers.clear();
}

// Legacy surface to keep older HUD files loading while the new transport API is adopted.
export const startRun = start;
export const pauseRun = pause;
export const stopRun = stop;
export const getRunState = () => engineState;
