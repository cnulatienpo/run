import { applyEntryMode, stopReverse, ENTRY_MODES } from './entryMode.js';
import { resolveEntryMode } from './strategy.js';

const clips = [
  { id: 'grey-a', src: '/grey/a.mp4', entryMode: 'start_forward' },
  { id: 'grey-partial', src: '/grey/grey partial.mp4' },
  { id: 'clown-6', src: '/clown/video-1018365751362934.mp4', entryMode: 'middle_reverse' },
];

const state = {
  clipIndex: 0,
  baseMode: 'start_forward',
  strategy: 'manual',
  autoCycle: false,
  randomize: false,
  pendingApply: false,
  previousClipState: null,
  lastResolvedMode: 'start_forward',
  lastApplyResult: null,
};

const video = document.getElementById('playerVideo');
const overlay = document.getElementById('debugOverlay');
const modeSelect = document.getElementById('entryModeSelect');
const strategySelect = document.getElementById('strategySelect');
const randomizeInput = document.getElementById('randomizeToggle');
const cycleBtn = document.getElementById('cycleBtn');
const applyNextBtn = document.getElementById('applyNextBtn');
const nextClipBtn = document.getElementById('nextClipBtn');
const currentModeEl = document.getElementById('currentModeValue');
const currentTimeEl = document.getElementById('currentTimeValue');
const directionEl = document.getElementById('directionValue');
const reverseMethodEl = document.getElementById('reverseMethodValue');
const clipEl = document.getElementById('clipValue');
const statusEl = document.getElementById('statusText');

function cap(text) {
  return String(text).charAt(0).toUpperCase() + String(text).slice(1);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function anchorLabel(mode) {
  if (mode.startsWith('start')) return 'START';
  if (mode.startsWith('middle')) return 'MIDDLE';
  return 'END';
}

function directionLabel(mode) {
  return mode.endsWith('reverse') ? 'REVERSE' : 'FORWARD';
}

function updateDebugOverlay() {
  const mode = state.lastApplyResult?.mode || state.lastResolvedMode || state.baseMode;
  overlay.textContent = `${anchorLabel(mode)} / ${directionLabel(mode)}`;
}

function updatePanel() {
  const result = state.lastApplyResult;
  const mode = result?.mode || state.lastResolvedMode || state.baseMode;

  currentModeEl.textContent = mode;
  directionEl.textContent = result?.direction || directionLabel(mode).toLowerCase();
  reverseMethodEl.textContent = result?.reverseMethod || 'n/a';
  clipEl.textContent = clips[state.clipIndex].src;
  updateDebugOverlay();
}

function normalizePath(src) {
  if (/^(https?:|blob:)/i.test(src)) return src;
  return src.startsWith('/') ? src : `/${src}`;
}

function capturePreviousState() {
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const exitRatio = duration ? Math.min(1, Math.max(0, video.currentTime / duration)) : 0;
  const prevStart = state.lastApplyResult?.startTime || 0;
  const prevStartRatio = duration ? prevStart / duration : 0;

  state.previousClipState = {
    direction: state.lastApplyResult?.direction || 'forward',
    exitRatio,
    motionScore: Math.abs(exitRatio - prevStartRatio),
    transitionDelta: Math.abs(exitRatio - 0.5),
  };
}

function resolveModeForClip(clip) {
  if (clip.entryMode) return clip.entryMode;

  return resolveEntryMode({
    strategy: state.strategy,
    baseMode: state.baseMode,
    randomize: state.randomize,
    autoCycle: state.autoCycle,
    previousClipState: state.previousClipState,
  });
}

async function applyForCurrentClip(reason) {
  const clip = clips[state.clipIndex];
  const mode = resolveModeForClip(clip);
  state.lastResolvedMode = mode;

  const result = await applyEntryMode(video, mode, {
    forceManualReverse: false,
  });

  state.lastApplyResult = result;
  updatePanel();
  setStatus(`${reason}: ${clip.id} using ${result.mode}`);
}

async function loadCurrentClip() {
  const clip = clips[state.clipIndex];
  const src = normalizePath(clip.src);

  stopReverse(video);
  video.playbackRate = 1;
  video.src = src;
  video.load();
  clipEl.textContent = src;

  await new Promise((resolve) => {
    const onLoaded = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      resolve();
    };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
  });

  if (state.pendingApply) {
    state.pendingApply = false;
    await applyForCurrentClip('Applied pending mode');
  } else {
    await applyForCurrentClip('Auto-applied mode on load');
  }
}

function bindControls() {
  for (const mode of ENTRY_MODES) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode;
    modeSelect.appendChild(option);
  }
  modeSelect.value = state.baseMode;

  modeSelect.addEventListener('change', () => {
    state.baseMode = modeSelect.value;
    state.lastResolvedMode = state.baseMode;
    updatePanel();
  });

  strategySelect.addEventListener('change', () => {
    state.strategy = strategySelect.value;
    setStatus(`Strategy set to ${state.strategy}`);
  });

  randomizeInput.addEventListener('change', () => {
    state.randomize = randomizeInput.checked;
    setStatus(state.randomize ? 'Randomize mode enabled' : 'Randomize mode disabled');
  });

  cycleBtn.addEventListener('click', () => {
    state.autoCycle = !state.autoCycle;
    cycleBtn.textContent = state.autoCycle
      ? 'Cycle Modes Automatically: ON'
      : 'Cycle Modes Automatically: OFF';
    setStatus(state.autoCycle ? 'Auto-cycle enabled' : 'Auto-cycle disabled');
  });

  applyNextBtn.addEventListener('click', () => {
    state.pendingApply = true;
    const clip = clips[state.clipIndex];
    const mode = resolveModeForClip(clip);
    state.lastResolvedMode = mode;
    updatePanel();
    setStatus(`Queued ${mode} for next clip load`);
  });

  nextClipBtn.addEventListener('click', async () => {
    capturePreviousState();
    state.clipIndex = (state.clipIndex + 1) % clips.length;
    await loadCurrentClip();
  });

  video.addEventListener('timeupdate', () => {
    currentTimeEl.textContent = video.currentTime.toFixed(3);
  });
}

export async function startDemo() {
  bindControls();
  await loadCurrentClip();
}
