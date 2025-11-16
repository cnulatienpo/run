import './ui/app-shell.js';
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.error('SW register failed', err));
}
window.rvAppReady = true;
