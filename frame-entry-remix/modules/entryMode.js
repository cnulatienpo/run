export const ENTRY_MODES = [
  'start_forward',
  'middle_forward',
  'end_forward',
  'start_reverse',
  'middle_reverse',
  'end_reverse',
];

const reverseSessions = new WeakMap();

function ensureMetadata(video) {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const onLoaded = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      resolve();
    };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
  });
}

function parseEntryMode(mode) {
  const safeMode = ENTRY_MODES.includes(mode) ? mode : 'start_forward';
  const [anchor, direction] = safeMode.split('_');
  return { anchor, direction, mode: safeMode };
}

function computeStartTime(duration, anchor) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (anchor === 'middle') return duration * 0.5;
  if (anchor === 'end') return duration * 0.9;
  return 0;
}

function supportsNegativePlaybackRate(video) {
  try {
    const previousRate = video.playbackRate;
    video.playbackRate = -1;
    const supported = video.playbackRate < 0;
    video.playbackRate = previousRate;
    return supported;
  } catch {
    return false;
  }
}

export function stopReverse(video) {
  const session = reverseSessions.get(video);
  if (!session) return;
  session.active = false;
  if (session.frameId) cancelAnimationFrame(session.frameId);
  reverseSessions.delete(video);
}

export function playReverse(video, options = {}) {
  const startTime =
    typeof options.fromTime === 'number' ? options.fromTime : video.currentTime;
  const speed = typeof options.speed === 'number' ? options.speed : 1;
  const onStop = typeof options.onStop === 'function' ? options.onStop : null;

  stopReverse(video);
  video.pause();
  video.currentTime = Math.max(0, startTime);

  const session = {
    active: true,
    frameId: null,
    lastTs: 0,
  };
  reverseSessions.set(video, session);

  function step(ts) {
    if (!session.active) return;
    if (!session.lastTs) session.lastTs = ts;

    const elapsed = (ts - session.lastTs) / 1000;
    session.lastTs = ts;

    const delta = elapsed > 0 ? elapsed * speed : 0.016 * speed;
    const nextTime = Math.max(0, video.currentTime - delta);
    video.currentTime = nextTime;

    if (nextTime <= 0.0001) {
      stopReverse(video);
      if (onStop) onStop();
      return;
    }

    session.frameId = requestAnimationFrame(step);
  }

  session.frameId = requestAnimationFrame(step);
}

/**
 * Apply an entry mode without reloading. Sets currentTime and playback direction.
 * Returns resolved runtime details for debugging and UI display.
 */
export async function applyEntryMode(video, mode, options = {}) {
  await ensureMetadata(video);

  const parsed = parseEntryMode(mode);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const startTime = computeStartTime(duration, parsed.anchor);

  stopReverse(video);
  video.currentTime = startTime;

  const forceManualReverse = Boolean(options.forceManualReverse);
  const nativeNegativeSupported = supportsNegativePlaybackRate(video);
  const useManualReverse =
    parsed.direction === 'reverse' &&
    (forceManualReverse || !nativeNegativeSupported);

  let direction = 'forward';

  if (parsed.direction === 'reverse') {
    direction = 'reverse';
    if (useManualReverse) {
      playReverse(video, {
        fromTime: startTime,
        speed: 1,
      });
    } else {
      video.playbackRate = -1;
      video.play().catch(() => {});
    }
  } else {
    video.playbackRate = 1;
    video.play().catch(() => {});
  }

  return {
    mode: parsed.mode,
    anchor: parsed.anchor,
    direction,
    startTime,
    duration,
    reverseMethod: useManualReverse ? 'manual' : 'native',
  };
}
