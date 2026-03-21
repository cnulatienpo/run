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

const CROSSFADE_SECONDS = 1.5;
const MIN_VISIBLE_SECONDS = 2.5;
const MAX_VISIBLE_SECONDS = 4.5;
const ENTRY_MIN_RATIO = 0.1;
const ENTRY_MAX_RATIO = 0.8;
const WRAP_SAFETY_SECONDS = 0.05;
const TRANSITION_RETRY_LIMIT = 5;
const STANDBY_READY_STATE = 3;
const STANDBY_RETRY_MS = 120;
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
let currentPlaybackState = null;
let nextPreparedClip = null;
let sessionDurationSeconds = Number(durationSelect?.value || 900);
let sessionStartedAt = 0;
let sessionDeadlineAt = 0;
let sessionIntervalId = 0;
let musicObjectUrl = null;

function initializeClipGroups() {
  Object.entries(WORLD_DEFINITIONS).forEach(([worldKey, definition]) => {
    clipGroups[worldKey] = definition.clips.map((clip) => ({
      src: `${definition.folder}/${clip.file}`,
      floorAngle: clip.floorAngle,
      speed: clip.speed,
      motion: clip.motion,
      world: worldKey,
    }));
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
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.playbackRate = 1;
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
    return Math.min(storedState.nextOffsetSeconds, Math.max(0, duration - WRAP_SAFETY_SECONDS));
  }

  const minOffset = duration * ENTRY_MIN_RATIO;
  const maxOffset = duration * ENTRY_MAX_RATIO;
  return Math.min(Math.max(minOffset, randomBetween(minOffset, maxOffset)), Math.max(0, duration - WRAP_SAFETY_SECONDS));
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

function setStandbySource(clip) {
  if (!clip) {
    nextPreparedClip = null;
    resetVideo(standbyVideo);
    updateStatusReadout();
    return;
  }

  nextPreparedClip = {
    ...clip,
    previewPlaybackRate: getPlaybackRate(clip),
  };

  resetVideo(standbyVideo);
  standbyVideo.src = clip.src;
  standbyVideo.load();
  updateStatusReadout();
}

function prepareNextStandbyClip() {
  const targetWorld = pendingWorld || currentWorld;
  setStandbySource(takeNextClipForWorld(targetWorld, currentPlaybackState?.clip));
}

async function safePlay(video) {
  try {
    await video.play();
  } catch (error) {
    console.warn('Playback was blocked or failed.', error);
  }
}

async function waitForMetadata(video) {
  if (video.readyState >= 1) {
    return;
  }

  await new Promise((resolve) => {
    video.addEventListener('loadedmetadata', resolve, { once: true });
  });
}

async function primeClipOnVideo(video, clip) {
  if (!clip) {
    return null;
  }

  if (!video.src || !video.src.endsWith(clip.src)) {
    video.src = clip.src;
    video.load();
  }

  await waitForMetadata(video);
  const plan = buildPlaybackPlan(video, clip);
  video.playbackRate = plan.playbackRate;
  video.currentTime = Math.min(plan.entryOffsetSeconds, Math.max(0, (video.duration || 0) - WRAP_SAFETY_SECONDS));

  return {
    clip,
    plan,
    didWrap: false,
  };
}

async function startPlaybackOnActiveVideo(clip) {
  const playbackState = await primeClipOnVideo(activeVideo, clip);
  if (!playbackState) {
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
  currentPlaybackState = null;
  stopVideo(activeVideo);
  stopVideo(standbyVideo);
  playButton.textContent = 'Play Session';
  playerShell.style.filter = 'brightness(1)';
  updateWorldButtons();
  updateStatusReadout();
}

function retryCrossfadeWhenReady() {
  pendingFade = false;
  window.setTimeout(() => {
    void crossfadeToPreparedClip();
  }, STANDBY_RETRY_MS);
}

async function crossfadeToPreparedClip() {
  if (pendingFade || !currentPlaybackState) {
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
  applyPendingWorldIfNeeded();

  const standbyPlaybackState = await primeClipOnVideo(standbyVideo, nextPreparedClip);
  if (!standbyPlaybackState) {
    pendingFade = false;
    return;
  }

  if (standbyVideo.readyState < STANDBY_READY_STATE) {
    retryCrossfadeWhenReady();
    return;
  }

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
  }, CROSSFADE_SECONDS * 1000);
}

function handleActiveVideoTimeUpdate(video) {
  if (video !== activeVideo || !currentPlaybackState || pendingFade) {
    return;
  }

  if (
    currentPlaybackState.plan.wraps
    && !currentPlaybackState.didWrap
    && Number.isFinite(video.duration)
    && video.duration > 0
    && video.currentTime >= video.duration - WRAP_SAFETY_SECONDS
  ) {
    currentPlaybackState.didWrap = true;
    video.currentTime = 0.01;
    return;
  }

  if (shouldStartFade(video, currentPlaybackState)) {
    void crossfadeToPreparedClip();
  }
}

function handleActiveVideoEnded(video) {
  if (video !== activeVideo || pendingFade) {
    return;
  }

  if (currentPlaybackState?.plan.wraps && !currentPlaybackState.didWrap) {
    currentPlaybackState.didWrap = true;
    video.currentTime = 0.01;
    void safePlay(video);
    return;
  }

  void crossfadeToPreparedClip();
}

function attachVideoEvents(video) {
  video.addEventListener('timeupdate', () => handleActiveVideoTimeUpdate(video));
  video.addEventListener('ended', () => handleActiveVideoEnded(video));
  video.addEventListener('error', () => {
    console.error(`Failed to load clip: ${video.currentSrc || video.src}`);
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

  updateStatusReadout();
}

function beginSessionTimer() {
  sessionRunning = true;
  stopAfterCurrentClip = false;
  sessionDurationSeconds = Number(durationSelect.value || 900);
  sessionStartedAt = Date.now();
  sessionDeadlineAt = sessionStartedAt + sessionDurationSeconds * 1000;
  playButton.textContent = 'Stop After Clip';

  if (sessionIntervalId) {
    window.clearInterval(sessionIntervalId);
  }

  sessionIntervalId = window.setInterval(() => {
    updateStatusReadout();
    if (sessionRunning && Date.now() >= sessionDeadlineAt) {
      gracefullyStopSession();
    }
  }, 250);
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
    console.warn('Music playback needs a user interaction.', error);
  });
}

function handleFullscreen() {
  if (!document.fullscreenElement) {
    playerShell.requestFullscreen?.().catch((error) => {
      console.warn('Fullscreen request failed.', error);
    });
    return;
  }

  document.exitFullscreen?.().catch((error) => {
    console.warn('Exiting fullscreen failed.', error);
  });
}

function handleWorldButtonClick(event) {
  const selectedWorld = event.currentTarget.dataset.worldButton;
  pendingWorld = selectedWorld === currentWorld ? null : selectedWorld;
  prepareNextStandbyClip();
  updateWorldButtons();
  updateStatusReadout();
}

function handleDurationChange() {
  sessionDurationSeconds = Number(durationSelect.value || 900);
  if (!sessionRunning) {
    updateStatusReadout();
  }
}

async function startSession() {
  if (playbackStarted) {
    gracefullyStopSession();
    return;
  }

  const firstClip = takeNextClipForWorld(currentWorld, null);
  if (!firstClip) {
    console.warn('No clips configured for the selected world.');
    return;
  }

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

  updateWorldButtons();
  updateStatusReadout();
}

initializePlayer();
