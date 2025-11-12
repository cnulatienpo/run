let stepCount = 0;
const stepDiv = document.getElementById('step-count');
let socket = new WebSocket('ws://localhost:6789');

socket.onopen = () => console.log('[WS] Connected');
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
