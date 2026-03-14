/**
 * ============================================================
 *  EFFECTS / HARDWARE MODULE – PROJECT MAP
 * ------------------------------------------------------------
 *  Role:
 *    - Provides visual FX, audio FX, or hardware integrations
 *      used by the HUD (renderer/).
 *
 *  Used By:
 *    - renderer/renderer.js
 *    - HUD overlays (FX engine)
 *    - Hardware step bridge (step-bridge/)
 *
 *  Notes:
 *    - Module is standalone, no bundler.
 *    - Loaded directly by renderer via static scripts.
 * ============================================================
 */

// Minimal CSS-class effects applied to the overlay canvas.
// Each function adds a class briefly, then removes it.

export function softPulse(canvasEl, durationMs = 2200) {
  canvasEl.classList.add('fx-softPulse');
  setTimeout(() => canvasEl.classList.remove('fx-softPulse'), durationMs);
}

export function scanline(canvasEl, durationMs = 1600) {
  canvasEl.classList.add('fx-scanline');
  setTimeout(() => canvasEl.classList.remove('fx-scanline'), durationMs);
}

// Optional zone clip using CSS clip-path; expand later with more zones.
export function withZoneClip(canvasEl, zone = 'center') {
  const zoneMap = {
    topLeft: 'polygon(0% 0%, 50% 0%, 50% 50%, 0% 50%)',
    center: 'polygon(25% 25%, 75% 25%, 75% 75%, 25% 75%)',
    bottom: 'polygon(0% 60%, 100% 60%, 100% 100%, 0% 100%)'
  };
  const clip = zoneMap[zone] || zoneMap.center;
  canvasEl.style.clipPath = clip;
  return () => { canvasEl.style.clipPath = ''; };
}
