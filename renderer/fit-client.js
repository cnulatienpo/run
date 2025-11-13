(() => {
  if (window.__fitClientInitialized) {
    console.warn('[fit-client] Already initialized');
    return;
  }
  window.__fitClientInitialized = true;

  const WS_URL = 'ws://localhost:6789';
  const OFFLINE_THRESHOLD_MS = 10_000;
  const RECONNECT_DELAY_MS = 3_000;
  const POLL_INTERVAL_MS = 1_000;

  const stepsElement = document.getElementById('hud-steps');
  const bpmElement = document.getElementById('hud-bpm');
  const offlineBadge = document.getElementById('hud-offline-badge');

  let socket;
  let reconnectTimer;
  let lastPayloadTimestamp = 0;
  const scriptStartTimestamp = Date.now();

  function showOfflineBadge() {
    if (offlineBadge) {
      offlineBadge.hidden = false;
    }
  }

  function hideOfflineBadge() {
    if (offlineBadge) {
      offlineBadge.hidden = true;
    }
  }

  function scheduleOfflineCheck() {
    const existingInterval = window.__fitClientOfflineInterval;
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    window.__fitClientOfflineInterval = setInterval(() => {
      const now = Date.now();
      if (lastPayloadTimestamp === 0) {
        if (now - scriptStartTimestamp > OFFLINE_THRESHOLD_MS) {
          showOfflineBadge();
        }
        return;
      }

      if (now - lastPayloadTimestamp > OFFLINE_THRESHOLD_MS) {
        showOfflineBadge();
      }
    }, POLL_INTERVAL_MS);
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, RECONNECT_DELAY_MS);
  }

  function handleMessage(event) {
    lastPayloadTimestamp = Date.now();
    hideOfflineBadge();

    try {
      const payload = JSON.parse(event.data);
      if (typeof payload.steps === 'number' && stepsElement) {
        stepsElement.textContent = payload.steps;
      }
      if (typeof payload.bpm === 'number' && bpmElement) {
        bpmElement.textContent = payload.bpm;
      }
    } catch (error) {
      console.error('[fit-client] Failed to parse payload', error, event.data);
    }
  }

  function connect() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      socket = new WebSocket(WS_URL);
    } catch (error) {
      console.error('[fit-client] Failed to create socket', error);
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      console.log('[fit-client] Connected to wearable bridge');
    });

    socket.addEventListener('message', handleMessage);

    socket.addEventListener('close', () => {
      console.warn('[fit-client] Connection closed');
      scheduleReconnect();
    });

    socket.addEventListener('error', (error) => {
      console.error('[fit-client] Socket error', error);
      try {
        socket.close();
      } catch (closeError) {
        console.error('[fit-client] Failed to close socket after error', closeError);
      }
      scheduleReconnect();
    });
  }

  scheduleOfflineCheck();
  connect();
})();
