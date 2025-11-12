import { softPulse, scanline, withZoneClip } from '../effects/filters.js';
import config from '../effects/effect-mapping.json' assert { type: 'json' };

const moods = Object.keys(config.moods || {});
const tags = ['Ambient', 'Dreamcore', 'Urban', 'Rare'];
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

  const tagWrap = document.createElement('div');
  tagWrap.id = 'tag-wrap';

  tags.forEach((tag) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      currentTag = tag;
      highlightTag(tag);
      logEvent('tag-change', { tag });
    });
    tagWrap.appendChild(btn);
  });

  hud.appendChild(tagWrap);
}

function highlightTag(tag) {
  const buttons = document.querySelectorAll('#tag-wrap button');
  buttons.forEach((btn) => {
    btn.style.background = btn.textContent === tag ? '#2dd4bf' : '#1f2937';
  });
}

const tagTimings = {
  Ambient: [14000, 28000],
  Dreamcore: [8000, 15000],
  Urban: [6000, 12000],
  Rare: [25000, 50000],
};

function getCurrentInterval() {
  const [min, max] = tagTimings[currentTag] || [10000, 20000];
  return Math.floor(Math.random() * (max - min)) + min;
}

const canvas = document.getElementById('fx-canvas');

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

function loop() {
  const delay = getCurrentInterval();
  setTimeout(() => {
    spawnEffect();
    loop();
  }, delay);
}

initHUD();
highlightTag(currentTag);
loop();
