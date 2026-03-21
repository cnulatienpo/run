// World-based treadmill player.
//
// This keeps the original architecture intentionally simple:
// - exactly two stacked <video> elements
// - browser-native playback only
// - one active visible video and one preloaded standby video
// - crossfades handled with CSS opacity and plain JavaScript timing
//
// The main upgrade here is that playback is no longer a flat playlist.
// Clips are grouped into worlds, each clip gets a playout plan, and clips
// are treated like circular timelines so the player can enter in the middle,
// wrap through the start later, and still feel continuous.

const clipGroups = {
  ocean_tunnel: [
    { src: 'videos/ocean_tunnel/clip01.mp4' },
    { src: 'videos/ocean_tunnel/clip02.mp4' },
  ],
  fun_house: [
    { src: 'videos/fun_house/clip01.mp4' },
    { src: 'videos/fun_house/clip02.mp4' },
  ],
  train_tunnel: [{ src: 'videos/train_tunnel/clip01.mp4' }],
  tree_house: [{ src: 'videos/tree_house/clip01.mp4' }],
  antique_shop: [{ src: 'videos/antique_shop/clip01.mp4' }],
  prop_warehouse: [{ src: 'videos/prop_warehouse/clip01.mp4' }],
  mountains: [{ src: 'videos/mountains/clip01.mp4' }],
  woods: [{ src: 'videos/woods/clip01.mp4' }],
};

const CROSSFADE_SECONDS = 1.5;
const MIN_VISIBLE_SECONDS = 6;
const MAX_VISIBLE_SECONDS = 18;
const MIN_CONTINUITY_ADVANCE = 2.5;

const videoA = document.getElementById('videoA');
const videoB = document.getElementById('videoB');
const playerShell = document.getElementById('playerShell');
const playButton = document.getElementById('playButton');
const durationSelect = document.getElementById('durationSelect');
const worldSelect = document.getElementById('worldSelect');
const fullscreenButton = document.getElementById('fullscreenButton');
const statusReadout = document.getElementById('statusReadout');
const musicUpload = document.getElementById('musicUpload');
const musicPlayer = document.getElementById('musicPlayer');

if (!videoA || !videoB) {
  throw new Error('Expected #videoA and #videoB elements to exist.');
}

let activeVideo = videoA;
let standbyVideo = videoB;
let currentWorld = Object.keys(clipGroups)[0];
let pendingWorld = null;
let worldQueues = {};
let pendingFade = false;
let playbackStarted = false;
let sessionRunning = false;
let stopAfterCurrentClip = false;
let sessionDurationSeconds = Number(durationSelect?.value || 900);
let sessionStartedAt = 0;
let sessionDeadlineAt = 0;
let sessionIntervalId = 0;
let nextPreparedClip = null;
let currentPlaybackState = null;
let lastPlayedByWorld = {};

// Per-clip continuity memory.
// Each clip remembers the next forward point where it should re-enter.
// This keeps offsets intentional instead of random. When a clip first appears,
// it may start deeper inside the timeline. Later visits continue forward from
// where the prior visible run ended, wrapping back to the beginning as needed.
const continuityState = new Map();

function getWorldLabel(worldKey) {
  return worldKey.replace(/_/g, ' ');
}

function getClipFilename(src) {
  const parts = src.split('/');
  return parts[parts.length - 1];
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

function resetVideo(video) {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function stopVideo(video) {
  video.pause();
  video.classList.remove('is-active');
  try {
    video.currentTime = 0;
  } catch (error) {
    // Some browsers may reject currentTime changes while metadata is absent.
  }
}

function buildShuffledQueue(worldKey) {
  const clips = [...(clipGroups[worldKey] || [])];
  const previousSrc = lastPlayedByWorld[worldKey];

  for (let index = clips.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [clips[index], clips[swapIndex]] = [clips[swapIndex], clips[index]];
  }

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

function takeNextClipForWorld(worldKey) {
  ensureWorldQueue(worldKey);

  const clip = worldQueues[worldKey].shift();
  if (!clip) {
    return null;
  }

  if (worldQueues[worldKey].length === 0) {
    worldQueues[worldKey] = buildShuffledQueue(worldKey);
  }

  lastPlayedByWorld[worldKey] = clip.src;
  return { ...clip, world: worldKey };
}

function chooseEntryOffset(duration, clipMetadata) {
  const storedState = continuityState.get(clipMetadata.src);

  // First visit: choose a deliberate offset inside the clip instead of always
  // starting at zero. This makes the world feel already in motion.
  if (!storedState) {
    const upperBound = Math.max(0, duration - MIN_CONTINUITY_ADVANCE);
    const offset = upperBound > MIN_CONTINUITY_ADVANCE
      ? randomBetween(0, upperBound)
      : 0;

    continuityState.set(clipMetadata.src, {
      nextOffsetSeconds: offset,
      initialized: true,
    });

    return offset;
  }

  return Math.min(storedState.nextOffsetSeconds, Math.max(0, duration - 0.05));
}

function getPlayoutPlan(videoElement, clipMetadata) {
  const duration = Number(videoElement.duration || 0);

  if (!Number.isFinite(duration) || duration <= 0) {
    return {
      entryOffsetSeconds: 0,
      visibleDurationSeconds: MIN_VISIBLE_SECONDS,
      fadeStartSeconds: Math.max(0, MIN_VISIBLE_SECONDS - CROSSFADE_SECONDS),
      wraparoundNeeded: false,
      clipDurationSeconds: duration,
    };
  }

  const entryOffsetSeconds = chooseEntryOffset(duration, clipMetadata);

  // The player owns timing. We choose a visible duration that feels varied,
  // but still respects clip length and leaves enough room for a 1.5s fade.
  const theoreticalMax = Math.max(
    MIN_VISIBLE_SECONDS,
    Math.min(MAX_VISIBLE_SECONDS, duration + Math.max(0, duration - 2)),
  );
  const visibleDurationSeconds = Math.min(
    theoreticalMax,
    Math.max(MIN_VISIBLE_SECONDS, randomBetween(MIN_VISIBLE_SECONDS, theoreticalMax)),
  );

  const travelUntilEnd = duration - entryOffsetSeconds;
  const wraparoundNeeded = visibleDurationSeconds > travelUntilEnd;
  const fadeStartSeconds = Math.max(0.15, visibleDurationSeconds - CROSSFADE_SECONDS);

  const nextOffsetSeconds = (entryOffsetSeconds + visibleDurationSeconds) % duration;
  continuityState.set(clipMetadata.src, {
    nextOffsetSeconds,
    initialized: true,
  });

  return {
    entryOffsetSeconds,
    visibleDurationSeconds,
    fadeStartSeconds,
    wraparoundNeeded,
    clipDurationSeconds: duration,
  };
}

function applyPendingWorldIfNeeded() {
  if (pendingWorld && pendingWorld !== currentWorld) {
    currentWorld = pendingWorld;
    pendingWorld = null;
  }
}

function updateWorldSelector() {
  const worldKeys = Object.keys(clipGroups);
  worldSelect.innerHTML = worldKeys
    .map((worldKey) => {
      const selected = worldKey === (pendingWorld || currentWorld) ? 'selected' : '';
      return `<option value="${worldKey}" ${selected}>${getWorldLabel(worldKey)}</option>`;
    })
    .join('');
}

function updateStatusReadout() {
  const currentClip = currentPlaybackState?.clip?.src ? getClipFilename(currentPlaybackState.clip.src) : 'waiting';
  const nextClip = nextPreparedClip?.src ? getClipFilename(nextPreparedClip.src) : 'waiting';
  const activeWorldLabel = getWorldLabel(currentWorld);
  const pendingWorldLabel = pendingWorld ? ` → next: ${getWorldLabel(pendingWorld)}` : '';
  const entryOffset = currentPlaybackState?.plan?.entryOffsetSeconds ?? 0;
  const visibleDuration = currentPlaybackState?.plan?.visibleDurationSeconds ?? 0;
  const elapsed = sessionStartedAt ? (Date.now() - sessionStartedAt) / 1000 : 0;
  const remaining = sessionDeadlineAt ? Math.max(0, (sessionDeadlineAt - Date.now()) / 1000) : sessionDurationSeconds;
  const timerLabel = sessionRunning
    ? `${formatSeconds(elapsed)} elapsed / ${formatSeconds(remaining)} left`
    : `ready / ${formatSeconds(sessionDurationSeconds)} session`;

  statusReadout.innerHTML = [
    `<strong>current world</strong> ${activeWorldLabel}${pendingWorldLabel}`,
    `<strong>current clip</strong> ${currentClip}`,
    `<strong>next clip</strong> ${nextClip}`,
    `<strong>entry offset</strong> ${entryOffset.toFixed(2)}s`,
    `<strong>visible duration</strong> ${visibleDuration.toFixed(2)}s`,
    `<strong>session timer</strong> ${timerLabel}`,
  ].join('\n');
}

function setStandbySource(clip) {
  if (!clip) {
    nextPreparedClip = null;
    resetVideo(standbyVideo);
    updateStatusReadout();
    return;
  }

  nextPreparedClip = clip;
  resetVideo(standbyVideo);
  standbyVideo.src = clip.src;
  standbyVideo.load();
  updateStatusReadout();
}

function prepareNextStandbyClip() {
  const worldForNextClip = pendingWorld || currentWorld;
  const nextClip = takeNextClipForWorld(worldForNextClip);
  setStandbySource(nextClip);
}

function getJourneyElapsed(video, playbackState) {
  if (!playbackState || !Number.isFinite(video.duration) || video.duration <= 0) {
    return 0;
  }

  const duration = video.duration;
  const raw = video.currentTime - playbackState.plan.entryOffsetSeconds;
  if (!playbackState.didWrap) {
    return raw >= 0 ? raw : duration + raw;
  }

  return (duration - playbackState.plan.entryOffsetSeconds) + video.currentTime;
}

function shouldStartFade(video, playbackState) {
  return getJourneyElapsed(video, playbackState) >= playbackState.plan.fadeStartSeconds;
}

async function safePlay(video) {
  try {
    await video.play();
  } catch (error) {
    console.warn('Autoplay was blocked or playback failed.', error);
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
      const onReady = () => {
        video.removeEventListener('loadedmetadata', onReady);
        resolve();
      };
      video.addEventListener('loadedmetadata', onReady, { once: true });
    });
  }

  const plan = getPlayoutPlan(video, clip);
  const playbackState = {
    clip,
    world: clip.world,
    plan,
    didWrap: false,
    startedAt: Date.now(),
  };

  video.currentTime = Math.min(plan.entryOffsetSeconds, Math.max(0, (video.duration || 0) - 0.05));
  return playbackState;
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
  updateStatusReadout();
}

function gracefullyStopSession() {
  sessionRunning = false;
  stopAfterCurrentClip = true;
  playButton.textContent = 'Play Session';
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

async function crossfadeToPreparedClip() {
  if (pendingFade || !nextPreparedClip || !currentPlaybackState) {
    return;
  }

  pendingFade = true;

  if (stopAfterCurrentClip) {
    pendingFade = false;
    stopVideo(activeVideo);
    stopVideo(standbyVideo);
    nextPreparedClip = null;
    currentPlaybackState = null;
    playbackStarted = false;
    updateStatusReadout();
    return;
  }

  applyPendingWorldIfNeeded();

  const standbyPlaybackState = await primeClipOnVideo(standbyVideo, nextPreparedClip);
  if (!standbyPlaybackState) {
    pendingFade = false;
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
    pendingFade = false;
    updateWorldSelector();
    updateStatusReadout();
  }, CROSSFADE_SECONDS * 1000);
}

function handleActiveVideoTimeUpdate(video) {
  if (!currentPlaybackState || video !== activeVideo || pendingFade) {
    return;
  }

  if (
    currentPlaybackState.plan.wraparoundNeeded
    && !currentPlaybackState.didWrap
    && Number.isFinite(video.duration)
    && video.duration > 0
    && video.currentTime >= video.duration - 0.08
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

function populateWorlds() {
  updateWorldSelector();
}

function handleWorldChange() {
  const selectedWorld = worldSelect.value;
  if (!selectedWorld || selectedWorld === currentWorld) {
    pendingWorld = null;
  } else {
    pendingWorld = selectedWorld;
  }

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

function handleMusicUpload() {
  const [file] = musicUpload.files || [];
  if (!file) {
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  musicPlayer.src = objectUrl;
  musicPlayer.play().catch((error) => {
    console.warn('Music playback needs a user interaction.', error);
  });
}

async function startSession() {
  if (playbackStarted) {
    gracefullyStopSession();
    return;
  }

  const firstClip = takeNextClipForWorld(currentWorld);
  if (!firstClip) {
    console.warn('No clips configured for the selected world.');
    return;
  }

  playbackStarted = true;
  beginSessionTimer();
  await startPlaybackOnActiveVideo(firstClip);
  prepareNextStandbyClip();
  updateWorldSelector();
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
