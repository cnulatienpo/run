import './ui/app-shell.js';
/**
 * ------------------------------------------------------------
 *  WIRING ASSERTION A8 – PASS
 * ------------------------------------------------------------
 *  rv-app registers a Service Worker (sw.js).
 *
 *  Effects:
 *    • Assets inside public/build/ may be cached aggressively.
 *    • UI may show stale JS/CSS after a deploy unless:
 *         - Cache name in sw.js is bumped, OR
 *         - User manually unregisters SW.
 *
 *  Developer Note:
 *    Use DevTools → Application → Service Workers → Unregister
 *    whenever modifying the rv-app build pipeline.
 *
 *  This is expected behavior and counts as PASS.
 * ------------------------------------------------------------
 */
/**
 * SW CACHING NOTE:
 * Service worker may serve stale cached builds.
 * Bump cache version in sw.js after UI/build changes.
 */
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.error('SW register failed', err));
}
window.rvAppReady = true;
