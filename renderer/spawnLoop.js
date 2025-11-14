import * as FX from './effects.js';

const tagConfig = {
  Dreamcore: { interval: [5000, 10000], effects: [FX.softPulse, FX.scanline] },
  Ambient: { interval: [15000, 30000], effects: [FX.scanline] },
  Urban: { interval: [8000, 16000], effects: [FX.softPulse] },
};

let canvas = document.getElementById('fx-overlay');
let active = false;
let currentTag = 'Dreamcore';
let timer;

export function setTag(tag) {
  currentTag = tag;
  if (active) restart();
}

export function start() {
  if (active) return;
  active = true;
  scheduleNext();
}

export function stop() {
  active = false;
  clearTimeout(timer);
}

function scheduleNext() {
  if (!active) return;
  if (!canvas || !document.body.contains(canvas)) {
    canvas = document.getElementById('fx-overlay');
  }
  const { interval, effects } = tagConfig[currentTag] || tagConfig.Dreamcore;
  const delay = rand(interval[0], interval[1]);
  timer = setTimeout(() => {
    const fx = randomFrom(effects);
    if (canvas && typeof fx === 'function') {
      fx(canvas);
    }
    scheduleNext();
  }, delay);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function restart() {
  clearTimeout(timer);
  scheduleNext();
}
