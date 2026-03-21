// World-based treadmill player.
//
// Important architecture constraints are preserved on purpose:
// - exactly two stacked <video> elements
// - browser-native playback only
// - one visible active video and one hidden standby video
// - crossfades handled with CSS opacity plus simple JavaScript timing
//
// The upgrade is in the playback logic. Instead of a flat playlist, clips live
// inside worlds. Each clip gets a playout plan with an entry offset, a variable
// visible duration, and optional wraparound. Each clip is treated like a
// circular timeline so entering midstream still allows the beginning to appear
// later on a future visit.

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
const MIN_INITIAL_OFFSET_BUFFER = 2.5;
const END_WRAP_SAFETY = 0.08;

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
    // Ignore browsers that reject currentTime before metadata is available.
  }
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

  // First visit: begin inside the clip if possible so the world feels already
  // underway. Later visits reuse the stored forward position, which makes the
  // clip behave like a circular space rather than random fragments.
  if (!storedState) {
    const maxOffset = Math.max(0, duration - MIN_INITIAL_OFFSET_BUFFER);
    if (maxOffset <= MIN_INITIAL_OFFSET_BUFFER) {
      return 0;
    }

    return randomBetween(0, maxOffset);
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

  // Persist the next forward entry point. If the visible run extends past the
  // end, modulo arithmetic makes the next visit continue at the wrapped point.
  const nextOffsetSeconds = (entryOffsetSeconds + visibleDurationSeconds) % clipDurationSeconds;
  continuityState.set(clipMetadata.src, { nextOffsetSeconds });

  return {
    entryOffsetSeconds,
    visibleDurationSeconds,
    fadeStartSeconds,
    wraparoundNeeded,
    clipDurationSeconds,
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

  nextPreparedClip = clip;
  resetVideo(standbyVideo);
  standbyVideo.src = clip.src;
  standbyVideo.load();
  updateStatusReadout();
}

function prepareNextStandbyClip() {
  const targetWorld = pendingWorld || currentWorld;
  setStandbySource(takeNextClipForWorld(targetWorld));
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
    updateWorldSelector();
    updateStatusReadout();
    pendingFade = false;
  }, CROSSFADE_SECONDS * 1000);
}

function handleActiveVideoTimeUpdate(video) {
  if (video !== activeVideo || !currentPlaybackState || pendingFade) {
    return;
  }

  // Wrap while the clip is still the visible source. This reveals the clip's
  // beginning after entering somewhere later in the timeline.
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
