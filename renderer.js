import { WS_URL } from './renderer/config.js';
import { initialiseHud } from './renderer/hud.js';
import { createNetworkClient } from './renderer/network.js';
import { createEffectSpawner } from './renderer/spawn.js';

const sessionLog = [];
let previousStepCount = 0;

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
  onStatus: (message, state) => hud.setStatus(message, state),
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
