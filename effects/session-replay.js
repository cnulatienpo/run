import { applyEffect } from './effect-loader.js';

const EFFECT_EVENT_TYPES = new Set(['effect', 'effect-apply']);
let replayInputAttached = false;

function getTimerHost() {
  if (typeof window !== 'undefined') {
    return window;
  }
  if (typeof globalThis !== 'undefined') {
    return globalThis;
  }
  return null;
}

function wait(ms) {
  const host = getTimerHost();
  if (!host || typeof host.setTimeout !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timeoutId = host.setTimeout(resolve, ms);
    if (typeof timeoutId === 'object' && typeof timeoutId.unref === 'function') {
      timeoutId.unref();
    }
  });
}

function normalizeSpeed(speed) {
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

export async function replaySession(logData, speed = 1.0) {
  const normalizedSpeed = normalizeSpeed(speed);
  if (!Array.isArray(logData) || logData.length === 0) {
    console.warn('[effect-session-replay] No log data to replay.');
    return;
  }

  const events = logData
    .filter((entry) => entry && typeof entry === 'object')
    .filter((entry) => EFFECT_EVENT_TYPES.has(entry.type))
    .map((entry) => ({
      time: Number.isFinite(entry.time) ? entry.time : 0,
      payload: entry.payload ?? entry.event ?? null,
    }))
    .filter((entry) => entry.payload && typeof entry.payload === 'object')
    .sort((a, b) => a.time - b.time);

  if (events.length === 0) {
    console.warn('[effect-session-replay] No effect events available to replay.');
    return;
  }

  let previousTime = Number.isFinite(events[0].time) ? events[0].time : 0;

  for (let i = 0; i < events.length; i += 1) {
    const current = events[i];
    const targetTime = Number.isFinite(current.time) ? current.time : previousTime;
    const delta = Math.max(0, targetTime - previousTime) / normalizedSpeed;
    if (delta > 0) {
      await wait(delta);
    }
    applyEffect(current.payload);
    previousTime = targetTime;
  }
}

export function importSessionLogFromFile(file, options = {}) {
  if (!file) {
    return;
  }
  if (typeof FileReader === 'undefined') {
    console.warn('[effect-session-replay] FileReader API is unavailable in this environment.');
    return;
  }

  const speed = normalizeSpeed(options.speed ?? 1);
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target?.result ?? '[]');
      replaySession(data, speed);
    } catch (error) {
      console.warn('[effect-session-replay] Failed to parse session log file.', error);
    }
  };
  reader.onerror = () => {
    console.warn('[effect-session-replay] Failed to read the provided session log file.');
  };
  reader.readAsText(file);
}

function ensureReplayInput() {
  if (replayInputAttached || typeof document === 'undefined') {
    return;
  }
  replayInputAttached = true;
  const replayInput = document.createElement('input');
  replayInput.type = 'file';
  replayInput.accept = '.json';
  replayInput.style.position = 'fixed';
  replayInput.style.bottom = '10px';
  replayInput.style.left = '10px';
  replayInput.style.zIndex = 9999;
  replayInput.dataset.hallucinationReplay = '1';
  document.body.appendChild(replayInput);
  replayInput.addEventListener('change', (event) => {
    const [file] = event.target?.files ?? [];
    if (file) {
      importSessionLogFromFile(file);
    }
    event.target.value = '';
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', ensureReplayInput, { once: true });
}

if (typeof window !== 'undefined') {
  window.replayEffectSession = replaySession;
  window.importEffectSessionLogFromFile = importSessionLogFromFile;
}
