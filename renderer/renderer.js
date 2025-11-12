let stepCount = 0;
const stepDiv = document.getElementById('step-count');

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

const wsUrl = resolveWsUrl();
let socket;

try {
  socket = new WebSocket(wsUrl);
} catch (error) {
  console.error('[WS] Unable to create WebSocket', error);
}

if (!isNonEmptyString(window?.RTW_WS_URL)) {
  console.warn('[WS] Using fallback WebSocket URL', wsUrl);
}

if (socket) {
  socket.onopen = () => console.log('[WS] Connected to', wsUrl);

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.steps !== undefined) {
        stepCount = data.steps;
        stepDiv.textContent = `Steps: ${stepCount}`;
      }
    } catch (error) {
      console.error('[WS] Failed to parse message', error);
    }
  };
  socket.onerror = (error) => console.error('[WS] Error', error);
  socket.onclose = () => console.warn('[WS] Disconnected');
}
