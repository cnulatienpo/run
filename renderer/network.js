const RETRY_DELAY_MS = 4000;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function createNetworkClient({ url, onStatus, onStepData }) {
  let socket;
  let reconnectTimer;

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
    }, RETRY_DELAY_MS);
  }

  function connect() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      return;
    }

    const targetUrl = isNonEmptyString(url) ? url : 'ws://localhost:6789';

    try {
      socket = new WebSocket(targetUrl);
    } catch (error) {
      console.error('[network] Unable to create WebSocket:', error);
      onStatus?.(`Unable to open ${targetUrl}`, 'error');
      scheduleReconnect();
      return;
    }

    onStatus?.(`Connecting to ${targetUrl}…`, 'connecting');

    socket.addEventListener('open', () => {
      onStatus?.(`Connected to ${targetUrl}`, 'connected');
    });

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        onStepData?.(payload);
      } catch (error) {
        console.error('[network] Received malformed payload:', event.data, error);
        onStatus?.('Received malformed data – waiting for the next update…', 'error');
      }
    });

    socket.addEventListener('close', () => {
      socket = undefined;
      onStatus?.('Connection closed. Attempting to reconnect…', 'reconnecting');
      scheduleReconnect();
    });

    socket.addEventListener('error', (event) => {
      console.error('[network] WebSocket error', event);
      socket = undefined;
      onStatus?.('Connection error. Retrying…', 'error');
      scheduleReconnect();
    });
  }

  connect();

  return {
    reconnect: connect,
    dispose() {
      clearReconnectTimer();
      socket?.close();
    },
  };
}
