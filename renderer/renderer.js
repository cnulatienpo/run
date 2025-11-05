/* global YT */
const hudPack = document.getElementById('hud-pack');
const hudMode = document.getElementById('hud-mode');
const hudTime = document.getElementById('hud-time');
const fxCanvas = document.getElementById('fx-canvas');
const videoUrlInput = document.getElementById('videoUrl');
const loadBtn = document.getElementById('loadBtn');
const surpriseBtn = document.getElementById('surpriseBtn');

const { Filters, effectMap } = window.RTW_EFFECTS;

let player, effectTimer = null, seconds = 0, ticker = null;
let sessionMood = effectMap.defaultMood || 'dreamlike';
hudMode.textContent = 'Just Let Me Run';

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function createPlayer(videoId = 'hY4w3C2w0oE') {
  player = new YT.Player('player', {
    videoId,
    playerVars: { autoplay: 0, controls: 1, modestbranding: 1, rel: 0, fs: 1 },
    events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange }
  });
}
window.onYouTubeIframeAPIReady = () => createPlayer();

function onPlayerReady() {
  // nothing yet
}

function onPlayerStateChange(e) {
  const S = YT.PlayerState;
  if (e.data === S.PLAYING) { startTimer(); startEffects(); }
  else if (e.data === S.PAUSED || e.data === S.ENDED || e.data === S.BUFFERING) {
    stopEffects();
    if (e.data !== S.PAUSED) stopTimer(true);
  }
}

function startTimer() {
  if (ticker) return;
  ticker = setInterval(() => {
    seconds += 1;
    const m = String(Math.floor(seconds / 60)).padStart(2,'0');
    const s = String(seconds % 60).padStart(2,'0');
    hudTime.textContent = `${m}:${s}`;
  }, 1000);
}
function stopTimer(reset=false) {
  if (ticker) { clearInterval(ticker); ticker = null; }
  if (reset) { seconds = 0; hudTime.textContent = '00:00'; }
}

function startEffects() {
  if (effectTimer) return;
  const { min, max } = effectMap.intervalMs || { min: 9000, max: 14000 }; // natural-ish
  const loop = () => {
    const moodEffects = effectMap.moods[sessionMood] || [];
    if (moodEffects.length) {
      const effectName = pick(moodEffects);
      const zones = effectMap.zones?.[sessionMood] || ['center'];
      const zone = pick(zones);
      const undoClip = Filters.withZoneClip?.(fxCanvas, zone);
      const fn = Filters[effectName];
      if (typeof fn === 'function') fn(fxCanvas);
      setTimeout(() => undoClip && undoClip(), 2500);
    }
    scheduleNext();
  };
  const scheduleNext = () => { effectTimer = setTimeout(loop, randInt(min, max)); };
  scheduleNext();
}
function stopEffects() { if (effectTimer) { clearTimeout(effectTimer); effectTimer = null; } }

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.searchParams.get('v')) return u.searchParams.get('v');
  } catch {}
  return null;
}
function loadVideoFromInput() {
  const id = extractVideoId(videoUrlInput.value.trim());
  if (!id) { alert('Enter a valid YouTube URL'); return; }
  if (!player) createPlayer(id); else player.loadVideoById(id);
}
function loadSurprise() {
  const picks = ['2A1X2fSuFfE','hY4w3C2w0oE','b0A9v4ZQKxE','L_LUpnjgPso'];
  const id = pick(picks);
  if (!player) createPlayer(id); else player.loadVideoById(id);
}

window.addEventListener('DOMContentLoaded', () => {
  loadBtn.addEventListener('click', loadVideoFromInput);
  surpriseBtn.addEventListener('click', loadSurprise);
});
