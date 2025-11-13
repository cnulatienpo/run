const WS_URL = globalThis.RTW_WS_URL || 'ws://localhost:6789';
let socket;
let reconnectTimer;
const RETRY_DELAY_MS = 4000;
let onStepUpdateCallback;
let onStatusChangeCallback;
let onHeartRateUpdateCallback;

export function connectToStepServer(onStepUpdate, onStatusChange, onHeartRateUpdate) {
  onStepUpdateCallback = onStepUpdate;
  onStatusChangeCallback = onStatusChange;
  onHeartRateUpdateCallback = onHeartRateUpdate;

  if (socket && socket.readyState === WebSocket.OPEN) return;

  updateStatus('Connecting...', '#FFA500');

  try {
    socket = new WebSocket(WS_URL);
  } catch (err) {
    console.error('[WS] Error creating socket:', err);
    updateStatus('Connection Failed', '#F44336');
    scheduleReconnect();
    return;
  }

  socket.addEventListener('open', () => {
    console.log('[WS] Connected to step server');
    updateStatus('Connected', '#4CAF50');
  });

  socket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.steps !== undefined && onStepUpdateCallback) {
        onStepUpdateCallback(payload.steps);
      }
      if (payload.bpm !== undefined && onHeartRateUpdateCallback) {
        onHeartRateUpdateCallback(payload.bpm);
      }
    } catch (err) {
      console.error('[WS] Bad payload:', event.data, err);
    }
  });

  socket.addEventListener('close', () => {
    console.warn('[WS] Disconnected');
    updateStatus('Disconnected', '#FF9800');
    scheduleReconnect();
    socket = undefined;
  });

  socket.addEventListener('error', (err) => {
    console.error('[WS] Socket error:', err);
    updateStatus('Connection Error', '#F44336');
    scheduleReconnect();
    socket = undefined;
  });
}

function updateStatus(text, color) {
  if (onStatusChangeCallback) {
    onStatusChangeCallback(text, color);
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connectToStepServer(
      onStepUpdateCallback,
      onStatusChangeCallback,
      onHeartRateUpdateCallback,
    );
  }, RETRY_DELAY_MS);
}