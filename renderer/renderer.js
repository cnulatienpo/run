const hud = {
  connectionStatus: document.getElementById('connection-status'),
  sessionTimer: document.getElementById('session-timer'),
  moodSelect: document.getElementById('mood-select'),
  tagButtons: document.querySelectorAll('.tag-button'),
  packSelect: document.getElementById('pack-select'),
  stepCount: document.getElementById('step-count'),
  bpm: document.getElementById('bpm-display'),
  energy: document.getElementById('energy-display'),
  audioStatus: document.getElementById('audio-status'),
  inputSource: document.getElementById('input-source'),
  startButton: document.getElementById('start-session'),
  resetButton: document.getElementById('reset-session'),
};

const CONNECTION_STATES = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
};

const state = {
  connection: CONNECTION_STATES.CONNECTING,
  sessionStart: Date.now(),
  sessionRunning: true,
  stepCount: 0,
  bpm: 0,
  energy: 0,
  audioStatus: 'Muted',
  tags: new Set(),
  lastSocketPayloadAt: 0,
};

const CONNECT_TIMEOUT_MS = 5000;
const SIMULATION_STEP_INTERVAL_MS = 1750;
const SIMULATION_BPM_INTERVAL_MS = 2200;
const SIMULATION_ENERGY_INTERVAL_MS = 3200;
const SOCKET_STALE_THRESHOLD_MS = 6000;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveWsUrl() {
  if (typeof window !== 'undefined' && isNonEmptyString(window.RTW_WS_URL)) {
    return window.RTW_WS_URL.trim();
  }

  if (typeof globalThis !== 'undefined' && isNonEmptyString(globalThis.RTW_WS_URL)) {
    return globalThis.RTW_WS_URL.trim();
  }

  return 'ws://localhost:6789';
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function applyConnectionClass(status) {
  const element = hud.connectionStatus;
  element.classList.remove('status-connecting', 'status-connected', 'status-disconnected');

  switch (status) {
    case CONNECTION_STATES.CONNECTED:
      element.classList.add('status-connected');
      element.textContent = 'Live';
      break;
    case CONNECTION_STATES.DISCONNECTED:
      element.classList.add('status-disconnected');
      element.textContent = 'Disconnected';
      break;
    case CONNECTION_STATES.CONNECTING:
    default:
      element.classList.add('status-connecting');
      element.textContent = 'Connecting…';
      break;
  }
}

function updateConnectionStatus(status) {
  if (state.connection === status) return;
  state.connection = status;
  applyConnectionClass(status);
}

function updateSessionTimer() {
  if (!state.sessionRunning) return;
  const elapsed = Date.now() - state.sessionStart;
  hud.sessionTimer.textContent = formatDuration(elapsed);
}

function updateMetricsFromState() {
  hud.stepCount.textContent = state.stepCount.toLocaleString();
  hud.bpm.textContent = Math.round(state.bpm).toString();
  hud.energy.textContent = `${Math.round(state.energy)}%`;
  hud.audioStatus.textContent = state.audioStatus;
}

function scheduleSimulation() {
  setInterval(() => {
    const now = Date.now();
    const isSocketFresh = now - state.lastSocketPayloadAt < SOCKET_STALE_THRESHOLD_MS;
    if (state.connection === CONNECTION_STATES.CONNECTED && isSocketFresh) {
      return;
    }

    state.stepCount += Math.floor(Math.random() * 12) + 4;
    updateMetricsFromState();
  }, SIMULATION_STEP_INTERVAL_MS);

  setInterval(() => {
    const now = Date.now();
    const isSocketFresh = now - state.lastSocketPayloadAt < SOCKET_STALE_THRESHOLD_MS;
    if (state.connection === CONNECTION_STATES.CONNECTED && isSocketFresh) {
      return;
    }

    state.bpm = Math.round(110 + Math.random() * 35);
    updateMetricsFromState();
  }, SIMULATION_BPM_INTERVAL_MS);

  setInterval(() => {
    const now = Date.now();
    const isSocketFresh = now - state.lastSocketPayloadAt < SOCKET_STALE_THRESHOLD_MS;
    if (state.connection === CONNECTION_STATES.CONNECTED && isSocketFresh) {
      return;
    }

    const direction = Math.random() > 0.5 ? 1 : -1;
    const nextEnergy = Math.min(100, Math.max(0, state.energy + direction * (Math.random() * 8)));
    state.energy = nextEnergy;
    updateMetricsFromState();
  }, SIMULATION_ENERGY_INTERVAL_MS);
}

function handleSocketMessage(event) {
  try {
    const payload = JSON.parse(event.data);
    state.lastSocketPayloadAt = Date.now();

    if (Number.isFinite(payload.steps)) {
      state.stepCount = payload.steps;
    }

    if (Number.isFinite(payload.bpm)) {
      state.bpm = payload.bpm;
    }

    if (Number.isFinite(payload.energy)) {
      state.energy = payload.energy;
    }

    if (isNonEmptyString(payload.audioStatus)) {
      state.audioStatus = payload.audioStatus;
    }

    if (isNonEmptyString(payload.inputSource)) {
      hud.inputSource.textContent = payload.inputSource;
    }

    if (isNonEmptyString(payload.mood)) {
      hud.moodSelect.value = payload.mood;
      // TODO: onMoodChange(payload.mood);
    }

    if (Array.isArray(payload.tags)) {
      const normalized = new Set(payload.tags.map(String));
      state.tags = normalized;
      hud.tagButtons.forEach((button) => {
        const tag = button.dataset.tag;
        const isActive = normalized.has(tag);
        button.classList.toggle('is-active', isActive);
      });
      // TODO: syncTagsWithExperience(Array.from(normalized));
    }

    if (isNonEmptyString(payload.pack)) {
      hud.packSelect.value = payload.pack;
      // TODO: loadAssetPack(payload.pack);
    }

    updateMetricsFromState();
  } catch (error) {
    console.error('[WS] Failed to parse message', error);
  }
}

function bootstrapWebSocket() {
  const wsUrl = resolveWsUrl();
  let socket;

  try {
    socket = new WebSocket(wsUrl);
  } catch (error) {
    console.error('[WS] Unable to create WebSocket', error);
    updateConnectionStatus(CONNECTION_STATES.DISCONNECTED);
    return null;
  }

  if (!isNonEmptyString(window?.RTW_WS_URL)) {
    console.warn('[WS] Using fallback WebSocket URL', wsUrl);
  }

  const timeout = setTimeout(() => {
    if (state.connection !== CONNECTION_STATES.CONNECTED) {
      updateConnectionStatus(CONNECTION_STATES.DISCONNECTED);
      hud.connectionStatus.textContent = 'Disconnected';
    }
  }, CONNECT_TIMEOUT_MS);

  socket.addEventListener('open', () => {
    clearTimeout(timeout);
    updateConnectionStatus(CONNECTION_STATES.CONNECTED);
    console.info('[WS] Connected to', wsUrl);
  });

  socket.addEventListener('message', handleSocketMessage);

  socket.addEventListener('error', (error) => {
    console.error('[WS] Error', error);
  });

  socket.addEventListener('close', () => {
    updateConnectionStatus(CONNECTION_STATES.DISCONNECTED);
    console.warn('[WS] Disconnected');
    // TODO: Implement exponential backoff reconnect.
  });

  return socket;
}

function toggleTag(button) {
  const tag = button.dataset.tag;
  if (!tag) return;

  if (state.tags.has(tag)) {
    state.tags.delete(tag);
  } else {
    state.tags.add(tag);
  }

  button.classList.toggle('is-active');
  // TODO: emitTagSelection(Array.from(state.tags));
}

function setupInteractions() {
  hud.moodSelect.addEventListener('change', () => {
    const mood = hud.moodSelect.value;
    console.info('[HUD] Mood changed to', mood);
    // TODO: onMoodChange(mood);
  });

  hud.tagButtons.forEach((button) => {
    button.addEventListener('click', () => toggleTag(button));
  });

  hud.packSelect.addEventListener('change', () => {
    const pack = hud.packSelect.value;
    console.info('[HUD] Pack changed to', pack);
    // TODO: loadAssetPack(pack);
  });

  hud.startButton.addEventListener('click', () => {
    state.sessionStart = Date.now();
    state.sessionRunning = true;
    state.stepCount = 0;
    updateMetricsFromState();
    hud.sessionTimer.textContent = '00:00';
    hud.startButton.disabled = true;
    // TODO: triggerSessionStart();
  });

  hud.resetButton.addEventListener('click', () => {
    state.sessionRunning = false;
    state.stepCount = 0;
    state.bpm = 0;
    state.energy = 0;
    state.audioStatus = 'Muted';
    updateMetricsFromState();
    hud.sessionTimer.textContent = '00:00';
    hud.startButton.disabled = false;
    // TODO: triggerSessionReset();
  });
}

function init() {
  applyConnectionClass(CONNECTION_STATES.CONNECTING);
  updateMetricsFromState();
  setupInteractions();
  scheduleSimulation();

  const sessionInterval = setInterval(() => {
    updateSessionTimer();
  }, 1000);

  // TODO: store interval handles if we need to pause/resume later.
  void sessionInterval;

  const socket = bootstrapWebSocket();
  if (!socket) {
    updateConnectionStatus(CONNECTION_STATES.DISCONNECTED);
    hud.connectionStatus.textContent = 'Disconnected';
  }
}

init();
