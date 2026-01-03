export function startTimer(timeEl = document.getElementById('session-time')) {
  if (!timeEl) {
    return;
  }

  let startTime = Date.now();
  setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}
