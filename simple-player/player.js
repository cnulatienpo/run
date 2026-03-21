const TEST_MODE = true;

const TEST_CONFIG = {
  enabled: TEST_MODE,
  minVisibleSeconds: 1.0,
  maxVisibleSeconds: 2.0,
  crossfadeSeconds: 1.5,
  standbyRetryMs: 120,
  loadDelayMinMs: 200,
  loadDelayMaxMs: 1000,
  switchSpamMinSeconds: 2,
  switchSpamMaxSeconds: 5,
  autoStopStartMinMs: 4000,
  autoStopStartMaxMs: 7000,
  longSessionDurationSeconds: 30 * 60,
  worldPoolSize: 2,
  invalidClipWorld: 'clown',
  invalidClipIndex: 1,
  memoryLogIntervalMs: 5000,
};

const clipGroups = {
  grey: [],
  clown: [],
};

const WORLD_DEFINITIONS = {
  grey: {
    label: 'Grey',
    folder: 'videos/grey',
    clips: [
      { file: 'clip1.mp4', floorAngle: 'flat', speed: 'run', motion: 'glide' },
      { file: 'clip2.mp4', floorAngle: 'ramp_up', speed: 'run', motion: 'glide' },
      { file: 'clip3.mp4', floorAngle: 'flat', speed: 'run', motion: 'sprint' },
      { file: 'clip4.mp4', floorAngle: 'ramp_down', speed: 'run', motion: 'sprint' },
      { file: 'clip5.mp4', floorAngle: 'flat', speed: 'run', motion: 'glide' },
    ],
  },
  clown: {
    label: 'Clown',
    folder: 'videos/clown',
    clips: [
      { file: 'clip1.mp4', floorAngle: 'flat', speed: 'run', motion: 'bounce' },
      { file: 'clip2.mp4', floorAngle: 'ramp_up', speed: 'run', motion: 'bounce' },
      { file: 'clip3.mp4', floorAngle: 'flat', speed: 'run', motion: 'glide' },
      { file: 'clip4.mp4', floorAngle: 'ramp_down', speed: 'run', motion: 'bounce' },
      { file: 'clip5.mp4', floorAngle: 'flat', speed: 'run', motion: 'sprint' },
    ],
  },
};

const CROSSFADE_SECONDS = TEST_CONFIG.enabled ? TEST_CONFIG.crossfadeSeconds : 1.5;
const MIN_VISIBLE_SECONDS = TEST_CONFIG.enabled ? TEST_CONFIG.minVisibleSeconds : 2.5;
const MAX_VISIBLE_SECONDS = TEST_CONFIG.enabled ? TEST_CONFIG.maxVisibleSeconds : 4.5;
const ENTRY_MIN_RATIO = 0.1;
const ENTRY_MAX_RATIO = 0.8;
const WRAP_SAFETY_SECONDS = 0.05;
const TRANSITION_RETRY_LIMIT = 5;
const STANDBY_READY_STATE = 3;
const STANDBY_RETRY_MS = TEST_CONFIG.enabled ? TEST_CONFIG.standbyRetryMs : 120;
const STALL_DETECTION_MS = 1500;
const ANGLE_COMPATIBILITY = {
  flat: ['flat', 'ramp_up', 'ramp_down'],
  ramp_up: ['flat', 'ramp_up'],
  ramp_down: ['flat', 'ramp_down'],
};

const playerShell = document.getElementById('playerShell');
const videoA = document.getElementById('videoA');
const videoB = document.getElementById('videoB');
const playButton = document.getElementById('playButton');
const durationSelect = document.getElementById('durationSelect');
const worldButtons = Array.from(document.querySelectorAll('[data-world-button]'));
const currentWorldLabel = document.getElementById('currentWorldLabel');
const nextWorldLabel = document.getElementById('nextWorldLabel');
const fullscreenButton = document.getElementById('fullscreenButton');
const statusReadout = document.getElementById('statusReadout');
const musicUpload = document.getElementById('musicUpload');
const musicPlayer = document.getElementById('musicPlayer');

let activeVideo = videoA;
let standbyVideo = videoB;
let currentWorld = 'grey';
let pendingWorld = null;
let worldQueues = {};
let lastPlayedByWorld = {};
let continuityState = new Map();

let playbackStarted = false;
let sessionRunning = false;
let stopAfterCurrentClip = false;
let pendingFade = false;
let isCrossfading = false;
let currentPlaybackState = null;
let nextPreparedClip = null;
let sessionDurationSeconds = Number(durationSelect?.value || 900);
let sessionStartedAt = 0;
let sessionDeadlineAt = 0;
let sessionIntervalId = 0;
let musicObjectUrl = null;
let stressSwitchTimerId = 0;
let stressControlTimerId = 0;
let memoryLogIntervalId = 0;
let stallWatchdogIntervalId = 0;
let failedClipSrcs = new Set();
let clipHistory = [];
let standbyLoadTarget = null;
let standbyLoadAttemptedAt = 0;
let fadeScheduledAt = 0;
let transitionCounter = 0;
let standbyReadyPollTimerId = 0;
let delayedFadeStartedAt = 0;
const videoLoadState = new WeakMap();

function logEvent(event, details = {}, level = 'log') {
  const payload = {
    event,
    timestamp: Date.now(),
    isoTime: new Date().toISOString(),
    currentWorld,
    pendingWorld,
    activeClip: currentPlaybackState?.clip?.src || null,
    standbyClip: nextPreparedClip?.src || null,
    activeVideoId: activeVideo?.id || null,
    standbyVideoId: standbyVideo?.id || null,
    ...details,
  };

  console[level](payload);
}

function initializeClipGroups() {
  Object.entries(WORLD_DEFINITIONS).forEach(([worldKey, definition]) => {
    const sourceClips = TEST_CONFIG.enabled
      ? definition.clips.slice(0, TEST_CONFIG.worldPoolSize)
      : definition.clips;

    clipGroups[worldKey] = sourceClips.map((clip, index) => {
      const src = `${definition.folder}/${clip.file}`;
      const useInvalidSrc = TEST_CONFIG.enabled
        && worldKey === TEST_CONFIG.invalidClipWorld
        && index === TEST_CONFIG.invalidClipIndex;

      return {
        src: useInvalidSrc ? `${definition.folder}/missing-stress-test.mp4` : src,
        originalSrc: src,
        floorAngle: clip.floorAngle,
        speed: clip.speed,
        motion: clip.motion,
        world: worldKey,
        clipName: clip.file,
        testInjectedError: useInvalidSrc,
      };
    });
  });

  logEvent('test_mode_configured', {
    enabled: TEST_CONFIG.enabled,
    clipPoolSizes: Object.fromEntries(Object.entries(clipGroups).map(([worldKey, clips]) => [worldKey, clips.length])),
    injectedInvalidClip: TEST_CONFIG.enabled
      ? `${TEST_CONFIG.invalidClipWorld}:${TEST_CONFIG.invalidClipIndex}`
      : null,
  });
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function formatSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getPlaybackRate() {
  return randomBetween(1.0, 1.1);
}

function getVisibleDuration(video) {
  const duration = Number(video.duration || 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    return MIN_VISIBLE_SECONDS;
  }

  return Math.min(duration, randomBetween(MIN_VISIBLE_SECONDS, MAX_VISIBLE_SECONDS));
}

function resetVideo(video) {
  const loadState = videoLoadState.get(video);
  if (loadState?.timeoutId) {
    window.clearTimeout(loadState.timeoutId);
  }

  videoLoadState.set(video, {
    requestedClipSrc: null,
    loadedClipSrc: null,
    timeoutId: 0,
  });

  video.pause();
  video.removeAttribute('src');
  video.load();
  video.playbackRate = 1;
  video.dataset.lastTimeupdateAt = '';
}

function stopVideo(video) {
  video.pause();
  video.classList.remove('is-active');
  video.playbackRate = 1;
  try {
    video.currentTime = 0;
  } catch (error) {
    // Some browsers reject seeking before metadata is loaded.
  }
}

function buildShuffledQueue(worldKey) {
  const clips = [...(clipGroups[worldKey] || [])];
  const previousSrc = lastPlayedByWorld[worldKey];

  for (let index = clips.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [clips[index], clips[swapIndex]] = [clips[swapIndex], clips[index]];
  }

  if (clips.length > 1 && clips[0].src === previousSrc) {
    clips.push(clips.shift());
  }

  return clips;
}

function ensureWorldQueue(worldKey) {
  if (!worldQueues[worldKey] || worldQueues[worldKey].length === 0) {
    worldQueues[worldKey] = buildShuffledQueue(worldKey);
  }
}

function isValidTransition(prevClip, nextClip) {
  if (!prevClip || !nextClip) {
    return true;
  }

  const allowedAngles = ANGLE_COMPATIBILITY[prevClip.floorAngle] || ['flat'];
  if (!allowedAngles.includes(nextClip.floorAngle)) {
    return false;
  }

  if (prevClip.motion === nextClip.motion) {
    return true;
  }

  const similarMotion = [prevClip.motion, nextClip.motion].every((motion) => ['glide', 'sprint', 'bounce'].includes(motion));
  return similarMotion && prevClip.floorAngle === 'flat' && nextClip.floorAngle === 'flat';
}

function takeNextClipForWorld(worldKey, previousClip = currentPlaybackState?.clip) {
  ensureWorldQueue(worldKey);
  const queue = worldQueues[worldKey];
  let fallbackClip = null;

  for (let attempt = 0; attempt < TRANSITION_RETRY_LIMIT; attempt += 1) {
    if (queue.length === 0) {
      worldQueues[worldKey] = buildShuffledQueue(worldKey);
    }

    const candidate = worldQueues[worldKey].shift();
    if (!candidate) {
      break;
    }

    if (!fallbackClip) {
      fallbackClip = candidate;
    }

    const repeatsImmediately = previousClip && previousClip.src === candidate.src;
    if (repeatsImmediately) {
      logEvent('repeat_candidate_rejected', {
        world: worldKey,
        previousClip: previousClip.src,
        candidateClip: candidate.src,
        attempt,
      }, 'warn');
    }

    if (!repeatsImmediately && isValidTransition(previousClip, candidate)) {
      lastPlayedByWorld[worldKey] = candidate.src;
      return { ...candidate };
    }

    worldQueues[worldKey].push(candidate);
  }

  if (!fallbackClip) {
    return null;
  }

  if (previousClip && fallbackClip.src === previousClip.src && worldQueues[worldKey].length > 0) {
    const nextAvailable = worldQueues[worldKey].shift();
    if (nextAvailable) {
      lastPlayedByWorld[worldKey] = nextAvailable.src;
      return { ...nextAvailable };
    }
  }

  lastPlayedByWorld[worldKey] = fallbackClip.src;
  return { ...fallbackClip };
}

function applyPendingWorldIfNeeded() {
  if (pendingWorld && pendingWorld !== currentWorld) {
    logEvent('world_switch_applied', {
      fromWorld: currentWorld,
      toWorld: pendingWorld,
    });
    currentWorld = pendingWorld;
    pendingWorld = null;
  }
}

function chooseEntryOffset(video, clip) {
  const duration = Number(video.duration || 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  const storedState = continuityState.get(clip.src);
  if (storedState) {
    const storedOffset = Math.min(storedState.nextOffsetSeconds, Math.max(0, duration - WRAP_SAFETY_SECONDS));
    logEvent('entry_offset_reused', {
      clip: clip.src,
      entryOffset: storedOffset,
      clipDuration: duration,
      entryRatio: duration > 0 ? storedOffset / duration : 0,
    });
    return storedOffset;
  }

  const minOffset = duration * ENTRY_MIN_RATIO;
  const maxOffset = duration * ENTRY_MAX_RATIO;
  const offset = Math.min(Math.max(minOffset, randomBetween(minOffset, maxOffset)), Math.max(0, duration - WRAP_SAFETY_SECONDS));
  logEvent('entry_offset_generated', {
    clip: clip.src,
    entryOffset: offset,
    clipDuration: duration,
    entryRatio: duration > 0 ? offset / duration : 0,
    minRatio: ENTRY_MIN_RATIO,
    maxRatio: ENTRY_MAX_RATIO,
  });
  return offset;
}

function buildPlaybackPlan(video, clip) {
  const duration = Number(video.duration || 0);
  const playbackRate = getPlaybackRate(clip);
  if (!Number.isFinite(duration) || duration <= 0) {
    return {
      entryOffsetSeconds: 0,
      visibleDurationSeconds: MIN_VISIBLE_SECONDS,
      fadeStartSeconds: Math.max(0, MIN_VISIBLE_SECONDS - CROSSFADE_SECONDS),
      wraps: false,
      playbackRate,
      clipDurationSeconds: 0,
    };
  }

  const entryOffsetSeconds = chooseEntryOffset(video, clip);
  const visibleDurationSeconds = getVisibleDuration(video);
  const fadeStartSeconds = Math.max(0.2, visibleDurationSeconds - CROSSFADE_SECONDS);
  const wraps = entryOffsetSeconds + visibleDurationSeconds > duration;
  const nextOffsetSeconds = (entryOffsetSeconds + visibleDurationSeconds) % duration;

  continuityState.set(clip.src, { nextOffsetSeconds });

  return {
    entryOffsetSeconds,
    visibleDurationSeconds,
    fadeStartSeconds,
    wraps,
    playbackRate,
    clipDurationSeconds: duration,
  };
}

function getJourneyElapsed(video, playbackState) {
  if (!playbackState || !Number.isFinite(video.duration) || video.duration <= 0) {
    return 0;
  }

  const rawElapsed = video.currentTime - playbackState.plan.entryOffsetSeconds;
  if (!playbackState.didWrap) {
    return rawElapsed >= 0 ? rawElapsed : video.duration + rawElapsed;
  }

  return (video.duration - playbackState.plan.entryOffsetSeconds) + video.currentTime;
}

function shouldStartFade(video, playbackState) {
  return getJourneyElapsed(video, playbackState) >= playbackState.plan.fadeStartSeconds;
}
function isStandbyReadyForCrossfade() {
  return Boolean(nextPreparedClip) && standbyVideo.readyState >= STANDBY_READY_STATE;
}

function extendCurrentClip() {
  if (!currentPlaybackState || !Number.isFinite(activeVideo.duration) || activeVideo.duration <= 0) {
    return;
  }

  currentPlaybackState.isExtended = true;

  const journeyElapsed = getJourneyElapsed(activeVideo, currentPlaybackState);
  const clipDuration = currentPlaybackState.plan.clipDurationSeconds || Number(activeVideo.duration || 0);
  const wrappedElapsed = clipDuration > 0 ? journeyElapsed % clipDuration : journeyElapsed;
  const nextOffsetSeconds = clipDuration > 0
    ? (currentPlaybackState.plan.entryOffsetSeconds + wrappedElapsed) % clipDuration
    : currentPlaybackState.plan.entryOffsetSeconds;

  continuityState.set(currentPlaybackState.clip.src, { nextOffsetSeconds });

  logEvent('clip_extended_duration', {
    clip: currentPlaybackState.clip.src,
    extendedByMs: Math.max(0, Date.now() - fadeScheduledAt),
    journeyElapsedSeconds: journeyElapsed,
    currentTime: activeVideo.currentTime,
    didWrap: currentPlaybackState.didWrap,
  }, 'warn');
}

function clearStandbyReadyPoll() {
  if (standbyReadyPollTimerId) {
    window.clearTimeout(standbyReadyPollTimerId);
    standbyReadyPollTimerId = 0;
  }
}

function beginDelayedCrossfadePolling() {
  if (standbyReadyPollTimerId || !currentPlaybackState || isCrossfading) {
    return;
  }

  delayedFadeStartedAt = delayedFadeStartedAt || Date.now();
  logEvent('fade_delayed_waiting_for_standby', {
    clip: currentPlaybackState.clip.src,
    standbyClip: nextPreparedClip?.src || null,
    standbyReadyState: standbyVideo.readyState,
    standbyNetworkState: standbyVideo.networkState,
  }, 'warn');

  const poll = () => {
    if (!playbackStarted || !currentPlaybackState || isCrossfading) {
      clearStandbyReadyPoll();
      return;
    }

    if (isStandbyReadyForCrossfade()) {
      logEvent('standby_ready', {
        standbyClip: nextPreparedClip?.src || null,
        waitDurationMs: delayedFadeStartedAt ? Date.now() - delayedFadeStartedAt : 0,
        standbyReadyState: standbyVideo.readyState,
      });
      clearStandbyReadyPoll();
      void crossfadeToPreparedClip('delayed_ready');
      return;
    }

    standbyReadyPollTimerId = window.setTimeout(poll, 100);
  };

  standbyReadyPollTimerId = window.setTimeout(poll, 100);
}

function updateWorldButtons() {
  worldButtons.forEach((button) => {
    const worldKey = button.dataset.worldButton;
    const isCurrent = worldKey === currentWorld;
    const isPending = pendingWorld === worldKey;
    button.classList.toggle('is-current', isCurrent);
    button.classList.toggle('is-pending', isPending);
    button.setAttribute('aria-pressed', String(isCurrent || isPending));
  });

  currentWorldLabel.textContent = WORLD_DEFINITIONS[currentWorld]?.label || currentWorld;
  nextWorldLabel.textContent = pendingWorld ? WORLD_DEFINITIONS[pendingWorld]?.label || pendingWorld : '—';
}

function updateStatusReadout() {
  const elapsedSeconds = sessionStartedAt ? (Date.now() - sessionStartedAt) / 1000 : 0;
  const remainingSeconds = sessionDeadlineAt ? Math.max(0, (sessionDeadlineAt - Date.now()) / 1000) : sessionDurationSeconds;
  const timerLine = sessionRunning
    ? `${formatSeconds(elapsedSeconds)} elapsed / ${formatSeconds(remainingSeconds)} left`
    : playbackStarted
      ? 'finishing current clip'
      : `ready / ${formatSeconds(sessionDurationSeconds)} session`;

  statusReadout.innerHTML = [
    `<strong>test mode</strong> ${TEST_CONFIG.enabled ? 'enabled' : 'disabled'}`,
    `<strong>current clip path</strong> ${currentPlaybackState?.clip?.src || 'waiting'}`,
    `<strong>next clip path</strong> ${nextPreparedClip?.src || 'waiting'}`,
    `<strong>current world</strong> ${WORLD_DEFINITIONS[currentWorld]?.label || currentWorld}`,
    `<strong>next world</strong> ${pendingWorld ? WORLD_DEFINITIONS[pendingWorld]?.label || pendingWorld : '—'}`,
    `<strong>playback rate</strong> ${(currentPlaybackState?.plan?.playbackRate || nextPreparedClip?.previewPlaybackRate || 1).toFixed(2)}x`,
    `<strong>entry offset</strong> ${(currentPlaybackState?.plan?.entryOffsetSeconds || 0).toFixed(2)}s`,
    `<strong>planned duration</strong> ${(currentPlaybackState?.plan?.visibleDurationSeconds || 0).toFixed(2)}s`,
    `<strong>timer</strong> ${timerLine}`,
  ].join('\n');
}

function scheduleVideoLoad(video, clip, reason = 'prepare') {
  if (!clip) {
    standbyLoadTarget = null;
    nextPreparedClip = null;
    resetVideo(video);
    updateStatusReadout();
    return;
  }

  const existingState = videoLoadState.get(video) || {
    requestedClipSrc: null,
    loadedClipSrc: null,
    timeoutId: 0,
  };

  if (existingState.requestedClipSrc === clip.src || existingState.loadedClipSrc === clip.src) {
    standbyLoadTarget = clip.src;
    logEvent('clip_load_reused', {
      clip: clip.src,
      world: clip.world,
      reason,
      alreadyLoaded: existingState.loadedClipSrc === clip.src,
    });
    updateStatusReadout();
    return;
  }

  const delayMs = TEST_CONFIG.enabled ? Math.round(randomBetween(TEST_CONFIG.loadDelayMinMs, TEST_CONFIG.loadDelayMaxMs)) : 0;
  standbyLoadTarget = clip.src;
  standbyLoadAttemptedAt = Date.now();
  resetVideo(video);

  const loadState = {
    requestedClipSrc: clip.src,
    loadedClipSrc: null,
    timeoutId: 0,
  };
  videoLoadState.set(video, loadState);

  logEvent('clip_load_scheduled', {
    clip: clip.src,
    world: clip.world,
    reason,
    artificialDelayMs: delayMs,
    invalidClip: Boolean(clip.testInjectedError),
  });

  loadState.timeoutId = window.setTimeout(() => {
    const latestState = videoLoadState.get(video);
    if (!latestState || latestState.requestedClipSrc !== clip.src || latestState.loadedClipSrc === clip.src) {
      return;
    }

    if (video !== standbyVideo && video !== activeVideo) {
      return;
    }

    video.src = clip.src;
    video.load();
    latestState.loadedClipSrc = clip.src;
    latestState.timeoutId = 0;
    logEvent('clip_load_started', {
      clip: clip.src,
      world: clip.world,
      reason,
      artificialDelayMs: delayMs,
    });
  }, delayMs);

  updateStatusReadout();
}

function setStandbySource(clip) {
  if (!clip) {
    scheduleVideoLoad(standbyVideo, null, 'clear');
    return;
  }

  nextPreparedClip = {
    ...clip,
    previewPlaybackRate: getPlaybackRate(clip),
  };

  scheduleVideoLoad(standbyVideo, clip, 'standby_prepare');
}

function prepareNextStandbyClip() {
  const targetWorld = pendingWorld || currentWorld;
  setStandbySource(takeNextClipForWorld(targetWorld, currentPlaybackState?.clip));
}

async function safePlay(video) {
  try {
    await video.play();
  } catch (error) {
    logEvent('playback_blocked_or_failed', {
      clip: video.currentSrc || video.src || null,
      message: error instanceof Error ? error.message : String(error),
    }, 'warn');
  }
}

async function waitForMetadata(video, clip) {
  if (video.readyState >= 1) {
    return;
  }

  await new Promise((resolve, reject) => {
    const onLoadedMetadata = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error(`Failed to load metadata for ${clip?.src || video.currentSrc || video.src}`));
    };

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

function markClipFailed(clip, message) {
  if (!clip) {
    return;
  }

  failedClipSrcs.add(clip.src);
  worldQueues[clip.world] = (worldQueues[clip.world] || []).filter((candidate) => candidate.src !== clip.src);
  logEvent('clip_failed', {
    clip: clip.src,
    world: clip.world,
    message,
    invalidClip: Boolean(clip.testInjectedError),
    failedClipCount: failedClipSrcs.size,
  }, 'error');
}

async function primeClipOnVideo(video, clip) {
  if (!clip) {
    return null;
  }

  if (failedClipSrcs.has(clip.src)) {
    logEvent('clip_skipped_after_failure', { clip: clip.src, world: clip.world }, 'warn');
    return null;
  }

  if (!video.src || !video.src.endsWith(clip.src)) {
    scheduleVideoLoad(video, clip, video === standbyVideo ? 'prime_standby' : 'prime_active');
  }

  try {
    await waitForMetadata(video, clip);
  } catch (error) {
    markClipFailed(clip, error instanceof Error ? error.message : String(error));
    return null;
  }

  const plan = buildPlaybackPlan(video, clip);
  video.playbackRate = plan.playbackRate;
  video.currentTime = Math.min(plan.entryOffsetSeconds, Math.max(0, (video.duration || 0) - WRAP_SAFETY_SECONDS));

  logEvent('clip_primed', {
    clip: clip.src,
    world: clip.world,
    playbackRate: plan.playbackRate,
    entryOffset: plan.entryOffsetSeconds,
    entryRatio: plan.clipDurationSeconds > 0 ? plan.entryOffsetSeconds / plan.clipDurationSeconds : 0,
    visibleDuration: plan.visibleDurationSeconds,
    fadeStart: plan.fadeStartSeconds,
    wraps: plan.wraps,
    clipDuration: plan.clipDurationSeconds,
  });

  return {
    clip,
    plan,
    didWrap: false,
    isExtended: false,
    startedAt: Date.now(),
  };
}

async function startPlaybackOnActiveVideo(clip) {
  const playbackState = await primeClipOnVideo(activeVideo, clip);
  if (!playbackState) {
    const fallbackClip = takeNextClipForWorld(currentWorld, currentPlaybackState?.clip || null);
    if (fallbackClip && fallbackClip.src !== clip.src) {
      logEvent('start_clip_recovery', { failedClip: clip.src, fallbackClip: fallbackClip.src }, 'warn');
      return startPlaybackOnActiveVideo(fallbackClip);
    }
    return;
  }

  currentPlaybackState = playbackState;
  activeVideo.classList.add('is-active');
  standbyVideo.classList.remove('is-active');
  await safePlay(activeVideo);
  updateWorldButtons();
  updateStatusReadout();
}

function finishStopAfterClip() {
  pendingFade = false;
  playbackStarted = false;
  sessionRunning = false;
  stopAfterCurrentClip = false;
  nextPreparedClip = null;
  isCrossfading = false;
  clearStandbyReadyPoll();
  fadeScheduledAt = 0;
  delayedFadeStartedAt = 0;
  currentPlaybackState = null;
  stopVideo(activeVideo);
  stopVideo(standbyVideo);
  playButton.textContent = 'Play Session';
  playerShell.style.filter = 'brightness(1)';
  updateWorldButtons();
  updateStatusReadout();
  logEvent('session_stopped');
}

async function crossfadeToPreparedClip(trigger = 'timing') {
  if (pendingFade || isCrossfading || !currentPlaybackState) {
    return;
  }

  if (stopAfterCurrentClip) {
    finishStopAfterClip();
    return;
  }

  if (!nextPreparedClip) {
    prepareNextStandbyClip();
  }

  if (!nextPreparedClip) {
    return;
  }

  pendingFade = true;
  fadeScheduledAt = fadeScheduledAt || Date.now();

  if (!isStandbyReadyForCrossfade()) {
    pendingFade = false;
    extendCurrentClip();
    beginDelayedCrossfadePolling();
    return;
  }

  clearStandbyReadyPoll();
  isCrossfading = true;
  applyPendingWorldIfNeeded();

  const previousPlaybackState = currentPlaybackState;
  const standbyPlaybackState = await primeClipOnVideo(standbyVideo, nextPreparedClip);
  if (!standbyPlaybackState) {
    pendingFade = false;
    isCrossfading = false;
    prepareNextStandbyClip();
    if (currentPlaybackState === previousPlaybackState) {
      extendCurrentClip();
      beginDelayedCrossfadePolling();
    }
    return;
  }

  if (standbyVideo.readyState < STANDBY_READY_STATE) {
    pendingFade = false;
    isCrossfading = false;
    extendCurrentClip();
    beginDelayedCrossfadePolling();
    return;
  }

  const lateByMs = Math.max(0, Date.now() - fadeScheduledAt - 50);
  if (lateByMs > 100) {
    logEvent('crossfade_started_late', {
      lateByMs,
      standbyClip: standbyPlaybackState.clip.src,
      currentClip: previousPlaybackState.clip.src,
    }, 'warn');
  }

  if (trigger === 'delayed_ready') {
    logEvent('fade_started_after_delay', {
      currentClip: previousPlaybackState.clip.src,
      standbyClip: standbyPlaybackState.clip.src,
      delayedByMs: delayedFadeStartedAt ? Date.now() - delayedFadeStartedAt : 0,
    });
  }

  logEvent('clip_transition', {
    transitionNumber: transitionCounter += 1,
    currentClip: previousPlaybackState.clip.src,
    nextClip: standbyPlaybackState.clip.src,
    world: standbyPlaybackState.clip.world,
    playbackRate: standbyPlaybackState.plan.playbackRate,
    entryOffset: standbyPlaybackState.plan.entryOffsetSeconds,
    duration: standbyPlaybackState.plan.visibleDurationSeconds,
    standbyReadyState: standbyVideo.readyState,
    delayedByMs: lateByMs,
  });

  clipHistory.push({
    at: Date.now(),
    from: previousPlaybackState.clip.src,
    to: standbyPlaybackState.clip.src,
    world: standbyPlaybackState.clip.world,
  });

  await safePlay(standbyVideo);
  standbyVideo.classList.add('is-active');
  activeVideo.classList.remove('is-active');

  window.setTimeout(() => {
    const previousActive = activeVideo;
    previousActive.pause();

    activeVideo = standbyVideo;
    standbyVideo = previousActive;
    currentPlaybackState = standbyPlaybackState;

    prepareNextStandbyClip();
    updateWorldButtons();
    updateStatusReadout();
    pendingFade = false;
    isCrossfading = false;
    fadeScheduledAt = 0;
    delayedFadeStartedAt = 0;
  }, CROSSFADE_SECONDS * 1000);
}

function handleActiveVideoTimeUpdate(video) {
  video.dataset.lastTimeupdateAt = String(Date.now());

  if (video !== activeVideo || !currentPlaybackState || pendingFade || isCrossfading) {
    return;
  }

  if (
    Number.isFinite(video.duration)
    && video.duration > 0
    && video.currentTime >= video.duration - WRAP_SAFETY_SECONDS
    && ((currentPlaybackState.plan.wraps && !currentPlaybackState.didWrap) || currentPlaybackState.isExtended)
  ) {
    if (!currentPlaybackState.didWrap) {
      currentPlaybackState.didWrap = true;
    }
    video.currentTime = 0.01;
    void safePlay(video);
    logEvent('clip_wrapped', {
      clip: currentPlaybackState.clip.src,
      world: currentPlaybackState.clip.world,
      extendedLoop: Boolean(currentPlaybackState.isExtended),
    });
    return;
  }

  if (shouldStartFade(video, currentPlaybackState)) {
    fadeScheduledAt = fadeScheduledAt || Date.now();
    void crossfadeToPreparedClip();
  }
}

function handleActiveVideoEnded(video) {
  if (video !== activeVideo || pendingFade || isCrossfading) {
    return;
  }

  if ((currentPlaybackState?.plan.wraps && !currentPlaybackState.didWrap) || currentPlaybackState?.isExtended) {
    if (!currentPlaybackState.didWrap) {
      currentPlaybackState.didWrap = true;
    }
    video.currentTime = 0.01;
    void safePlay(video);
    logEvent('clip_wrapped', {
      clip: currentPlaybackState?.clip?.src || null,
      world: currentPlaybackState?.clip?.world || null,
      extendedLoop: Boolean(currentPlaybackState?.isExtended),
    });
    return;
  }

  logEvent('active_video_ended_before_transition', {
    clip: currentPlaybackState?.clip?.src || null,
  }, 'warn');
  fadeScheduledAt = fadeScheduledAt || Date.now();
  extendCurrentClip();
  beginDelayedCrossfadePolling();
}

function recoverFromVideoError(video) {
  const failedClip = currentPlaybackState?.clip && video === activeVideo
    ? currentPlaybackState.clip
    : nextPreparedClip;

  markClipFailed(failedClip, `Media error on ${video.id}`);

  if (video === activeVideo) {
    pendingFade = false;
    prepareNextStandbyClip();
    fadeScheduledAt = fadeScheduledAt || Date.now();
    void crossfadeToPreparedClip();
    return;
  }

  prepareNextStandbyClip();
}

function attachVideoEvents(video) {
  video.addEventListener('timeupdate', () => handleActiveVideoTimeUpdate(video));
  video.addEventListener('ended', () => handleActiveVideoEnded(video));
  video.addEventListener('loadeddata', () => {
    const loadState = videoLoadState.get(video);
    if (loadState && (video.currentSrc || video.src)) {
      loadState.loadedClipSrc = video.currentSrc || video.src;
    }
    logEvent('video_loaded', {
      video: video.id,
      clip: video.currentSrc || video.src || null,
      readyState: video.readyState,
      networkState: video.networkState,
      loadDelayMs: standbyLoadAttemptedAt ? Date.now() - standbyLoadAttemptedAt : null,
    });
  });
  video.addEventListener('error', () => {
    logEvent('video_error', {
      video: video.id,
      clip: video.currentSrc || video.src || null,
      readyState: video.readyState,
      networkState: video.networkState,
    }, 'error');
    recoverFromVideoError(video);
  });
}

function gracefullyStopSession() {
  sessionRunning = false;
  stopAfterCurrentClip = true;
  playButton.textContent = 'Stopping…';

  if (sessionIntervalId) {
    window.clearInterval(sessionIntervalId);
    sessionIntervalId = 0;
  }

  logEvent('session_stop_requested', {
    clip: currentPlaybackState?.clip?.src || null,
  });
  updateStatusReadout();
}

function beginSessionTimer() {
  sessionRunning = true;
  stopAfterCurrentClip = false;
  sessionDurationSeconds = TEST_CONFIG.enabled
    ? TEST_CONFIG.longSessionDurationSeconds
    : Number(durationSelect.value || 900);
  sessionStartedAt = Date.now();
  sessionDeadlineAt = sessionStartedAt + sessionDurationSeconds * 1000;
  playButton.textContent = 'Stop After Clip';

  if (durationSelect) {
    durationSelect.value = String(sessionDurationSeconds);
  }

  if (sessionIntervalId) {
    window.clearInterval(sessionIntervalId);
  }

  sessionIntervalId = window.setInterval(() => {
    updateStatusReadout();
    if (sessionRunning && Date.now() >= sessionDeadlineAt) {
      gracefullyStopSession();
    }
  }, 250);

  logEvent('session_started', {
    plannedDurationSeconds: sessionDurationSeconds,
    testMode: TEST_CONFIG.enabled,
  });
}

function handleMusicUpload() {
  const [file] = musicUpload.files || [];
  if (!file) {
    return;
  }

  if (musicObjectUrl) {
    URL.revokeObjectURL(musicObjectUrl);
  }

  musicObjectUrl = URL.createObjectURL(file);
  musicPlayer.src = musicObjectUrl;
  musicPlayer.play().catch((error) => {
    logEvent('music_playback_blocked', {
      message: error instanceof Error ? error.message : String(error),
    }, 'warn');
  });
}

function handleFullscreen() {
  logEvent('fullscreen_toggle_requested', {
    currentlyFullscreen: Boolean(document.fullscreenElement),
    duringCrossfade: pendingFade,
  });

  if (!document.fullscreenElement) {
    playerShell.requestFullscreen?.().catch((error) => {
      logEvent('fullscreen_request_failed', {
        message: error instanceof Error ? error.message : String(error),
      }, 'warn');
    });
    return;
  }

  document.exitFullscreen?.().catch((error) => {
    logEvent('fullscreen_exit_failed', {
      message: error instanceof Error ? error.message : String(error),
    }, 'warn');
  });
}

function requestWorldSwitch(selectedWorld, reason = 'manual') {
  pendingWorld = selectedWorld === currentWorld ? null : selectedWorld;
  logEvent('world_switch_requested', {
    requestedWorld: selectedWorld,
    reason,
    willQueue: pendingWorld === selectedWorld,
    activeClip: currentPlaybackState?.clip?.src || null,
  });
  prepareNextStandbyClip();
  updateWorldButtons();
  updateStatusReadout();
}

function handleWorldButtonClick(event) {
  requestWorldSwitch(event.currentTarget.dataset.worldButton, 'ui_click');
}

function handleDurationChange() {
  sessionDurationSeconds = Number(durationSelect.value || 900);
  if (!sessionRunning) {
    updateStatusReadout();
  }
}

function scheduleStressWorldSwitch() {
  if (!TEST_CONFIG.enabled) {
    return;
  }

  if (stressSwitchTimerId) {
    window.clearTimeout(stressSwitchTimerId);
  }

  const delayMs = Math.round(randomBetween(TEST_CONFIG.switchSpamMinSeconds * 1000, TEST_CONFIG.switchSpamMaxSeconds * 1000));
  stressSwitchTimerId = window.setTimeout(() => {
    const targetWorld = currentWorld === 'grey' ? 'clown' : 'grey';
    requestWorldSwitch(targetWorld, 'stress_switch_spam');
    scheduleStressWorldSwitch();
  }, delayMs);
}

function scheduleStressControls() {
  if (!TEST_CONFIG.enabled) {
    return;
  }

  if (stressControlTimerId) {
    window.clearTimeout(stressControlTimerId);
  }

  const delayMs = Math.round(randomBetween(TEST_CONFIG.autoStopStartMinMs, TEST_CONFIG.autoStopStartMaxMs));
  stressControlTimerId = window.setTimeout(() => {
    if (playbackStarted) {
      gracefullyStopSession();
    } else {
      void startSession();
    }

    handleFullscreen();
    window.setTimeout(handleFullscreen, Math.min(1200, CROSSFADE_SECONDS * 1000));
    scheduleStressControls();
  }, delayMs);
}

function startMemoryLogging() {
  if (!TEST_CONFIG.enabled || memoryLogIntervalId) {
    return;
  }

  memoryLogIntervalId = window.setInterval(() => {
    const memory = performance.memory;
    const recentTransitions = clipHistory.slice(-10);
    const duplicateTransitions = recentTransitions.filter((transition, index, arr) => index > 0 && transition.to === arr[index - 1].to).length;

    logEvent('session_health', {
      heapUsed: memory?.usedJSHeapSize || null,
      heapTotal: memory?.totalJSHeapSize || null,
      heapLimit: memory?.jsHeapSizeLimit || null,
      transitionCount: clipHistory.length,
      duplicateTransitions,
      lastTransitionAgeMs: clipHistory.length ? Date.now() - clipHistory[clipHistory.length - 1].at : null,
      stalledClip: currentPlaybackState?.clip?.src || null,
    }, memory ? 'log' : 'warn');
  }, TEST_CONFIG.memoryLogIntervalMs);
}

function startStallWatchdog() {
  if (!TEST_CONFIG.enabled || stallWatchdogIntervalId) {
    return;
  }

  stallWatchdogIntervalId = window.setInterval(() => {
    if (!playbackStarted || !currentPlaybackState) {
      return;
    }

    const lastTimeupdateAt = Number(activeVideo.dataset.lastTimeupdateAt || 0);
    const msSinceUpdate = lastTimeupdateAt ? Date.now() - lastTimeupdateAt : null;
    if (msSinceUpdate && msSinceUpdate > STALL_DETECTION_MS) {
      logEvent('playback_stall_detected', {
        clip: currentPlaybackState.clip.src,
        msSinceUpdate,
        currentTime: activeVideo.currentTime,
        paused: activeVideo.paused,
        readyState: activeVideo.readyState,
      }, 'error');
    }
  }, 500);
}

async function startSession() {
  if (playbackStarted) {
    gracefullyStopSession();
    return;
  }

  const firstClip = takeNextClipForWorld(currentWorld, null);
  if (!firstClip) {
    logEvent('start_failed_no_clips', { world: currentWorld }, 'error');
    return;
  }

  clearStandbyReadyPoll();
  playbackStarted = true;
  beginSessionTimer();
  await startPlaybackOnActiveVideo(firstClip);
  prepareNextStandbyClip();
  updateWorldButtons();
  updateStatusReadout();
}

function initializePlayer() {
  initializeClipGroups();
  attachVideoEvents(videoA);
  attachVideoEvents(videoB);
  worldButtons.forEach((button) => button.addEventListener('click', handleWorldButtonClick));
  playButton.addEventListener('click', () => {
    void startSession();
  });
  durationSelect.addEventListener('change', handleDurationChange);
  fullscreenButton.addEventListener('click', handleFullscreen);
  musicUpload.addEventListener('change', handleMusicUpload);
  document.addEventListener('fullscreenchange', () => {
    logEvent('fullscreen_changed', {
      isFullscreen: Boolean(document.fullscreenElement),
    });
  });

  if (TEST_CONFIG.enabled) {
    startMemoryLogging();
    startStallWatchdog();
    scheduleStressWorldSwitch();
    scheduleStressControls();
  }

  updateWorldButtons();
  updateStatusReadout();
}

initializePlayer();
