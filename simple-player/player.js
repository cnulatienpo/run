const clips = [
  'videos/clip1.mp4',
  'videos/clip2.mp4',
  'videos/clip3.mp4',
];

const CROSSFADE_SECONDS = 1.5;

const videoA = document.getElementById('videoA');
const videoB = document.getElementById('videoB');

let activeVideo = videoA;
let standbyVideo = videoB;
let currentIndex = 0;
let pendingFade = false;

if (!videoA || !videoB) {
  throw new Error('Expected #videoA and #videoB elements to exist.');
}

function getClip(index) {
  return clips[index % clips.length];
}

function resetVideo(video) {
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.currentTime = 0;
}

function assignClip(video, clip) {
  if (!clip) {
    return;
  }

  video.src = clip;
  video.load();
}

function preloadStandby() {
  if (clips.length < 2) {
    return;
  }

  const nextIndex = (currentIndex + 1) % clips.length;
  const nextClip = getClip(nextIndex);

  if (!standbyVideo.src || !standbyVideo.src.endsWith(nextClip)) {
    resetVideo(standbyVideo);
    assignClip(standbyVideo, nextClip);
  }
}

async function safePlay(video) {
  try {
    await video.play();
  } catch (error) {
    console.warn('Autoplay was blocked or playback failed.', error);
  }
}

async function crossfadeToNext() {
  if (pendingFade || clips.length === 0) {
    return;
  }

  pendingFade = true;

  if (clips.length === 1) {
    activeVideo.currentTime = 0;
    await safePlay(activeVideo);
    pendingFade = false;
    return;
  }

  standbyVideo.currentTime = 0;
  await safePlay(standbyVideo);

  standbyVideo.classList.add('is-active');
  activeVideo.classList.remove('is-active');

  window.setTimeout(() => {
    const previousActive = activeVideo;

    currentIndex = (currentIndex + 1) % clips.length;
    activeVideo = standbyVideo;
    standbyVideo = previousActive;

    resetVideo(standbyVideo);
    preloadStandby();
    pendingFade = false;
  }, CROSSFADE_SECONDS * 1000);
}

function handleTimeUpdate() {
  if (!Number.isFinite(activeVideo.duration) || activeVideo.duration <= 0) {
    return;
  }

  const remainingTime = activeVideo.duration - activeVideo.currentTime;
  if (remainingTime <= CROSSFADE_SECONDS) {
    void crossfadeToNext();
  }
}

function attachVideoEvents(video) {
  video.addEventListener('timeupdate', () => {
    if (video === activeVideo) {
      handleTimeUpdate();
    }
  });

  video.addEventListener('ended', () => {
    if (video === activeVideo && !pendingFade) {
      void crossfadeToNext();
    }
  });

  video.addEventListener('error', () => {
    console.error(`Failed to load clip: ${video.currentSrc || video.src}`);
  });
}

async function startPlayer() {
  if (clips.length === 0) {
    console.warn('No clips configured. Add paths or URLs to the clips array in player.js.');
    return;
  }

  assignClip(activeVideo, getClip(currentIndex));
  activeVideo.classList.add('is-active');
  standbyVideo.classList.remove('is-active');

  preloadStandby();
  await safePlay(activeVideo);
}

attachVideoEvents(videoA);
attachVideoEvents(videoB);
void startPlayer();
