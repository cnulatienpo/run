'use strict';

// ── Clip list ────────────────────────────────────────────────────────────────
const CLIPS = [
  '/grey/a.mp4',
  '/grey/grey partial.mp4',
  '/grey/grey white.mp4',
  '/grey/grey marble.mp4',
  '/grey/chegall tunnel 2.mp4',
  '/grey/high school hallway.mp4',
  '/grey/stained sqaures 1.mp4',
  '/clown/video-1010505465482296.mp4',
  '/clown/video-1011496565383186.mp4',
  '/clown/video-1018069851392524.mp4',
  '/clown/video-1018070068059169.mp4',
  '/clown/video-1018078004725042.mp4',
  '/clown/video-1018365751362934.mp4',
];

// ── Zoom-quilt timing ──────────────────────────────────────────────────────────────────────────
const ZOOM_OUT_MS  = 480;  // outgoing clip zooms through VP
const ZOOM_IN_MS   = 520;  // incoming clip expands from VP portal
const ZOOM_OUT_TO  = 3.8;  // outgoing end scale ("fly into" the point)
const ZOOM_IN_FROM = 0.14; // incoming start scale (tiny portal)

// ── State ─────────────────────────────────────────────────────────────────────────────
const state = {
  index: 0,
  mode: 'cover',
  edgeFill: true,
  transitioning: false,
};

// ── DOM refs ─────────────────────────────────────────────────────────────────────────────
const bgVideo     = /** @type {HTMLVideoElement} */ (document.getElementById('bgVideo'));
const fgA         = /** @type {HTMLVideoElement} */ (document.getElementById('fgA'));
const fgB         = /** @type {HTMLVideoElement} */ (document.getElementById('fgB'));
const playerContainer = document.getElementById('playerContainer');
const modeLabel   = document.getElementById('modeLabel');
const edgeFillBtn = document.getElementById('edgeFillBtn');
const modeBtns    = /** @type {NodeListOf<HTMLButtonElement>} */ (
  document.querySelectorAll('.mode-btn')
);

// ── Active / standby fg refs — swapped after every transition ───────────────────────
let activeFg  = fgA;
let standbyFg = fgB;

// ── Utility ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wrap(n, len) {
  return ((n % len) + len) % len;
}

function updateFrameOrientation(video) {
  if (!playerContainer || !video.videoWidth || !video.videoHeight) return;
  const ratio = video.videoWidth / video.videoHeight;
  const EPS = 0.03;
  playerContainer.classList.remove('frame-portrait', 'frame-landscape', 'frame-square');
  if (Math.abs(ratio - 1) <= EPS) {
    playerContainer.classList.add('frame-square');
    return;
  }
  playerContainer.classList.add(ratio > 1 ? 'frame-landscape' : 'frame-portrait');
  
  // Size the video element to actual content dimensions for edge fill to work
  // Get container dimensions
  const containerRect = playerContainer.getBoundingClientRect();
  const containerW = containerRect.width;
  const containerH = containerRect.height;
  const containerRatio = containerW / containerH;
  
  // Calculate video element dimensions based on object-fit: contain
  let videoW, videoH;
  if (ratio > containerRatio) {
    // Video wider than container → constrain by width
    videoW = containerW;
    videoH = containerW / ratio;
  } else {
    // Video taller than container → constrain by height
    videoH = containerH;
    videoW = containerH * ratio;
  }
  
  // Apply dimensions to both video elements and center them
  [fgA, fgB].forEach(el => {
    el.style.width = videoW + 'px';
    el.style.height = videoH + 'px';
    el.style.left = ((containerW - videoW) / 2) + 'px';
    el.style.top = ((containerH - videoH) / 2) + 'px';
  });
}

/** Resolves when the video has enough data to start playing. */
function waitCanPlay(video) {
  if (video.readyState >= 3) return Promise.resolve();
  return new Promise((resolve) => {
    video.addEventListener('canplay', resolve, { once: true });
  });
}

// ── Vanishing-point lookup ──────────────────────────────────────────────────────────────────────
/**
 * Read recorded vanishing-point coordinates from localStorage (same format
 * as the vanishing-point tracker) and interpolate to the given time.
 * Falls back to center {x:0.5, y:0.5} if no data exists.
 */
function getVPAtTime(src, t) {
  try {
    const raw = localStorage.getItem('vp:' + src);
    if (!raw) return { x: 0.5, y: 0.5 };
    const data = JSON.parse(raw);
    const pts  = data && data.points;
    if (!Array.isArray(pts) || pts.length === 0) return { x: 0.5, y: 0.5 };

    if (t <= pts[0].t) return { x: pts[0].x, y: pts[0].y };
    const last = pts[pts.length - 1];
    if (t >= last.t) return { x: last.x, y: last.y };

    let lo = 0, hi = pts.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >>> 1;
      if (pts[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = pts[lo], b = pts[hi];
    const alpha = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
  } catch {
    return { x: 0.5, y: 0.5 };
  }
}

// ── Rendering mode ─────────────────────────────────────────────────────────────────────────────
function setMode(mode) {
  state.mode = mode;
  // Apply only to the currently active fg; standby picks it up at transition.
  activeFg.classList.remove('mode-cover', 'mode-contain', 'mode-stretch');
  activeFg.classList.add(`mode-${mode}`);
  modeLabel.textContent = mode.toUpperCase();
  modeBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

// ── Edge fill ────────────────────────────────────────────────────────────────
/**
 * Show or hide the background blur layer.
 * @param {boolean} enabled
 */
function setEdgeFill(enabled) {
  state.edgeFill = enabled;
  bgVideo.style.visibility = enabled ? 'visible' : 'hidden';
  edgeFillBtn.textContent = `EDGE FILL: ${enabled ? 'ON' : 'OFF'}`;
  edgeFillBtn.classList.toggle('active', enabled);
}

// ── Zoom-quilt clip transition ───────────────────────────────────────────────
/**
 * 1. Sample the vanishing point on the outgoing clip right now.
 * 2. Zoom the outgoing clip through that point (scale ↑, opacity →0).
 * 3. Simultaneously load the incoming clip as a tiny portal anchored at VP.
 * 4. Once the outgoing zoom ends and the incoming is ready, expand it.
 * 5. Swap active ⇔ standby refs for the next transition.
 */
async function loadClip(index) {
  if (state.transitioning) return;
  state.transitioning = true;

  const nextIndex = wrap(index, CLIPS.length);
  const nextSrc   = CLIPS[nextIndex];
  const outgoing  = activeFg;
  const incoming  = standbyFg;

  // 1. Sample VP on the outgoing clip right now.
  const vp        = getVPAtTime(CLIPS[state.index], outgoing.currentTime);
  const originPct = `${(vp.x * 100).toFixed(2)}% ${(vp.y * 100).toFixed(2)}%`;

  // 2. Prepare incoming: tiny portal anchored at the VP.
  incoming.classList.remove('mode-cover', 'mode-contain', 'mode-stretch');
  incoming.classList.add(`mode-${state.mode}`);
  incoming.style.transformOrigin = originPct;
  incoming.style.transform       = `scale(${ZOOM_IN_FROM})`;
  incoming.style.opacity         = '0';
  incoming.style.zIndex          = '3';
  incoming.style.display         = 'block';
  incoming.src = nextSrc;
  incoming.load();

  // 3. Animate outgoing: zoom through the vanishing point.
  outgoing.style.transformOrigin = originPct;
  const outAnim = outgoing.animate(
    [
      { transform: 'scale(1)',              opacity: '1' },
      { transform: `scale(${ZOOM_OUT_TO})`, opacity: '0' },
    ],
    { duration: ZOOM_OUT_MS, easing: 'cubic-bezier(0.55, 0, 1, 0.8)', fill: 'forwards' },
  );

  // 4. Wait: outgoing done AND incoming loadable.
  await Promise.all([
    outAnim.finished,
    Promise.race([waitCanPlay(incoming), sleep(2500)]),
  ]);

  updateFrameOrientation(incoming);

  // Switch bg to new clip mid-transition (before incoming is visible).
  bgVideo.pause();
  bgVideo.src = nextSrc;
  bgVideo.load();
  bgVideo.play().catch(() => {});

  incoming.play().catch(() => {});
  void incoming.offsetWidth; // force reflow so the snap position is committed

  // 4b. Expand incoming from portal to full-screen.
  const inAnim = incoming.animate(
    [
      { transform: `scale(${ZOOM_IN_FROM})`, opacity: '0' },
      { transform: 'scale(1)',               opacity: '1' },
    ],
    { duration: ZOOM_IN_MS, easing: 'cubic-bezier(0, 0.65, 0.3, 1)', fill: 'forwards' },
  );

  await inAnim.finished;

  // 5. Commit, clean up outgoing, swap refs.
  incoming.style.transform       = 'scale(1)';
  incoming.style.opacity         = '1';
  incoming.style.transformOrigin = '';
  incoming.style.zIndex          = '1';

  outgoing.pause();
  outgoing.getAnimations().forEach((a) => a.cancel());
  outgoing.style.transform       = '';
  outgoing.style.opacity         = '';
  outgoing.style.transformOrigin = '';
  outgoing.style.zIndex          = '1';
  outgoing.style.display         = 'none';

  activeFg  = incoming;
  standbyFg = outgoing;
  state.index = nextIndex;
  updateFrameOrientation(incoming);
  state.transitioning = false;
}

// ── Keyboard navigation ──────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'D' || e.key === 'd') loadClip(state.index + 1);
  if (e.key === 'A' || e.key === 'a') loadClip(state.index - 1);
});

// ── Control bindings ─────────────────────────────────────────────────────────
modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => setMode(/** @type {any} */ (btn.dataset.mode)));
});

edgeFillBtn.addEventListener('click', () => setEdgeFill(!state.edgeFill));

// ── Boot ─────────────────────────────────────────────────────────────────────
setMode('cover');
setEdgeFill(true);

// First clip: no zoom-quilt for initial load, just play directly into fgA.
(async () => {
  const src = CLIPS[0];
  activeFg.classList.add('mode-cover');
  activeFg.style.display  = 'block';
  activeFg.style.opacity  = '1';
  activeFg.style.zIndex   = '1';
  activeFg.src            = src;
  bgVideo.src             = src;
  activeFg.addEventListener('loadedmetadata', () => {
    updateFrameOrientation(activeFg);
  }, { once: true });
  activeFg.load();
  bgVideo.load();
  await Promise.race([waitCanPlay(activeFg), sleep(3000)]);
  activeFg.play().catch(() => {});
  bgVideo.play().catch(() => {});
})();
