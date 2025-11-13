const WS_URL = globalThis.RTW_WS_URL || 'ws://localhost:6789';
let socket;
let reconnectTimer;
const RETRY_DELAY_MS = 4000;
let onStepUpdateCallback;
let onStatusChangeCallback;

export function connectToStepServer(onStepUpdate, onStatusChange) {
  onStepUpdateCallback = onStepUpdate;
  onStatusChangeCallback = onStatusChange;
  
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
      if (typeof payload.steps === 'number') {
        onStepUpdateCallback(payload.steps);
      }
    } catch (err) {
      console.error('[WS] Bad payload:', event.data, err);
    }
  });

  socket.addEventListener('close', () => {
    console.warn('[WS] Disconnected');
    updateStatus('Disconnected', '#FF9800');
    scheduleReconnect();
  });

  socket.addEventListener('error', (err) => {
    console.error('[WS] Socket error:', err);
    updateStatus('Connection Error', '#F44336');
    scheduleReconnect();
  });
}

function updateStatus(text, color) {
  if (onStatusChangeCallback) {
    onStatusChangeCallback(text, color);
  }
}

function scheduleReconnect(onStepUpdate) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connectToStepServer(onStepUpdate);
  }, RETRY_DELAY_MS);
}