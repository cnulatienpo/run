import { WS_URL } from './config.js';
import { softPulse, scanline, withZoneClip } from '../effects/filters.js';
import mapping from '../effects/effect-mapping.json' assert { type: 'json' };

const pacingMap = {
  Dreamcore: [5000, 9000],
  Urban: [8000, 14000],
  Ambient: [12000, 24000],
  Rare: [25000, 40000],
  Chillwave: [10000, 16000],
  default: [10000, 20000],
};

const canvas = document.getElementById('fx-canvas');
const stepEl = document.getElementById('hud-step');
const timerEl = document.getElementById('hud-timer');
const moodSelect = document.getElementById('hud-mood');
const tagContainer = document.getElementById('hud-tags');
const tagLabel = document.getElementById('hud-tag-label');
const statusEl = document.getElementById('hud-status');

const socket = new WebSocket(WS_URL);
let stepCount = 0;
let sessionStart = Date.now();
let currentMood = mapping.defaultMood || 'dreamlike';
const storage = typeof localStorage !== 'undefined' ? localStorage : undefined;

const storedTag = storage?.getItem('selectedTag');
let currentTag = pacingMap[storedTag] ? storedTag : 'default';
let tagIntervalHandle;

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
  if (!tagContainer) {
    return;
  }

  tagContainer.innerHTML = '';
  Object.keys(pacingMap)
    .filter((tag) => tag !== 'default')
    .forEach((tag) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tag-button';
      button.dataset.tag = tag;
      button.textContent = tag;
      button.addEventListener('click', () => {
        currentTag = tag;
        storage?.setItem('selectedTag', tag);
        updateTagUI(tag);
        restartTagSpawnLoop();
      });
      tagContainer.appendChild(button);
    });
  updateTagUI(currentTag);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function updateTagUI(tag) {
  if (tagContainer) {
    tagContainer.querySelectorAll('button').forEach((button) => {
      const isSelected = button.dataset.tag === tag;
      button.classList.toggle('selected', isSelected);
      button.classList.toggle('is-active', isSelected);
    });
  }
  if (tagLabel) {
    const displayName = tag === 'default' ? 'Default' : tag;
    tagLabel.textContent = `Tag: ${displayName}`;
  }
}

function triggerHallucination() {
  if (!canvas) {
    return;
  }

  const effectList = mapping.moods?.[currentMood] || mapping.moods?.[mapping.defaultMood] || [];
  const zoneList = mapping.zones?.[currentMood] || mapping.zones?.[mapping.defaultMood] || ['center'];

  if (!effectList.length) {
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
}

function restartTagSpawnLoop() {
  if (tagIntervalHandle) {
    clearTimeout(tagIntervalHandle);
  }

  const [min, max] = pacingMap[currentTag] || pacingMap.default;
  const delay = Math.random() * (max - min) + min;

  tagIntervalHandle = setTimeout(() => {
    triggerHallucination();
    restartTagSpawnLoop();
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
      const nextTag = data.tags.find((tag) => pacingMap[tag]);
      if (nextTag) {
        currentTag = nextTag;
        storage?.setItem('selectedTag', currentTag);
        updateTagUI(currentTag);
        restartTagSpawnLoop();
      }
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
restartTagSpawnLoop();
