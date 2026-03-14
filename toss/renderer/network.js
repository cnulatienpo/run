// Centralised WebSocket client used across the renderer.
// Handles reconnection/backoff and notifies consumers via the supplied callbacks.
export const RECONNECT_DELAY_MS = 4000;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function createNetworkClient({ url, onStatus, onStepData } = {}) {
  let socket;
  let reconnectTimer;
  let disposed = false;
  const boundListeners = new Map();

  const targetUrl = isNonEmptyString(url) ? url.trim() : 'ws://localhost:6789';

  function notifyStatus(message, state) {
    if (typeof onStatus === 'function') {
      onStatus(message, state);
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  }

  function removeBoundListeners() {
    if (!socket || boundListeners.size === 0) {
      return;
    }
    boundListeners.forEach((handler, type) => {
      socket.removeEventListener(type, handler);
    });
    boundListeners.clear();
  }

  function teardownSocket() {
    removeBoundListeners();
    socket = undefined;
  }

  function scheduleReconnect() {
    if (disposed) {
      return;
    }
    clearReconnectTimer();
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, RECONNECT_DELAY_MS);
  }

  function bindListener(type, handler) {
    if (!socket) {
      return;
    }
    socket.addEventListener(type, handler);
    boundListeners.set(type, handler);
  }

  function connect() {
    if (disposed) {
      return;
    }

    if (
      socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      socket = new WebSocket(targetUrl);
    } catch (error) {
      console.error('[network] WebSocket creation failed:', error);
      notifyStatus(`Unable to open ${targetUrl}`, 'error');
      scheduleReconnect();
      return;
    }

    notifyStatus(`Connecting to ${targetUrl}…`, 'connecting');

    bindListener('open', () => {
      notifyStatus(`Connected to ${targetUrl}`, 'connected');
    });

    bindListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (typeof onStepData === 'function') {
          onStepData(payload);
        }
      } catch (error) {
        console.error('[network] Malformed WebSocket data:', event.data, error);
        notifyStatus('Received malformed data – waiting for next update', 'error');
      }
    });

    bindListener('close', () => {
      teardownSocket();
      notifyStatus('Connection closed. Reconnecting…', 'reconnecting');
      scheduleReconnect();
    });

    bindListener('error', (event) => {
      console.error('[network] WebSocket error:', event);
      teardownSocket();
      notifyStatus('Connection error. Retrying…', 'error');
      scheduleReconnect();
    });
  }

  connect();

  return {
    reconnect: () => {
      if (!disposed) {
        connect();
      }
    },
    dispose: () => {
      disposed = true;
      clearReconnectTimer();
      if (socket) {
        removeBoundListeners();
        try {
          socket.close();
        } catch (error) {
          console.warn('[network] Error while closing socket:', error);
        }
      }
      socket = undefined;
    },
  };
}
