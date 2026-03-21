// World-based treadmill player.
//
// Important architecture constraints are preserved on purpose:
// - exactly two stacked <video> elements
// - browser-native playback only
// - one visible active video and one hidden standby video
// - crossfades handled with CSS opacity plus simple JavaScript timing
//
// The upgrade stays behavioral. Instead of random-feeling clip swaps, each
// world now carries clip metadata that constrains speed, floor angle, lighting,
// and entry offsets so the resulting motion stays believable for running.

const clipGroups = {
  ocean_tunnel: [
    {
      src: 'videos/ocean_tunnel/clip01.mp4',
      tags: ['forward', 'glide'],
      floorAngle: 'flat',
      speed: 'run',
      lighting: 'dim',
    },
    {
      src: 'videos/ocean_tunnel/clip02.mp4',
      tags: ['forward', 'glide'],
      floorAngle: 'slight_tilt',
      speed: 'fast',
      lighting: 'color',
    },
  ],
  fun_house: [
    {
      src: 'videos/fun_house/clip01.mp4',
      tags: ['forward', 'bounce'],
      floorAngle: 'flat',
      speed: 'run',
      lighting: 'bright',
    },
    {
      src: 'videos/fun_house/clip02.mp4',
      tags: ['forward', 'glide'],
      floorAngle: 'slight_tilt',
      speed: 'run',
      lighting: 'color',
    },
  ],
  train_tunnel: [
    {
      src: 'videos/train_tunnel/clip01.mp4',
      tags: ['forward', 'tunnel'],
      floorAngle: 'flat',
      speed: 'fast',
      lighting: 'flicker',
    },
  ],
  tree_house: [
    {
      src: 'videos/tree_house/clip01.mp4',
      tags: ['forward', 'climb'],
      floorAngle: 'ramp_up',
      speed: 'run',
      lighting: 'bright',
    },
  ],
  antique_shop: [
    {
      src: 'videos/antique_shop/clip01.mp4',
      tags: ['forward', 'glide'],
      floorAngle: 'flat',
      speed: 'run',
      lighting: 'dim',
    },
  ],
  prop_warehouse: [
    {
      src: 'videos/prop_warehouse/clip01.mp4',
      tags: ['forward', 'warehouse'],
      floorAngle: 'flat',
      speed: 'fast',
      lighting: 'bright',
    },
  ],
  mountains: [
    {
      src: 'videos/mountains/clip01.mp4',
      tags: ['forward', 'climb'],
      floorAngle: 'ramp_up',
      speed: 'fast',
      lighting: 'bright',
    },
  ],
  woods: [
    {
      src: 'videos/woods/clip01.mp4',
      tags: ['forward', 'trail'],
      floorAngle: 'ramp_down',
      speed: 'run',
      lighting: 'dim',
    },
  ],
};

const CROSSFADE_SECONDS = 1.5;
const MIN_VISIBLE_SECONDS = 6;
const MAX_VISIBLE_SECONDS = 18;
const END_WRAP_SAFETY = 0.08;
const CLIP_SELECTION_RETRY_LIMIT = 8;
const CROSSFADE_BRIGHTNESS_FLOOR = 0.92;
const CROSSFADE_BRIGHTNESS_CEILING = 1.04;
const FLOOR_ANGLE_TRANSITIONS = {
  flat: ['flat', 'ramp_up', 'ramp_down', 'slight_tilt'],
  ramp_up: ['ramp_up', 'flat'],
  ramp_down: ['ramp_down', 'flat'],
  slight_tilt: ['slight_tilt', 'flat'],
};
const LIGHTING_BRIGHTNESS = {
  dim: 0.92,
  bright: 1.08,
  flicker: 0.98,
  color: 1.02,
};

const playerShell = document.getElementById('playerShell');
const videoA = document.getElementById('videoA');
const videoB = document.getElementById('videoB');
const playButton = document.getElementById('playButton');
const durationSelect = document.getElementById('durationSelect');
const worldSelect = document.getElementById('worldSelect');
const fullscreenButton = document.getElementById('fullscreenButton');
const statusReadout = document.getElementById('statusReadout');
const musicUpload = document.getElementById('musicUpload');
const musicPlayer = document.getElementById('musicPlayer');

let activeVideo = videoA;
let standbyVideo = videoB;

let currentWorld = Object.keys(clipGroups)[0];
let pendingWorld = null;
let worldQueues = {};
let lastPlayedByWorld = {};

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

// Continuity memory lives per clip source. The next offset is always advanced
// forward from the last visible endpoint. That means entering in the middle is
// not a random teleport every time — it is the next point on the clip's own
// circular path.
const continuityState = new Map();

function normalizeClip(clip) {
  return {
    tags: [],
    speed: 'run',
    lighting: 'dim',
    ...clip,
  };
}

Object.keys(clipGroups).forEach((worldKey) => {
  clipGroups[worldKey] = clipGroups[worldKey].map(normalizeClip);
});

function getWorldLabel(worldKey) {
  return worldKey.replace(/_/g, ' ');
}

function getClipFilename(src) {
  return src.split('/').pop() || src;
}

function formatSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function getPlaybackRate(clip) {
  if (clip.speed === 'fast') {
    return randomBetween(1.05, 1.2);
  }

  return randomBetween(1.0, 1.05);
}

function getTargetBrightness(clip) {
  return LIGHTING_BRIGHTNESS[clip?.lighting] ?? 1;
}

function clampBrightness(value) {
  return Math.min(CROSSFADE_BRIGHTNESS_CEILING, Math.max(CROSSFADE_BRIGHTNESS_FLOOR, value));
}

function applyShellBrightnessForClip(clip) {
  playerShell.style.filter = `brightness(${clampBrightness(getTargetBrightness(clip)).toFixed(3)})`;
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
    // Ignore browsers that reject currentTime before metadata is available.
  }
}

function isValidTransition(prevClip, nextClip) {
  if (!prevClip || !nextClip) {
    return true;
  }

  const allowedNextAngles = FLOOR_ANGLE_TRANSITIONS[prevClip.floorAngle] || ['flat'];
  if (!allowedNextAngles.includes(nextClip.floorAngle)) {
    return false;
  }

  if (prevClip.floorAngle === 'slight_tilt' && nextClip.floorAngle === 'slight_tilt') {
    return false;
  }

  return true;
}

// -----------------------------
// World selection + queue logic
// -----------------------------

function buildShuffledQueue(worldKey) {
  const clips = [...(clipGroups[worldKey] || [])];
  const previousSrc = lastPlayedByWorld[worldKey];

  for (let index = clips.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [clips[index], clips[swapIndex]] = [clips[swapIndex], clips[index]];
  }

  // Avoid immediate repeats when there is any alternative available.
  if (clips.length > 1 && previousSrc && clips[0].src === previousSrc) {
    clips.push(clips.shift());
  }

  return clips;
}

function ensureWorldQueue(worldKey) {
  if (!worldQueues[worldKey] || worldQueues[worldKey].length === 0) {
    worldQueues[worldKey] = buildShuffledQueue(worldKey);
  }
}

function takeNextClipForWorld(worldKey, previousClip = currentPlaybackState?.clip) {
  ensureWorldQueue(worldKey);

  const queue = worldQueues[worldKey];
  let fallbackClip = null;

  for (let attempt = 0; attempt < CLIP_SELECTION_RETRY_LIMIT; attempt += 1) {
    const candidate = queue.shift();
    if (!candidate) {
      break;
    }

    if (!fallbackClip) {
      fallbackClip = candidate;
    }

    if (queue.length === 0) {
      worldQueues[worldKey] = buildShuffledQueue(worldKey);
    }

    if (isValidTransition(previousClip, candidate)) {
      lastPlayedByWorld[worldKey] = candidate.src;
      return { ...candidate, world: worldKey };
    }

    queue.push(candidate);
  }

  if (!fallbackClip) {
    return null;
  }

  lastPlayedByWorld[worldKey] = fallbackClip.src;
  return { ...fallbackClip, world: worldKey };
}

function applyPendingWorldIfNeeded() {
  if (pendingWorld && pendingWorld !== currentWorld) {
    currentWorld = pendingWorld;
    pendingWorld = null;
  }
}

// -----------------------------
// Circular playout planning
// -----------------------------

function chooseEntryOffset(videoElement, clipMetadata) {
  const duration = Number(videoElement.duration || 0);
  const storedState = continuityState.get(clipMetadata.src);

  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  const safeMin = duration * 0.1;
  const safeMax = duration * 0.8;

  if (!storedState) {
    if (safeMax <= safeMin) {
      return Math.max(0, Math.min(duration - 0.05, safeMin));
    }

    return randomBetween(safeMin, safeMax);
  }

  return Math.min(storedState.nextOffsetSeconds, Math.max(0, duration - 0.05));
}

function getPlayoutPlan(videoElement, clipMetadata) {
  const clipDurationSeconds = Number(videoElement.duration || 0);

  if (!Number.isFinite(clipDurationSeconds) || clipDurationSeconds <= 0) {
    return {
      entryOffsetSeconds: 0,
      visibleDurationSeconds: MIN_VISIBLE_SECONDS,
      fadeStartSeconds: Math.max(0.15, MIN_VISIBLE_SECONDS - CROSSFADE_SECONDS),
      wraparoundNeeded: false,
      clipDurationSeconds: 0,
      playbackRate: 1,
    };
  }

  const entryOffsetSeconds = chooseEntryOffset(videoElement, clipMetadata);
  const maximumOwnedDuration = Math.max(
    MIN_VISIBLE_SECONDS,
    Math.min(MAX_VISIBLE_SECONDS, clipDurationSeconds + Math.max(0, clipDurationSeconds - 2)),
  );
  const visibleDurationSeconds = Math.min(
    maximumOwnedDuration,
    Math.max(MIN_VISIBLE_SECONDS, randomBetween(MIN_VISIBLE_SECONDS, maximumOwnedDuration)),
  );
  const fadeStartSeconds = Math.max(0.15, visibleDurationSeconds - CROSSFADE_SECONDS);
  const remainingUntilEnd = clipDurationSeconds - entryOffsetSeconds;
  const wraparoundNeeded = visibleDurationSeconds > remainingUntilEnd;
  const playbackRate = getPlaybackRate(clipMetadata);

  const nextOffsetSeconds = (entryOffsetSeconds + visibleDurationSeconds) % clipDurationSeconds;
  continuityState.set(clipMetadata.src, { nextOffsetSeconds });

  return {
    entryOffsetSeconds,
    visibleDurationSeconds,
    fadeStartSeconds,
    wraparoundNeeded,
    clipDurationSeconds,
    playbackRate,
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

// -----------------------------
// UI rendering
// -----------------------------

function updateWorldSelector() {
  const selectedWorld = pendingWorld || currentWorld;
  worldSelect.innerHTML = Object.keys(clipGroups)
    .map((worldKey) => {
      const selected = worldKey === selectedWorld ? 'selected' : '';
      return `<option value="${worldKey}" ${selected}>${getWorldLabel(worldKey)}</option>`;
    })
    .join('');
}

function updateStatusReadout() {
  const currentClip = currentPlaybackState?.clip?.src ? getClipFilename(currentPlaybackState.clip.src) : 'waiting';
  const nextClip = nextPreparedClip?.src ? getClipFilename(nextPreparedClip.src) : 'waiting';
  const shownWorld = `${getWorldLabel(currentWorld)}${pendingWorld ? ` → next: ${getWorldLabel(pendingWorld)}` : ''}`;
  const entryOffset = currentPlaybackState?.plan?.entryOffsetSeconds ?? 0;
  const visibleDuration = currentPlaybackState?.plan?.visibleDurationSeconds ?? 0;
  const playbackRate = currentPlaybackState?.plan?.playbackRate ?? nextPreparedClip?.previewPlaybackRate ?? 1;
  const floorAngle = currentPlaybackState?.clip?.floorAngle ?? nextPreparedClip?.floorAngle ?? 'flat';
  const lighting = currentPlaybackState?.clip?.lighting ?? nextPreparedClip?.lighting ?? 'dim';
  const nextFloorAngle = nextPreparedClip?.floorAngle ?? 'waiting';
  const nextLighting = nextPreparedClip?.lighting ?? 'waiting';

  const elapsedSeconds = sessionStartedAt ? (Date.now() - sessionStartedAt) / 1000 : 0;
  const remainingSeconds = sessionDeadlineAt ? Math.max(0, (sessionDeadlineAt - Date.now()) / 1000) : sessionDurationSeconds;
  const timerLine = sessionRunning
    ? `${formatSeconds(elapsedSeconds)} elapsed / ${formatSeconds(remainingSeconds)} left`
    : playbackStarted
      ? 'finishing current clip'
      : `ready / ${formatSeconds(sessionDurationSeconds)} session`;

  statusReadout.innerHTML = [
    `<strong>current world</strong> ${shownWorld}`,
    `<strong>current clip</strong> ${currentClip}`,
    `<strong>next clip</strong> ${nextClip}`,
    `<strong>playback rate</strong> ${playbackRate.toFixed(2)}x`,
    `<strong>floor angle</strong> ${floorAngle} → next: ${nextFloorAngle}`,
    `<strong>lighting</strong> ${lighting} → next: ${nextLighting}`,
    `<strong>entry offset</strong> ${entryOffset.toFixed(2)}s`,
    `<strong>visible duration</strong> ${visibleDuration.toFixed(2)}s`,
    `<strong>session timer</strong> ${timerLine}`,
  ].join('\n');
}

// -----------------------------
// Standby preparation + playback
// -----------------------------

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

async function primeClipOnVideo(video, clip) {
  if (!clip) {
    return null;
  }

  if (!video.src || !video.src.endsWith(clip.src)) {
    video.src = clip.src;
    video.load();
  }

  if (video.readyState < 1) {
    await new Promise((resolve) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
    });
  }

  const plan = getPlayoutPlan(video, clip);
  const playbackState = {
    clip,
    world: clip.world,
    plan,
    didWrap: false,
  };

  video.playbackRate = Math.max(1, plan.playbackRate);
  video.currentTime = Math.min(plan.entryOffsetSeconds, Math.max(0, (video.duration || 0) - 0.05));
  return playbackState;
}

async function startPlaybackOnActiveVideo(clip) {
  const playbackState = await primeClipOnVideo(activeVideo, clip);
  if (!playbackState) {
    return;
  }

  currentPlaybackState = playbackState;
  applyShellBrightnessForClip(playbackState.clip);
  activeVideo.classList.add('is-active');
  standbyVideo.classList.remove('is-active');
  await safePlay(activeVideo);
  updateStatusReadout();
}

async function crossfadeToPreparedClip() {
  if (pendingFade || !currentPlaybackState) {
    return;
  }

  if (stopAfterCurrentClip) {
    pendingFade = false;
    playbackStarted = false;
    stopAfterCurrentClip = false;
    nextPreparedClip = null;
    currentPlaybackState = null;
    stopVideo(activeVideo);
    stopVideo(standbyVideo);
    playButton.textContent = 'Play Session';
    playerShell.style.filter = 'brightness(1)';
    updateStatusReadout();
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

  const blendedBrightness = clampBrightness(
    (getTargetBrightness(currentPlaybackState.clip) + getTargetBrightness(standbyPlaybackState.clip)) / 2,
  );
  playerShell.style.filter = `brightness(${blendedBrightness.toFixed(3)})`;

  await safePlay(standbyVideo);
  standbyVideo.classList.add('is-active');
  activeVideo.classList.remove('is-active');

  window.setTimeout(() => {
    const previousActive = activeVideo;
    previousActive.pause();

    activeVideo = standbyVideo;
    standbyVideo = previousActive;
    currentPlaybackState = standbyPlaybackState;
    applyShellBrightnessForClip(currentPlaybackState.clip);

    prepareNextStandbyClip();
    updateWorldSelector();
    updateStatusReadout();
    pendingFade = false;
  }, CROSSFADE_SECONDS * 1000);
}

function handleActiveVideoTimeUpdate(video) {
  if (video !== activeVideo || !currentPlaybackState || pendingFade) {
    return;
  }

  if (
    currentPlaybackState.plan.wraparoundNeeded
    && !currentPlaybackState.didWrap
    && Number.isFinite(video.duration)
    && video.duration > 0
    && video.currentTime >= video.duration - END_WRAP_SAFETY
  ) {
    currentPlaybackState.didWrap = true;
    video.currentTime = 0.02;
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

  if (currentPlaybackState?.plan.wraparoundNeeded && !currentPlaybackState.didWrap) {
    currentPlaybackState.didWrap = true;
    video.currentTime = 0.02;
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

// -----------------------------
// Session timer logic
// -----------------------------

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

// -----------------------------
// Music + fullscreen logic
// -----------------------------

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

// -----------------------------
// UI event wiring
// -----------------------------

function populateWorlds() {
  updateWorldSelector();
}

function handleWorldChange() {
  const selectedWorld = worldSelect.value;
  pendingWorld = selectedWorld === currentWorld ? null : selectedWorld;

  // World switches never cut the current visible clip. They only change which
  // clip gets prepared for the next transition.
  prepareNextStandbyClip();
  updateWorldSelector();
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
  updateWorldSelector();
  updateStatusReadout();
}

function initializePlayer() {
  populateWorlds();
  attachVideoEvents(videoA);
  attachVideoEvents(videoB);

  playButton.addEventListener('click', () => {
    void startSession();
  });
  worldSelect.addEventListener('change', handleWorldChange);
  durationSelect.addEventListener('change', handleDurationChange);
  fullscreenButton.addEventListener('click', handleFullscreen);
  musicUpload.addEventListener('change', handleMusicUpload);

  updateStatusReadout();
}

initializePlayer();
