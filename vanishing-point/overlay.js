// overlay.js — Draw the vanishing-point dot on a canvas over the video.

import { interpolate }       from './interpolation.js';
import { loadPoints }        from './storage.js';
import { getVideoFrameRect } from './utils.js';

export class Overlay {
  /**
   * @param {HTMLCanvasElement} canvas
   *   Positioned absolutely over the video element, pointer-events: none.
   * @param {HTMLVideoElement} video
   */
  constructor(canvas, video) {
    this._canvas = canvas;
    this._video  = video;
    this._ctx    = canvas.getContext('2d');

    /** @type {import('./recorder.js').Recorder | null} */
    this._recorder = null;

    /** Cached points for the currently loaded clip. */
    this._points = null;

    this._rafId = 0;
    this._loop  = this._loop.bind(this);
    this._rafId = requestAnimationFrame(this._loop);
  }

  // --------------------------------------------------------------------------
  // Public
  // --------------------------------------------------------------------------

  /** @param {import('./recorder.js').Recorder} recorder */
  setRecorder(recorder) {
    this._recorder = recorder;
  }

  /**
   * Reload saved points for the currently loaded clip.
   * Call this after:
   *   - a new video src is assigned
   *   - a recording session finishes
   *   - data is manually cleared
   */
  reloadPoints() {
    const key =
      this._video.dataset.storageKey ||
      this._video.currentSrc         ||
      this._video.src                ||
      '';
    const data = key ? loadPoints(key) : null;
    this._points = data ? data.points : null;
  }

  destroy() {
    cancelAnimationFrame(this._rafId);
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  _loop() {
    this._rafId = requestAnimationFrame(this._loop);
    this._draw();
  }

  _draw() {
    const { _canvas: canvas, _video: video, _ctx: ctx } = this;

    // Keep canvas pixel dimensions synced to its CSS size.
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width  = cw;
      canvas.height = ch;
    }

    ctx.clearRect(0, 0, cw, ch);

    const rec   = this._recorder;
    const frame = getVideoFrameRect(video);

    let nx, ny, color, pulsing;

    if (rec && rec.isRecording && rec.currentMouse) {
      // ── Active recording: follow the live mouse. ──────────────────────────
      nx      = rec.currentMouse.x;
      ny      = rec.currentMouse.y;
      color   = '#ff2244';
      pulsing = true;

    } else if (this._points && this._points.length > 0) {
      // ── Playback / scrub: interpolate from saved data. ────────────────────
      const pos = interpolate(this._points, video.currentTime);
      nx      = pos.x;
      ny      = pos.y;
      color   = video.paused ? 'rgba(0,255,170,0.55)' : '#00ffaa';
      pulsing = false;

    } else {
      // No data — nothing to draw.
      return;
    }

    // Convert normalised coords to canvas pixels within the letterboxed frame.
    const px = frame.x + nx * frame.w;
    const py = frame.y + ny * frame.h;

    this._drawDot(ctx, px, py, color, pulsing);
  }

  /**
   * Draw a crosshair dot with an optional pulsing ring.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x         canvas-pixel X
   * @param {number} y         canvas-pixel Y
   * @param {string} color     fill colour
   * @param {boolean} pulsing  animate outer ring
   */
  _drawDot(ctx, x, y, color, pulsing) {
    const r   = 13;   // main dot radius
    const gap = r + 4; // gap between dot edge and crosshair arm start
    const arm = 10;   // crosshair arm length

    // ── Pulsing outer ring (record mode). ─────────────────────────────────
    if (pulsing) {
      const pulse = 1 + 0.25 * Math.sin(Date.now() * 0.008);
      ctx.beginPath();
      ctx.arc(x, y, (r + 10) * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = color + '55';
      ctx.lineWidth   = 2.5;
      ctx.stroke();
    }

    // ── Drop shadow. ──────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();

    // ── Coloured main dot. ────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // ── White centre dot. ─────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // ── Crosshair arms (4 segments outside the dot radius). ───────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.82)';
    ctx.lineWidth   = 1.5;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    //  ←
    ctx.moveTo(x - gap - arm, y); ctx.lineTo(x - gap, y);
    //  →
    ctx.moveTo(x + gap, y);       ctx.lineTo(x + gap + arm, y);
    //  ↑
    ctx.moveTo(x, y - gap - arm); ctx.lineTo(x, y - gap);
    //  ↓
    ctx.moveTo(x, y + gap);       ctx.lineTo(x, y + gap + arm);
    ctx.stroke();
  }
}
