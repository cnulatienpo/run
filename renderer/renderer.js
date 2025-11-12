import { WS_URL } from './config.js';
import { softPulse, scanline, withZoneClip } from '../effects/filters.js';
import mapping from '../effects/effect-mapping.json' assert { type: 'json' };

const canvas = document.getElementById('fx-canvas');
const stepEl = document.getElementById('hud-step');
const timerEl = document.getElementById('hud-timer');
const moodSelect = document.getElementById('hud-mood');
const tagContainer = document.getElementById('tag-buttons');
const tagStatus = document.getElementById('hud-tag');
const statusEl = document.getElementById('hud-status');

const socket = new WebSocket(WS_URL);
const activeTags = new Set();
let stepCount = 0;
let sessionStart = Date.now();
let currentMood = mapping.defaultMood || 'dreamlike';

const fallbackTags = ['ambient', 'rare', 'glide', 'sway', 'night', 'pulse'];
const availableTags = Array.isArray(mapping.tags) && mapping.tags.length ? mapping.tags : fallbackTags;

const STATUS_CLASSNAMES = {
  connecting: 'hud-status--connecting',
  connected: 'hud-status--connected',
  disconnected: 'hud-status--disconnected'
};

function setStatus(state = 'connecting') {
  statusEl.classList.remove(...Object.values(STATUS_CLASSNAMES));
  const className = STATUS_CLASSNAMES[state] || STATUS_CLASSNAMES.connecting;
  if (className) {
    statusEl.classList.add(className);
  }

  if (state === 'connected') {
    statusEl.textContent = 'Connected';
  } else if (state === 'disconnected') {
    statusEl.textContent = 'Disconnected';
  } else {
    statusEl.textContent = 'Connecting…';
  }
}

function updateStepDisplay() {
  stepEl.textContent = stepCount.toLocaleString();
}

function updateTagStatus() {
  if (activeTags.size === 0) {
    tagStatus.textContent = 'None';
    return;
  }

  tagStatus.textContent = Array.from(activeTags).join(', ');
}

function syncTagButtons() {
  tagContainer.querySelectorAll('button[data-tag]').forEach((button) => {
    const tag = button.dataset.tag;
    button.classList.toggle('is-active', activeTags.has(tag));
  });
  updateTagStatus();
}

function toggleTag(tag) {
  if (activeTags.has(tag)) {
    activeTags.delete(tag);
  } else {
    activeTags.add(tag);
  }
  syncTagButtons();
}

function buildMoodSelector() {
  const moods = Object.keys(mapping.moods || {});
  const uniqueMoods = moods.length ? new Set(moods) : new Set([currentMood]);
  uniqueMoods.add(currentMood);

  uniqueMoods.forEach((mood) => {
    const option = document.createElement('option');
    option.value = mood;
    option.textContent = mood;
    moodSelect.appendChild(option);
  });

  if (uniqueMoods.has(currentMood)) {
    moodSelect.value = currentMood;
  } else if (moodSelect.options.length) {
    currentMood = moodSelect.options[0].value;
    moodSelect.value = currentMood;
  }

  moodSelect.addEventListener('change', () => {
    currentMood = moodSelect.value;
  });
}

function buildTagButtons() {
  tagContainer.innerHTML = '';
  availableTags.forEach((tag) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag-button';
    button.dataset.tag = tag;
    button.textContent = tag;
    button.addEventListener('click', () => toggleTag(tag));
    tagContainer.appendChild(button);
  });
  syncTagButtons();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function runEffectLoop() {
  if (!canvas) {
    return;
  }
  const interval = mapping.intervalMs || { min: 10000, max: 14000 };
  const delay = Math.random() * (interval.max - interval.min) + interval.min;

  setTimeout(() => {
    const effectList = mapping.moods?.[currentMood] || mapping.moods?.[mapping.defaultMood] || [];
    const zoneList = mapping.zones?.[currentMood] || mapping.zones?.[mapping.defaultMood] || ['center'];

    if (!effectList.length) {
      runEffectLoop();
      return;
    }

    const effectName = pick(effectList);
    const zone = pick(zoneList);

    const cleanup = withZoneClip(canvas, zone);
    const effectMap = { softPulse, scanline };
    const effectFn = effectMap[effectName];
    if (typeof effectFn === 'function') {
      effectFn(canvas);
    }
    if (typeof cleanup === 'function') {
      setTimeout(cleanup, 2000);
    }
    runEffectLoop();
  }, delay);
}

socket.addEventListener('open', () => {
  setStatus('connected');
  console.log('[WS] Connected');
});

socket.addEventListener('close', () => {
  setStatus('disconnected');
  console.warn('[WS] Disconnected');
});

socket.addEventListener('error', (error) => {
  console.error('[WS] Error', error);
});

socket.addEventListener('message', (event) => {
  try {
    const data = JSON.parse(event.data);

    if (typeof data.status === 'string') {
      const normalized = data.status.toLowerCase();
      if (normalized in STATUS_CLASSNAMES) {
        setStatus(normalized);
      }
    }

    if (Number.isFinite(data.steps)) {
      stepCount = data.steps;
      updateStepDisplay();
    }

    if (typeof data.mood === 'string' && (mapping.moods?.[data.mood] || data.mood === currentMood)) {
      currentMood = data.mood;
      if (moodSelect.value !== currentMood) {
        moodSelect.value = currentMood;
      }
    }

    if (Array.isArray(data.tags)) {
      activeTags.clear();
      data.tags.forEach((tag) => {
        if (typeof tag === 'string' && tag.trim()) {
          activeTags.add(tag);
        }
      });
      syncTagButtons();
    }
  } catch (error) {
    console.error('[WS] Failed to parse message', error);
  }
});

setInterval(() => {
  const elapsed = Date.now() - sessionStart;
  const minutes = Math.floor(elapsed / 60000)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor((elapsed % 60000) / 1000)
    .toString()
    .padStart(2, '0');
  timerEl.textContent = `${minutes}:${seconds}`;
}, 1000);

setStatus('connecting');
buildMoodSelector();
buildTagButtons();
updateStepDisplay();
updateTagStatus();
runEffectLoop();
