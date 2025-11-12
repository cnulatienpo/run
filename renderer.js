import { WS_URL } from './renderer/config.js';
import { initialiseHud } from './renderer/hud.js';
import { createNetworkClient } from './renderer/network.js';
import { createEffectSpawner } from './renderer/spawn.js';

const sessionLog = [];
let previousStepCount = 0;

function initOverlayHUD() {
  const existingHud = document.getElementById('overlay-hud');
  const hud = existingHud || document.createElement('div');
  hud.id = 'overlay-hud';
  hud.style.position = 'fixed';
  hud.style.top = '12px';
  hud.style.left = '12px';
  hud.style.zIndex = '99999';
  hud.style.padding = '10px 14px';
  hud.style.background = 'rgba(0, 0, 0, 0.7)';
  hud.style.color = '#eee';
  hud.style.fontFamily = 'system-ui, sans-serif';
  hud.style.borderRadius = '8px';
  hud.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';

  if (!existingHud) {
    const timer = document.createElement('div');
    timer.id = 'session-timer';
    timer.textContent = 'Session: 0:00';
    timer.style.fontSize = '16px';
    hud.appendChild(timer);

    const status = document.createElement('div');
    status.id = 'connection-status';
    status.textContent = 'Connecting…';
    status.style.fontSize = '14px';
    status.style.marginTop = '6px';
    hud.appendChild(status);

    document.body.appendChild(hud);
  }
}

const sessionStart = Date.now();

function updateTimer() {
  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const text = `Session: ${minutes}:${seconds.toString().padStart(2, '0')}`;
  const element = document.getElementById('session-timer');
  if (element) {
    element.textContent = text;
  }
}

function updateConnectionStatus(text, state = 'neutral') {
  const element = document.getElementById('connection-status');
  if (!element) {
    return;
  }

  element.textContent = text;
  element.style.color =
    state === 'ok'
      ? '#22c55e'
      : state === 'error'
      ? '#f87171'
      : state === 'reconnecting'
      ? '#facc15'
      : '#eee';
}

initOverlayHUD();
updateTimer();
window.setInterval(updateTimer, 1000);

const hud = initialiseHud({ sessionLog });
const canvas = document.getElementById('fx-canvas');
const spawner = createEffectSpawner({
  canvas,
  onEffect(effectName, context) {
    sessionLog.push({
      timestamp: new Date().toISOString(),
      steps: hud.getLastStepCount(),
      effect: effectName,
      mood: context?.mood,
      zone: context?.zone,
    });
  },
});

hud.updateVersions(window.electronInfo?.versions ?? {});
const assetPackPromise = hud.loadAssetPacks?.();
if (assetPackPromise?.catch) {
  assetPackPromise.catch((error) => {
    console.warn('[renderer] Unable to load asset packs:', error);
  });
}

const network = createNetworkClient({
  url: WS_URL,
  onStatus: (message, state) => {
    hud.setStatus(message, state);
    if (state === 'connected') {
      updateConnectionStatus('Connected', 'ok');
    } else if (state === 'reconnecting') {
      updateConnectionStatus('Reconnecting', 'reconnecting');
    } else if (state === 'connecting') {
      updateConnectionStatus('Connecting…');
    } else {
      updateConnectionStatus('Disconnected', 'error');
    }
  },
  onStepData: (payload) => {
    if (typeof payload.steps === 'number') {
      const stepCount = payload.steps;
      hud.updateSteps(stepCount);
      sessionLog.push({
        timestamp: new Date().toISOString(),
        steps: stepCount,
      });
      const stepDelta = Math.max(0, stepCount - previousStepCount);
      const iterations = stepDelta > 0 ? Math.min(stepDelta, 10) : 0;
      for (let i = 0; i < iterations; i += 1) {
        spawner.trigger({
          mood: hud.getMood(),
          stepCount,
        });
      }
      previousStepCount = stepCount;
    }

    if (typeof payload.bpm === 'number') {
      sessionLog.push({
        timestamp: new Date().toISOString(),
        steps: hud.getLastStepCount(),
        bpm: payload.bpm,
      });
    }

    if (typeof payload.playlist === 'string') {
      sessionLog.push({
        timestamp: new Date().toISOString(),
        steps: hud.getLastStepCount(),
        tag: 'playlist-update',
        playlist: payload.playlist,
      });
    }
  },
});

function downloadSessionLog() {
  const fileName = `session-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const blob = new Blob([JSON.stringify(sessionLog, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'l') {
    const target = event.target;
    if (
      target &&
      ((target.tagName === 'INPUT' && target.type !== 'checkbox' && target.type !== 'radio') ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }
    downloadSessionLog();
  }
});

window.addEventListener('beforeunload', () => {
  network.dispose?.();
  spawner.clear?.();
});
