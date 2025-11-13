const RECONNECT_DELAY_MS = 4000;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function createNetworkClient({ url, onStatus, onStepData }) {
  let socket;
  let reconnectTimer;
  const boundListeners = new Map();

  function clearReconnectTimer() {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  }

  function scheduleReconnect() {
    clearReconnectTimer();
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, RECONNECT_DELAY_MS);
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

  function bindListener(type, handler) {
    if (!socket) {
      return;
    }
    socket.addEventListener(type, handler);
    boundListeners.set(type, handler);
  }

  function connect() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      return;
    }

    const targetUrl = isNonEmptyString(url) ? url : 'ws://localhost:6789';

    try {
      socket = new WebSocket(targetUrl);
    } catch (error) {
      console.error('[network] WebSocket creation failed:', error);
      onStatus?.(`Unable to open ${targetUrl}`, 'error');
      scheduleReconnect();
      return;
    }

    onStatus?.(`Connecting to ${targetUrl}…`, 'connecting');

    bindListener('open', () => {
      onStatus?.(`Connected to ${targetUrl}`, 'connected');
    });

    bindListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        onStepData?.(payload);
      } catch (error) {
        console.error('[network] Malformed WebSocket data:', event.data, error);
        onStatus?.('Received malformed data – waiting for next update', 'error');
      }
    });

    bindListener('close', () => {
      teardownSocket();
      onStatus?.('Connection closed. Reconnecting…', 'reconnecting');
      scheduleReconnect();
    });

    bindListener('error', (event) => {
      console.error('[network] WebSocket error:', event);
      teardownSocket();
      onStatus?.('Connection error. Retrying…', 'error');
      scheduleReconnect();
    });
  }

  connect();

  return {
    reconnect: connect,
    dispose() {
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
