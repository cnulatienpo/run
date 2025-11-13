import { start } from './spawnLoop.js';
import { startTimer } from './timer.js';
import { initTags } from './tagManager.js';
import { setTag } from './spawnLoop.js';
import { connectToStepServer } from './ws-client.js';

initTags(setTag);
startTimer();
start();

// Connect to WebSocket step server
const stepCountElement = document.getElementById('step-count');
const wsStatusElement = document.getElementById('ws-status');

connectToStepServer(
  (stepCount) => {
    if (stepCountElement) {
      stepCountElement.textContent = stepCount;
    }
  },
  (statusText, color) => {
    if (wsStatusElement) {
      wsStatusElement.textContent = statusText;
      wsStatusElement.style.color = color;
    }
  }
);
