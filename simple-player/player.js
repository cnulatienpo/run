const TEST_MODE = (() => {
  const raw = new URLSearchParams(window.location.search).get('test');
  if (raw == null) {
    return false;
  }

  const normalized = String(raw).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
})();

const TEST_CONFIG = {
  enabled: TEST_MODE,
  autoStress: false,
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
  worldPoolSize: 5,
  invalidClipWorld: null,
  invalidClipIndex: -1,
  memoryLogIntervalMs: 5000,
};

const clipGroups = {
  grey: [],
  clown: [],
};

const WORLD_DEFINITIONS = {
  grey: {
    label: 'Grey',
    folder: '/grey',
    clips: [
      { file: 'a.mp4', floorAngle: 'flat', speed: 'run', motion: 'glide' },
      { file: 'grey partial.mp4', floorAngle: 'ramp_up', speed: 'run', motion: 'glide' },
      { file: 'grey white.mp4', floorAngle: 'flat', speed: 'run', motion: 'sprint' },
    ],
  },
  clown: {
    label: 'Clown',
    folder: '/clown',
    clips: [
      { file: 'video-1010505465482296.mp4', floorAngle: 'flat', speed: 'run', motion: 'bounce' },
      { file: 'video-1018069851392524.mp4', floorAngle: 'ramp_up', speed: 'run', motion: 'bounce' },
      { file: 'video-1018070068059169.mp4', floorAngle: 'flat', speed: 'run', motion: 'glide' },
      { file: 'video-1018078004725042.mp4', floorAngle: 'ramp_down', speed: 'run', motion: 'bounce' },
      { file: 'video-1018365751362934.mp4', floorAngle: 'flat', speed: 'run', motion: 'sprint' },
    ],
  },
};

const SWITCH_INTERVAL_SECONDS = 30;
const USE_SCRIPTED_TIMELINE = true;
const SCRIPTED_DURATIONS_SECONDS = [60, 30, 10, 120, 75];
const DEFAULT_TRANSITION_MODE = 'zoom-quilt';
const DEFAULT_TRANSITION_SECONDS = 5;
const MIN_VISIBLE_SECONDS = SWITCH_INTERVAL_SECONDS;
const MAX_VISIBLE_SECONDS = SWITCH_INTERVAL_SECONDS;
const ENTRY_MIN_RATIO = 0.1;
const ENTRY_MAX_RATIO = 0.8;
const WRAP_SAFETY_SECONDS = 0.05;
const TRANSITION_RETRY_LIMIT = 5;
const STANDBY_READY_STATE = 2;
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
let worldQueues = {
  grey: [],
  clown: [],
};
let lastPlayedByWorld = {};
let continuityState = new Map();

let playbackStarted = false;
let sessionRunning = false;
let stopAfterCurrentClip = false;
let pendingFade = false;
let isCrossfading = false;
let transitionMode = DEFAULT_TRANSITION_MODE;
let transitionSeconds = DEFAULT_TRANSITION_SECONDS;
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
let stallRecoveryInProgress = false;
let lastStallRecoveryAt = 0;
let stallProgressClockAt = 0;
let stallProgressPosition = 0;
let forceSwitchInProgress = false;
let scriptedScheduleStep = 0;
let worldStartTime = Date.now();
let minWorldDuration = 60000;
let lastWorldBlockLogAt = 0;
const videoLoadState = new WeakMap();
const preloadCache = new Map();
const preloadLoading = new Set();
const preloadReady = new Set();
const worldQueueInitialized = new Set();
let lastClip = null;

function getTransitionDurationSeconds() {
  if (transitionMode === 'cut') {
    return 0;
  }
  return Math.max(0.35, Number(transitionSeconds) || 0);
}

function applyTransitionDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const durationText = `${safe.toFixed(3)}s`;
  const timingFunction = transitionMode === 'zoom-quilt'
    ? 'cubic-bezier(0.2, 0.8, 0.2, 1)'
    : 'linear';
  videoA.style.transitionDuration = durationText;
  videoB.style.transitionDuration = durationText;
  videoA.style.transitionTimingFunction = timingFunction;
  videoB.style.transitionTimingFunction = timingFunction;
}

function setTransitionConfig(nextMode, nextSeconds) {
  const allowedModes = new Set(['cut', 'zoom-quilt']);
  transitionMode = allowedModes.has(nextMode) ? nextMode : DEFAULT_TRANSITION_MODE;
  const requested = Math.max(0, Number(nextSeconds) || 0);
  transitionSeconds = transitionMode === 'cut' ? 0 : Math.max(0.35, requested || DEFAULT_TRANSITION_SECONDS);
  applyTransitionDuration(getTransitionDurationSeconds());
}

function getStandbyRequiredReadyState() {
  return transitionMode === 'zoom-quilt' ? 3 : STANDBY_READY_STATE;
}

function setVideoScale(video, scale) {
  video.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function setVideoBlur(video, blurPx) {
  video.style.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
}

function resetVideoVisualState(video) {
  setVideoScale(video, 1);
  setVideoOpacity(video, 1);
  setVideoBlur(video, 0);
}

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

function isWorldDwellSatisfied() {
  const dev = window.__DEV__;
  if (dev && dev.lockWorld === false) {
    return true;
  }

  const minMs = dev && Number.isFinite(dev.minWorldTime)
    ? dev.minWorldTime
    : minWorldDuration;

  return Date.now() - worldStartTime >= minMs;
}

function canSwitchWorld() {
  if (typeof window.canSwitchWorld === 'function' && window.canSwitchWorld !== canSwitchWorld) {
    return window.canSwitchWorld();
  }

  return isWorldDwellSatisfied();
}

function noteWorldLocked(world, reason = 'switch') {
  worldStartTime = Date.now();
  const dev = window.__DEV__;
  const minMs = dev && Number.isFinite(dev.minWorldTime)
    ? dev.minWorldTime
    : minWorldDuration;
  logEvent('world_locked', {
    world,
    minWorldDurationMs: minMs,
    reason,
  });
}

if (typeof window.canSwitchWorld !== 'function') {
  window.canSwitchWorld = canSwitchWorld;
}

if (typeof window.getNextWorld !== 'function') {
  window.getNextWorld = () => null;
}

function preloadClip(src) {
  if (!src) {
    return;
  }

  if (preloadReady.has(src) || preloadLoading.has(src)) {
    return;
  }

  const video = document.createElement('video');
  video.preload = 'auto';
  video.src = src;
  video.muted = true;
  video.playsInline = true;

  preloadCache.set(src, video);
  preloadLoading.add(src);

  logEvent('preload_started', {
    clip: src,
  });

  const markReady = () => {
    if (preloadReady.has(src)) {
      return;
    }
    preloadLoading.delete(src);
    preloadReady.add(src);
    logEvent('preload_ready', {
      clip: src,
      readyState: video.readyState,
    });
  };

  video.addEventListener('canplaythrough', markReady, { once: true });
  video.addEventListener('loadeddata', markReady, { once: true });
  video.addEventListener('error', () => {
    preloadLoading.delete(src);
    preloadReady.delete(src);
    preloadCache.delete(src);
  }, { once: true });

  video.load();
}

function preloadAheadForWorld(worldKey, count) {
  if (!worldKey || count <= 0) {
    return;
  }

  ensureWorldQueue(worldKey);
  const queue = worldQueues[worldKey] || [];
  queue.slice(0, count).forEach((clip) => preloadClip(clip?.src));
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

function shuffle(array) {
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
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

function getVisibleDuration(video, clip) {
  const dev = window.__DEV__;
  if (dev && dev.forceDuration !== null && Number.isFinite(dev.forceDuration)) {
    return dev.forceDuration;
  }

  if (USE_SCRIPTED_TIMELINE && Number.isFinite(clip?.scriptedDurationSeconds)) {
    return Math.max(0.2, clip.scriptedDurationSeconds);
  }

  const duration = Number(video.duration || 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    return SWITCH_INTERVAL_SECONDS;
  }

  return SWITCH_INTERVAL_SECONDS;
}

if (typeof window.getVisibleDuration !== 'function') {
  window.getVisibleDuration = getVisibleDuration;
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
  video.style.opacity = '0';
  setVideoScale(video, 1);
  setVideoBlur(video, 0);
}

function stopVideo(video) {
  video.pause();
  video.classList.remove('is-active');
  video.playbackRate = 1;
  video.style.opacity = '0';
  setVideoScale(video, 1);
  setVideoBlur(video, 0);
  try {
    video.currentTime = 0;
  } catch (error) {
    // Some browsers reject seeking before metadata is loaded.
  }
}

function setVideoOpacity(video, opacity) {
  video.style.opacity = String(opacity);
}

function createWorldQueue(worldKey, reason) {
  const clips = [...(clipGroups[worldKey] || [])];
  const shuffled = shuffle(clips);

  if (shuffled.length > 1 && lastClip && shuffled[0].src === lastClip) {
    shuffled.push(shuffled.shift());
  }

  worldQueues[worldKey] = shuffled;

  logEvent(reason === 'refill' ? 'queue_refilled' : 'queue_created', {
    world: worldKey,
    queueLength: worldQueues[worldKey].length,
    firstClip: worldQueues[worldKey][0]?.src || null,
    lastClip,
  });
}

function ensureWorldQueue(worldKey) {
  if (!worldQueues[worldKey] || worldQueues[worldKey].length === 0) {
    const initialized = worldQueueInitialized.has(worldKey);
    createWorldQueue(worldKey, initialized ? 'refill' : 'create');
    worldQueueInitialized.add(worldKey);
  }
}

function getScriptedWorldSequence() {
  return [
    { world: 'grey', direction: 'forward' },
    { world: 'clown', direction: 'forward' },
    { world: 'clown', direction: 'reverse' },
    { world: 'grey', direction: 'reverse' },
  ];
}

function getScriptedIndicesForWorld(worldKey) {
  const clips = clipGroups[worldKey] || [];
  const count = clips.length;
  if (count === 0) {
    return { forward: [], reverse: [] };
  }

  const forward = SCRIPTED_DURATIONS_SECONDS.map((_, index) => index % count);
  const reverse = [...forward].reverse();
  return { forward, reverse };
}

function takeNextScriptedClip() {
  const worlds = getScriptedWorldSequence();
  const stepsPerWorld = SCRIPTED_DURATIONS_SECONDS.length;
  const stepInCycle = scriptedScheduleStep % (worlds.length * stepsPerWorld);
  const worldPhase = Math.floor(stepInCycle / stepsPerWorld);
  const stepInPhase = stepInCycle % stepsPerWorld;
  const phase = worlds[worldPhase];
  const indices = getScriptedIndicesForWorld(phase.world);
  const sequence = phase.direction === 'reverse' ? indices.reverse : indices.forward;
  const clipIndex = sequence[stepInPhase];
  const clip = clipGroups[phase.world]?.[clipIndex];

  if (!clip) {
    return null;
  }

  scriptedScheduleStep += 1;
  lastPlayedByWorld[phase.world] = clip.src;
  lastClip = clip.src;

  const result = {
    ...clip,
    scriptedDurationSeconds: SCRIPTED_DURATIONS_SECONDS[stepInPhase],
    scriptedDirection: phase.direction,
    scriptedStepInPhase: stepInPhase,
  };

  logEvent('scripted_clip_selected', {
    clip: result.src,
    world: result.world,
    durationSeconds: result.scriptedDurationSeconds,
    direction: result.scriptedDirection,
    stepInPhase: result.scriptedStepInPhase,
    absoluteStep: scriptedScheduleStep,
  });

  return result;
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
  if (USE_SCRIPTED_TIMELINE) {
    return takeNextScriptedClip();
  }

  ensureWorldQueue(worldKey);
  const nextClip = worldQueues[worldKey].shift();

  if (!nextClip) {
    return null;
  }

  lastPlayedByWorld[worldKey] = nextClip.src;
  lastClip = nextClip.src;

  logEvent('clip_selected', {
    world: worldKey,
    clip: nextClip.src,
    queueLength: worldQueues[worldKey].length,
  });

  return { ...nextClip };
}

function applyPendingWorldIfNeeded() {
  if (pendingWorld && pendingWorld !== currentWorld) {
    const dev = window.__DEV__;
    if (!canSwitchWorld()) {
      const now = Date.now();
      if (!lastWorldBlockLogAt || now - lastWorldBlockLogAt > 1000) {
        logEvent('world_switch_blocked_due_to_dwell', {
          fromWorld: currentWorld,
          toWorld: pendingWorld,
          elapsedMs: now - worldStartTime,
          minWorldDurationMs: dev && Number.isFinite(dev.minWorldTime)
            ? dev.minWorldTime
            : minWorldDuration,
          disabled: Boolean(dev?.disableWorldSwitch),
        }, 'warn');
        lastWorldBlockLogAt = now;
      }
      return;
    }

    logEvent('world_switch_applied', {
      fromWorld: currentWorld,
      toWorld: pendingWorld,
    });
    currentWorld = pendingWorld;
    pendingWorld = null;
    noteWorldLocked(currentWorld, 'pending_switch');
    createWorldQueue(currentWorld, 'create');
  }
}

function chooseEntryOffset(video, clip) {
  const duration = Number(video.duration || 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  const dev = window.__DEV__;
  if (dev && dev.forceEntryOffset !== null && Number.isFinite(dev.forceEntryOffset)) {
    const ratio = Math.min(1, Math.max(0, dev.forceEntryOffset));
    return ratio * duration;
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

if (typeof window.chooseEntryOffset !== 'function') {
  window.chooseEntryOffset = chooseEntryOffset;
}

function buildPlaybackPlan(video, clip) {
  const duration = Number(video.duration || 0);
  const playbackRate = getPlaybackRate(clip);
  const transitionLeadSeconds = getTransitionDurationSeconds();
  if (!Number.isFinite(duration) || duration <= 0) {
    return {
      entryOffsetSeconds: 0,
      visibleDurationSeconds: MIN_VISIBLE_SECONDS,
      fadeStartSeconds: Math.max(0, MIN_VISIBLE_SECONDS - transitionLeadSeconds),
      wraps: false,
      playbackRate,
      clipDurationSeconds: 0,
    };
  }

  const entryOffsetSeconds = window.chooseEntryOffset(video, clip);
  const visibleDurationSeconds = window.getVisibleDuration(video, clip);
  const fadeStartSeconds = Math.max(0.2, visibleDurationSeconds - transitionLeadSeconds);
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
  return Boolean(nextPreparedClip) && standbyVideo.readyState >= getStandbyRequiredReadyState();
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

function recoverPlaybackStall(reason) {
  if (!playbackStarted || !currentPlaybackState || isCrossfading || pendingFade) {
    return;
  }

  const now = Date.now();
  if (stallRecoveryInProgress || now - lastStallRecoveryAt < 2500) {
    return;
  }

  stallRecoveryInProgress = true;
  lastStallRecoveryAt = now;

  logEvent('playback_stall_recovery_started', {
    reason,
    clip: currentPlaybackState.clip.src,
    currentTime: activeVideo.currentTime,
    paused: activeVideo.paused,
    readyState: activeVideo.readyState,
  }, 'warn');

  if (!nextPreparedClip) {
    prepareNextStandbyClip();
  }

  if (isStandbyReadyForCrossfade()) {
    fadeScheduledAt = fadeScheduledAt || Date.now();
    void crossfadeToPreparedClip('stall_recovery').finally(() => {
      stallRecoveryInProgress = false;
    });
    return;
  }

  void safePlay(activeVideo).finally(() => {
    window.setTimeout(() => {
      stallRecoveryInProgress = false;
    }, 300);
  });
}

async function forceSwitchToNextClip(reason) {
  if (!playbackStarted || !currentPlaybackState || forceSwitchInProgress) {
    return;
  }

  forceSwitchInProgress = true;
  try {
    let forcedClip = nextPreparedClip;
    if (!forcedClip) {
      prepareNextStandbyClip();
      forcedClip = nextPreparedClip;
    }

    if (!forcedClip) {
      forcedClip = takeNextClipForWorld(currentWorld, currentPlaybackState.clip);
    }

    if (!forcedClip) {
      return;
    }

    clearStandbyReadyPoll();
    pendingFade = false;
    isCrossfading = false;

    logEvent('clip_force_switch', {
      reason,
      fromClip: currentPlaybackState.clip.src,
      toClip: forcedClip.src,
      elapsedMs: Date.now() - currentPlaybackState.startedAt,
    }, 'warn');

    await startPlaybackOnActiveVideo(forcedClip);
    prepareNextStandbyClip();
    updateWorldButtons();
    updateStatusReadout();
  } finally {
    forceSwitchInProgress = false;
  }
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
    `<strong>test mode</strong> ${TEST_CONFIG.enabled ? 'enabled' : 'disabled (add ?test=1 to URL)'}`,
    `<strong>current clip path</strong> ${currentPlaybackState?.clip?.src || 'waiting'}`,
    `<strong>next clip path</strong> ${nextPreparedClip?.src || 'waiting'}`,
    `<strong>current world</strong> ${WORLD_DEFINITIONS[currentWorld]?.label || currentWorld}`,
    `<strong>next world</strong> ${pendingWorld ? WORLD_DEFINITIONS[pendingWorld]?.label || pendingWorld : '—'}`,
    `<strong>transition</strong> ${transitionMode} (${getTransitionDurationSeconds().toFixed(2)}s)`,
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

  const preloaded = preloadCache.get(clip.src);
  const hasPreloadedReady = Boolean(preloadReady.has(clip.src) && preloaded?.readyState >= STANDBY_READY_STATE);
  const delayMs = hasPreloadedReady
    ? 0
    : TEST_CONFIG.enabled
      ? Math.round(randomBetween(TEST_CONFIG.loadDelayMinMs, TEST_CONFIG.loadDelayMaxMs))
      : 0;
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
    usedPreload: hasPreloadedReady,
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

  preloadClip(clip.src);
  preloadAheadForWorld(clip.world, 2);

  scheduleVideoLoad(standbyVideo, clip, 'standby_prepare');
}

function prepareNextStandbyClip() {
  if (USE_SCRIPTED_TIMELINE) {
    setStandbySource(takeNextScriptedClip());
    return;
  }

  const wantsSwitch = pendingWorld && pendingWorld !== currentWorld;
  const canSwitch = !wantsSwitch || canSwitchWorld();
  const forcedWorld = typeof window.getNextWorld === 'function'
    ? window.getNextWorld()
    : null;
  const targetWorld = forcedWorld || (canSwitch ? (pendingWorld || currentWorld) : currentWorld);

  if (wantsSwitch && !canSwitch) {
    const now = Date.now();
    if (!lastWorldBlockLogAt || now - lastWorldBlockLogAt > 1000) {
      logEvent('world_switch_blocked_due_to_dwell', {
        fromWorld: currentWorld,
        toWorld: pendingWorld,
        elapsedMs: now - worldStartTime,
        minWorldDurationMs: minWorldDuration,
      }, 'warn');
      lastWorldBlockLogAt = now;
    }
  }

  setStandbySource(takeNextClipForWorld(targetWorld, currentPlaybackState?.clip));
  preloadAheadForWorld(currentWorld, 2);
  if (pendingWorld) {
    preloadAheadForWorld(pendingWorld, 2);
  }
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
  currentWorld = playbackState.clip.world;
  pendingWorld = null;
  activeVideo.classList.add('is-active');
  standbyVideo.classList.remove('is-active');
  resetVideoVisualState(activeVideo);
  setVideoOpacity(standbyVideo, 0);
  setVideoScale(standbyVideo, 1);
  setVideoBlur(standbyVideo, 0);
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
  stallRecoveryInProgress = false;
  stallProgressClockAt = 0;
  stallProgressPosition = 0;
  forceSwitchInProgress = false;
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
  const standbyRequiredState = getStandbyRequiredReadyState();

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

  if (standbyVideo.readyState < standbyRequiredState) {
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
    transitionMode,
    transitionSeconds: getTransitionDurationSeconds(),
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

  const transitionDurationMs = Math.round(getTransitionDurationSeconds() * 1000);
  await safePlay(standbyVideo);

  activeVideo.classList.add('is-active');
  standbyVideo.classList.add('is-active');

  if (transitionMode === 'zoom-quilt' && transitionDurationMs > 0) {
    setVideoScale(activeVideo, 1);
    setVideoOpacity(activeVideo, 1);
    setVideoBlur(activeVideo, 0);

    // Start incoming clip smaller and transparent so zoom/fade is clearly visible.
    setVideoScale(standbyVideo, 0.35);
    setVideoOpacity(standbyVideo, 0);
    setVideoBlur(standbyVideo, 8);

    window.requestAnimationFrame(() => {
      setVideoScale(activeVideo, 1.8);
      setVideoOpacity(activeVideo, 0);
      setVideoBlur(activeVideo, 10);

      setVideoScale(standbyVideo, 1);
      setVideoOpacity(standbyVideo, 1);
      setVideoBlur(standbyVideo, 0);
    });

    await new Promise((resolve) => window.setTimeout(resolve, transitionDurationMs));
  }

  const previousActive = activeVideo;
  activeVideo = standbyVideo;
  standbyVideo = previousActive;
  currentPlaybackState = standbyPlaybackState;
  currentWorld = standbyPlaybackState.clip.world;
  pendingWorld = null;

  activeVideo.classList.add('is-active');
  standbyVideo.classList.remove('is-active');
  resetVideoVisualState(activeVideo);
  setVideoOpacity(standbyVideo, 0);
  setVideoScale(standbyVideo, 1);
  setVideoBlur(standbyVideo, 0);
  standbyVideo.pause();

  prepareNextStandbyClip();
  updateWorldButtons();
  updateStatusReadout();
  pendingFade = false;
  isCrossfading = false;
  fadeScheduledAt = 0;
  delayedFadeStartedAt = 0;
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
  if (USE_SCRIPTED_TIMELINE) {
    logEvent('world_switch_ignored_scripted_timeline', {
      requestedWorld: selectedWorld,
      reason,
    }, 'warn');
    return;
  }

  const dev = window.__DEV__;
  if (dev?.disableWorldSwitch) {
    logEvent('world_switch_blocked_due_to_dwell', {
      fromWorld: currentWorld,
      toWorld: selectedWorld,
      elapsedMs: Date.now() - worldStartTime,
      minWorldDurationMs: minWorldDuration,
      disabled: true,
    }, 'warn');
    return;
  }

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
  if (!TEST_CONFIG.enabled || !TEST_CONFIG.autoStress) {
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
  if (!TEST_CONFIG.enabled || !TEST_CONFIG.autoStress) {
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
  if (stallWatchdogIntervalId) {
    return;
  }

  stallWatchdogIntervalId = window.setInterval(() => {
    if (!playbackStarted || !currentPlaybackState || isCrossfading || pendingFade) {
      stallProgressClockAt = 0;
      stallProgressPosition = 0;
      return;
    }

    const elapsedOnClipMs = Date.now() - currentPlaybackState.startedAt;
    const plannedClipSeconds = Math.max(0.2, Number(currentPlaybackState.plan?.visibleDurationSeconds) || SWITCH_INTERVAL_SECONDS);
    if (elapsedOnClipMs > (plannedClipSeconds + 1) * 1000) {
      fadeScheduledAt = fadeScheduledAt || Date.now();
      void crossfadeToPreparedClip('time_guard');
    }

    if (elapsedOnClipMs > (plannedClipSeconds + 8) * 1000) {
      void forceSwitchToNextClip('time_guard_hard_limit');
      return;
    }

    const now = Date.now();
    const currentPosition = Number(activeVideo.currentTime || 0);
    const progressed = currentPosition > stallProgressPosition + 0.01;

    if (!stallProgressClockAt || progressed) {
      stallProgressClockAt = now;
      stallProgressPosition = currentPosition;
      return;
    }

    const msWithoutProgress = now - stallProgressClockAt;
    const lastTimeupdateAt = Number(activeVideo.dataset.lastTimeupdateAt || 0);
    const msSinceUpdate = lastTimeupdateAt ? Date.now() - lastTimeupdateAt : null;
    if (msWithoutProgress > STALL_DETECTION_MS && (!msSinceUpdate || msSinceUpdate > STALL_DETECTION_MS)) {
      logEvent('playback_stall_detected', {
        clip: currentPlaybackState.clip.src,
        msWithoutProgress,
        msSinceUpdate,
        currentTime: activeVideo.currentTime,
        paused: activeVideo.paused,
        readyState: activeVideo.readyState,
      }, 'error');
      recoverPlaybackStall('watchdog_no_progress');
    }
  }, 500);
}

async function startSession() {
  if (playbackStarted) {
    gracefullyStopSession();
    return;
  }

  const firstClip = USE_SCRIPTED_TIMELINE
    ? takeNextScriptedClip()
    : takeNextClipForWorld(currentWorld, null);
  if (!firstClip) {
    logEvent('start_failed_no_clips', { world: currentWorld }, 'error');
    return;
  }

  currentWorld = firstClip.world;
  pendingWorld = null;

  clearStandbyReadyPoll();
  playbackStarted = true;
  beginSessionTimer();
  noteWorldLocked(currentWorld, 'session_start');
  if (!USE_SCRIPTED_TIMELINE) {
    createWorldQueue(currentWorld, 'create');
  }
  await startPlaybackOnActiveVideo(firstClip);
  prepareNextStandbyClip();
  updateWorldButtons();
  updateStatusReadout();
}

function initializePlayer() {
  scriptedScheduleStep = 0;
  setTransitionConfig(DEFAULT_TRANSITION_MODE, DEFAULT_TRANSITION_SECONDS);
  initializeClipGroups();
  Object.keys(WORLD_DEFINITIONS).forEach((worldKey) => preloadAheadForWorld(worldKey, 2));
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

  startStallWatchdog();

  if (TEST_CONFIG.enabled) {
    startMemoryLogging();
    scheduleStressWorldSwitch();
    scheduleStressControls();
  }

  // Ensure the selected transition mode/seconds are actually applied before first clip switch.
  setTransitionConfig(transitionMode, transitionSeconds);

  updateWorldButtons();
  updateStatusReadout();
}

initializePlayer();

// ==========================
// DEV CONTROL PANEL
// ==========================
(function () {
  const DEV = {
    enabled: true,

    // controls
    lockWorld: true,
    minWorldTime: 60000, // 1 minute
    forceWorld: null, // "grey" | "clown" | null
    disableWorldSwitch: false,

    forceEntryOffset: null, // number (0–1) or null
    forceDuration: null, // seconds or null
    transitionMode: DEFAULT_TRANSITION_MODE, // cut | crossfade | fade-through
    transitionSeconds: DEFAULT_TRANSITION_SECONDS,

    showOverlay: true,
  };

  window.__DEV__ = DEV;

  // ---------- Hook advanced controls in main UI ----------
  const lockWorldInput = document.getElementById('uiLockWorld');
  const minWorldTimeInput = document.getElementById('uiMinWorldTime');
  const forceWorldInput = document.getElementById('uiForceWorld');
  const disableSwitchInput = document.getElementById('uiDisableSwitch');
  const entryOffsetInput = document.getElementById('uiEntryOffset');
  const durationInput = document.getElementById('uiForcedDuration');
  const transitionModeInput = document.getElementById('uiTransitionMode');
  const transitionSecondsInput = document.getElementById('uiTransitionSeconds');
  const devPanelToggleButton = document.getElementById('uiToggleDevPanel');
  const advancedControlsSection = document.getElementById('advancedControls');
  const logStateButton = document.getElementById('uiLogState');

  function setDevPanelVisible(isVisible) {
    DEV.showOverlay = Boolean(isVisible);
    if (advancedControlsSection) {
      advancedControlsSection.hidden = !DEV.showOverlay;
    }
    if (devPanelToggleButton) {
      devPanelToggleButton.textContent = DEV.showOverlay ? 'Hide Dev UI' : 'Show Dev UI';
      devPanelToggleButton.setAttribute('aria-expanded', String(DEV.showOverlay));
    }
  }

  setDevPanelVisible(DEV.showOverlay);

  if (lockWorldInput) {
    lockWorldInput.checked = DEV.lockWorld;
    lockWorldInput.onchange = (event) => {
      DEV.lockWorld = event.target.checked;
    };
  }

  if (minWorldTimeInput) {
    minWorldTimeInput.value = String(DEV.minWorldTime);
    minWorldTimeInput.oninput = (event) => {
      DEV.minWorldTime = Number(event.target.value);
    };
  }

  if (forceWorldInput) {
    forceWorldInput.value = DEV.forceWorld || '';
    forceWorldInput.onchange = (event) => {
      DEV.forceWorld = event.target.value || null;
    };
  }

  if (disableSwitchInput) {
    disableSwitchInput.checked = DEV.disableWorldSwitch;
    disableSwitchInput.onchange = (event) => {
      DEV.disableWorldSwitch = event.target.checked;
    };
  }

  if (entryOffsetInput) {
    entryOffsetInput.value = DEV.forceEntryOffset === null ? '' : String(DEV.forceEntryOffset);
    entryOffsetInput.oninput = (event) => {
      DEV.forceEntryOffset = event.target.value === '' ? null : Number(event.target.value);
    };
  }

  if (durationInput) {
    durationInput.value = DEV.forceDuration === null ? '' : String(DEV.forceDuration);
    durationInput.oninput = (event) => {
      DEV.forceDuration = event.target.value === '' ? null : Number(event.target.value);
    };
  }

  if (transitionModeInput) {
    transitionModeInput.value = DEV.transitionMode;
    if (!transitionModeInput.value) {
      transitionModeInput.value = DEFAULT_TRANSITION_MODE;
      DEV.transitionMode = DEFAULT_TRANSITION_MODE;
    }
    transitionModeInput.onchange = (event) => {
      DEV.transitionMode = event.target.value || DEFAULT_TRANSITION_MODE;
      setTransitionConfig(DEV.transitionMode, DEV.transitionSeconds);
      DEV.transitionSeconds = transitionSeconds;
      if (transitionSecondsInput) {
        transitionSecondsInput.value = String(DEV.transitionSeconds);
      }
      updateStatusReadout();
    };
  }

  if (transitionSecondsInput) {
    transitionSecondsInput.value = String(DEV.transitionSeconds);
    transitionSecondsInput.oninput = (event) => {
      DEV.transitionSeconds = Math.max(0, Number(event.target.value) || 0);
      setTransitionConfig(DEV.transitionMode, DEV.transitionSeconds);
      DEV.transitionSeconds = transitionSeconds;
      updateStatusReadout();
    };
  }

  if (logStateButton) {
    logStateButton.onclick = () => {
    console.log('DEV STATE:', {
      currentWorld,
      pendingWorld,
      worldStartTime,
      queue: worldQueues[currentWorld],
      activeClip: currentPlaybackState?.clip?.src || null,
      nextClip: nextPreparedClip?.src || null,
    });
    };
  }

  if (devPanelToggleButton) {
    devPanelToggleButton.onclick = () => {
      setDevPanelVisible(!DEV.showOverlay);
    };
  }

  // ==========================
  // HOOK INTO YOUR PLAYER LOGIC
  // ==========================

  const originalCanSwitchWorld = () => isWorldDwellSatisfied();

  window.canSwitchWorld = function () {
    if (DEV.disableWorldSwitch) return false;

    if (DEV.lockWorld) {
      const elapsed = Date.now() - worldStartTime;
      if (elapsed < DEV.minWorldTime) {
        console.log('DEV: world locked', elapsed);
        return false;
      }
    }

    return originalCanSwitchWorld();
  };

  const originalGetNextWorld = typeof window.getNextWorld === 'function'
    ? window.getNextWorld
    : () => null;

  window.getNextWorld = function () {
    if (DEV.forceWorld) return DEV.forceWorld;
    return originalGetNextWorld();
  };

  const originalChooseEntryOffset = typeof window.chooseEntryOffset === 'function'
    ? window.chooseEntryOffset
    : () => 0;

  window.chooseEntryOffset = function (video, clip) {
    if (DEV.forceEntryOffset !== null) {
      return DEV.forceEntryOffset * video.duration;
    }
    return originalChooseEntryOffset(video, clip);
  };

  const originalGetDuration = typeof window.getVisibleDuration === 'function'
    ? window.getVisibleDuration
    : () => 3;

  window.getVisibleDuration = function (video, clip) {
    if (DEV.forceDuration !== null) {
      return DEV.forceDuration;
    }
    return originalGetDuration(video, clip);
  };
})();
