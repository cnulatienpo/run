import './ui/app-shell.js';

/**
 * ------------------------------------------------------------
 * SERVICE WORKER NOTES:
 * ------------------------------------------------------------
 * rv-app registers a service worker (sw.js).
 *
 * Effects:
 *   - Assets in public/build/ may be cached by the browser.
 *   - When hosting /rv via Express, cached SW versions may
 *     cause old UI to appear unless SW is updated or cleared.
 *
 * Dev Notes:
 *   - SW is optional; can be disabled during development.
 *   - Use DevTools → Application → Service Workers → Unregister
 *     to clear stale caches.
 * ------------------------------------------------------------
 */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.error('SW register failed', err));
}

declare global {
  interface Window {
    rvAppReady?: boolean;
  }
}

window.rvAppReady = true;
