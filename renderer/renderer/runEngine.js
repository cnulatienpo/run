let plan = [];
let cursor = 0;
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
// HUD transport controls talk exclusively to this atom engine; legacy background players stay isolated.

export function initVideos() {
  A = document.getElementById("v1");
  B = document.getElementById("v2");
  console.log('[runEngine] Initialized videos:', { A: A?.id, B: B?.id });
  
  if (!A || !B) {
    console.error('[runEngine] Video elements not found! v1:', A, 'v2:', B);
    return;
  }
  
  active = A;
  standby = B;
  
  // Ensure initial visibility
  active.classList.add('active');
  console.log('[runEngine] Active video set to:', active.id);
}

export async function startRun(planInput) {
  if (Array.isArray(planInput) && planInput.length) {
    plan = planInput;
    cursor = 0;
    lastVideoUrl = null;
  }
  backgroundStartIssueLogged = false;
  
  if (!A || !B) {
    initVideos();
  }
  
  if (!active || !standby || !plan.length) {
    return;
  }
  if (engineState === 'running') {
    console.log('[runEngine] Ignoring startRun - engine already running');
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

export function pauseRun() {
  if (engineState === 'idle') {
    return;
  }
  engineState = 'paused';
  abortPendingLoad();
  loadingNext = false;
  isCrossfading = false;

  [active, standby].forEach((video) => {
    if (!video) return;
    video.pause();
    video.onended = null;
  });
}

export function stopRun() {
  engineState = 'idle';
  abortPendingLoad();
  loadingNext = false;
  isCrossfading = false;
  cursor = 0;
  lastVideoUrl = null;

  [active, standby].forEach((video) => {
    if (!video) return;
    video.onended = null;
    video.oncanplay = null;
    video.onerror = null;
    try {
      video.pause();
      video.currentTime = 0;
    } catch (err) {
      console.warn('[runEngine] Failed to reset video state:', err);
    }
    // Keep sources intact; transport stop should leave videos idle, not unloaded
  });

  if (A && B) {
    active = A;
    standby = B;
    A.classList.add('active');
    B.classList.remove('active');
  }
}

export function getRunState() {
  return engineState;
}

function nextAtom() {
  if (!plan?.length) {
    return null;
  }
  const atom = plan[cursor];
  cursor = (cursor + 1) % plan.length;
  return atom;
}

function loadNextAtom(skipCount = 0) {
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

  const atom = nextAtom();
  if (!atom) return;
console.log("[runEngine] fetching atom:", atom);

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
      standby.className = "atom-video " + (Math.random() > 0.5 ? "dark" : "light");

      standby.oncanplay = () => handleStandbyReady(videoUrl);
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

function handleStandbyReady(videoUrl) {
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
