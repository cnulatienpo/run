import { softPulse, scanline, withZoneClip } from '../effects/filters.js';
import config from '../effects/effect-mapping.json' assert { type: 'json' };
import { createTagHUD } from './tagManager.js';

const moods = Object.keys(config.moods || {});
let currentMood = moods.includes('dreamlike') ? 'dreamlike' : moods[0] || '';
let currentTag = 'Ambient';

function initHUD() {
  const hud = document.getElementById('hud');
  if (!hud) return;

  const moodSelect = document.createElement('select');
  moodSelect.id = 'mood-select';

  moods.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    moodSelect.appendChild(opt);
  });

  if (currentMood) {
    moodSelect.value = currentMood;
  }

  moodSelect.addEventListener('change', (event) => {
    currentMood = event.target.value;
    logEvent('mood-change', { mood: currentMood });
  });

  hud.appendChild(moodSelect);

  createTagHUD((tag) => {
    currentTag = tag;
    logEvent('tag-change', { tag });
  }, { defaultTag: currentTag });
}

const canvas = document.getElementById('fx-canvas');

let effectTimer;

const motionState = {
  steps: 0,
  bpm: 0,
  lastUpdate: Date.now(),
};

function updateMotionData(data) {
  if (typeof data.steps === 'number') {
    motionState.steps = data.steps;
    motionState.lastUpdate = Date.now();
  }

  if (typeof data.bpm === 'number') {
    motionState.bpm = data.bpm;
  }
}

function getPacingForMotion(steps) {
  if (steps < 50) return [20000, 30000];
  if (steps < 150) return [10000, 16000];
  if (steps < 400) return [6000, 10000];
  return [3000, 6000];
}

function scheduleMotionDrivenEffect() {
  clearTimeout(effectTimer);

  const [minDelay, maxDelay] = getPacingForMotion(motionState.steps);
  const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;

  effectTimer = setTimeout(() => {
    spawnEffect();
    scheduleMotionDrivenEffect();
  }, delay);
}

function spawnEffect() {
  if (!canvas) return;

  const fxList = config.moods[currentMood] || config.moods.dreamlike || [];
  const zoneList = config.zones?.[currentMood] || config.zones?.dreamlike || [];

  if (!fxList.length) return;

  const fx = fxList[Math.floor(Math.random() * fxList.length)];
  const zone = zoneList[Math.floor(Math.random() * zoneList.length)] || 'center';

  const clipReset = withZoneClip(canvas, zone);
  if (fx === 'softPulse') {
    softPulse(canvas);
  } else if (fx === 'scanline') {
    scanline(canvas);
  }
  setTimeout(() => {
    if (typeof clipReset === 'function') {
      clipReset();
    }
  }, 1600);

  logEvent('effect', { fx, zone });
}

let sessionLog = [];
let sessionStart = Date.now();

function logEvent(type, payload) {
  sessionLog.push({
    t: Date.now() - sessionStart,
    type,
    ...payload,
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'l') {
    const blob = new Blob([JSON.stringify(sessionLog, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run_session_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
});

initHUD();
scheduleMotionDrivenEffect();

const ws = new WebSocket(globalThis.RTW_WS_URL || 'ws://localhost:6789');
ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    updateMotionData(data);
  } catch (err) {
    console.warn('Malformed motion input:', event.data);
  }
};
