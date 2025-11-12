import * as FX from './effects.js';

const tagConfig = {
  Dreamcore: { interval: [5000, 10000], effects: [FX.softPulse, FX.scanline] },
  Ambient: { interval: [15000, 30000], effects: [FX.scanline] },
  Urban: { interval: [8000, 16000], effects: [FX.softPulse] },
};

let canvas = null;
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
  window.clearTimeout(timer);
  timer = undefined;
}

function restart() {
  stop();
  start();
}

function scheduleNext() {
  if (!active) return;
  const target = resolveCanvas();
  if (!target) {
    timer = window.setTimeout(scheduleNext, 500);
    return;
  }

  const { interval, effects } = tagConfig[currentTag] || tagConfig.Dreamcore;
  const delay = rand(interval[0], interval[1]);
  timer = window.setTimeout(() => {
    const fx = randomFrom(effects);
    if (typeof fx === 'function') {
      fx(target);
    }
    scheduleNext();
  }, delay);
}

function resolveCanvas() {
  if (!canvas || !document.body.contains(canvas)) {
    canvas = document.getElementById('fx-canvas');
  }
  return canvas;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function randomFrom(arr = []) {
  if (!arr.length) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}
