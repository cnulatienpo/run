'use strict';

const statusEl = document.getElementById('status');
const stepsEl = document.getElementById('steps');
const lastUpdateEl = document.getElementById('last-update');

const versionSpans = {
  electron: document.getElementById('version-electron'),
  node: document.getElementById('version-node'),
  chrome: document.getElementById('version-chromium'),
};

const RETRY_DELAY_MS = 4000;
let reconnectTimer;
let socket;

function setStatus(message, stateClass) {
  const classList = statusEl.className
    .split(' ')
    .filter((className) => !className.startsWith('status--'));
  classList.push(`status--${stateClass}`);
  statusEl.className = classList.join(' ');
  statusEl.textContent = message;
}

function updateVersions() {
  const versions = window.electronInfo?.versions ?? {};
  Object.entries(versionSpans).forEach(([key, element]) => {
    if (!element) return;
    const value = versions[key] ?? 'unknown';
    element.textContent = value;
  });
}

function updateStepsDisplay(stepCount) {
  stepsEl.textContent = stepCount.toLocaleString();
  const now = new Date();
  lastUpdateEl.textContent = `Last update: ${now.toLocaleTimeString()} (${stepCount} steps)`;
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    connectToServer();
  }, RETRY_DELAY_MS);
}

function connectToServer() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }

  try {
    socket = new WebSocket('ws://localhost:6789');
  } catch (error) {
    console.error('Unable to create WebSocket:', error);
    setStatus('Unable to initialise WebSocket. Retrying…', 'error');
    scheduleReconnect();
    return;
  }

  setStatus('Connecting to the fake step server…', 'connecting');

  socket.addEventListener('open', () => {
    setStatus('Connected to the fake step server.', 'connected');
  });

  socket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (typeof payload.steps === 'number') {
        updateStepsDisplay(payload.steps);
      }
    } catch (error) {
      console.error('Received malformed payload:', event.data, error);
      setStatus('Received malformed data. Waiting for the next update…', 'error');
    }
  });

  socket.addEventListener('close', () => {
    socket = undefined;
    setStatus('Connection closed. Attempting to reconnect…', 'reconnecting');
    scheduleReconnect();
  });

  socket.addEventListener('error', (event) => {
    console.error('WebSocket error', event);
    socket = undefined;
    setStatus('Connection error. Retrying…', 'error');
    scheduleReconnect();
  });
}

updateVersions();
connectToServer();
