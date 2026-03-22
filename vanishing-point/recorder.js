// recorder.js — Capture vanishing-point samples while the mouse is held down.

import { smooth }                from './interpolation.js';
import { savePoints, loadPoints } from './storage.js';
import { getVideoFrameRect }      from './utils.js';

/** Target capture rate. */
const SAMPLE_HZ          = 15;
const SAMPLE_INTERVAL_MS = Math.round(1000 / SAMPLE_HZ); // ~67 ms

/**
 * @typedef {{
 *   enabled:     boolean,
 *   recording:   boolean,
 *   sampleCount: number,
 *   mouse:       { x: number, y: number } | null,
 * }} RecorderState
 */

export class Recorder {
  /**
   * @param {HTMLVideoElement} video
   * @param {HTMLElement} surface
   *   The element to listen for mouse events on. Should visually cover the
   *   video element (e.g. the player wrapper div).
   * @param {{
   *   onUpdate?:   (state: RecorderState) => void,
   *   onFinalize?: (points: { t: number, x: number, y: number }[]) => void,
   * }} [options]
   */
  constructor(video, surface, options = {}) {
    this._video      = video;
    this._surface    = surface;
    this._onUpdate   = options.onUpdate   || null;
    this._onFinalize = options.onFinalize || null;

    /** Whether recording mode is armed (mousedown will start capture). */
    this._enabled  = false;
    /** Whether a capture is actively in progress. */
    this._recording = false;
    /** Raw samples collected during the current hold. */
    this._samples  = [];
    this._intervalId = 0;
    /** Last known normalised mouse position. */
    this._mouse = null;

    this._bindEvents();
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Arm or disarm recording mode.
   * Disarming mid-capture immediately finalises the current recording.
   *
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._enabled = Boolean(enabled);
    if (!this._enabled && this._recording) {
      this._stopCapture();
    }
    this._emit();
  }

  /** @returns {boolean} */
  get isEnabled()   { return this._enabled;  }
  /** @returns {boolean} */
  get isRecording() { return this._recording; }
  /** @returns {number} number of samples in the current capture */
  get sampleCount() { return this._samples.length; }
  /** @returns {{ x: number, y: number } | null} */
  get currentMouse() { return this._mouse; }

  destroy() {
    if (this._recording) this._stopCapture();
    // Note: anonymous event listeners aren't removed here.
    // If you need full teardown, refactor to use AbortController.
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  /**
   * Return the stable storage key for the current video.
   * Uses video.dataset.storageKey when set (preferred for file:// blob URLs
   * where currentSrc would be an opaque blob: URL).
   */
  _getKey() {
    return (
      this._video.dataset.storageKey ||
      this._video.currentSrc         ||
      this._video.src                ||
      ''
    );
  }

  /**
   * Convert a MouseEvent into normalised (0–1) coordinates within the
   * actual video frame, accounting for letterbox/pillarbox from
   * object-fit: contain.
   *
   * @param {MouseEvent} e
   * @returns {{ x: number, y: number }}
   */
  _normalise(e) {
    const surfaceRect = this._surface.getBoundingClientRect();
    // Mouse position relative to the surface element.
    const mx = e.clientX - surfaceRect.left;
    const my = e.clientY - surfaceRect.top;

    // Frame rect is relative to the video element's own top-left.
    // Since the video element is positioned inset:0 inside the surface,
    // this coincides with the surface's top-left — so the rect is valid here.
    const frame = getVideoFrameRect(this._video);

    return {
      x: Math.min(1, Math.max(0, (mx - frame.x) / frame.w)),
      y: Math.min(1, Math.max(0, (my - frame.y) / frame.h)),
    };
  }

  _bindEvents() {
    this._surface.addEventListener('mousedown', (e) => {
      if (!this._enabled) return;
      this._mouse = this._normalise(e);
      this._startCapture();
    });

    this._surface.addEventListener('mousemove', (e) => {
      if (!this._enabled) return;
      this._mouse = this._normalise(e);
      this._emit();
    });

    this._surface.addEventListener('mouseup', () => {
      if (this._recording) this._stopCapture();
    });

    // Cancel if mouse leaves the surface while capturing.
    this._surface.addEventListener('mouseleave', () => {
      if (this._recording) this._stopCapture();
    });
  }

  _startCapture() {
    if (this._recording) return;
    this._recording  = true;
    this._samples    = [];
    this._intervalId = window.setInterval(
      () => this._takeSample(),
      SAMPLE_INTERVAL_MS,
    );
    this._emit();
    console.log('[vp:recorder] Capture started');
  }

  _stopCapture() {
    if (!this._recording) return;
    this._recording = false;
    window.clearInterval(this._intervalId);
    this._intervalId = 0;

    const saved = this._finalise();
    if (this._onFinalize) this._onFinalize(saved);
    this._emit();
    console.log(`[vp:recorder] Capture stopped. ${saved.length} points saved.`);
  }

  _takeSample() {
    if (!this._mouse) return;
    this._samples.push({
      t: this._video.currentTime,
      x: this._mouse.x,
      y: this._mouse.y,
    });
    this._emit();
  }

  /**
   * Smooth the captured samples, merge with any existing data for the same
   * time range, and persist to storage.
   *
   * @returns {{ t: number, x: number, y: number }[]} final merged points
   */
  _finalise() {
    const key = this._getKey();
    if (!key || this._samples.length === 0) return [];

    // Smooth x/y while preserving timestamps.
    const smoothed = smooth(this._samples, 4);

    // Merge: keep existing points that fall *outside* the newly recorded range
    // so that recording a segment doesn't wipe unrelated parts of the track.
    const existing = loadPoints(key);
    let merged = smoothed;

    if (existing && existing.points.length > 0) {
      const t0 = smoothed[0].t;
      const t1 = smoothed[smoothed.length - 1].t;
      const kept = existing.points.filter((p) => p.t < t0 || p.t > t1);
      merged = [...kept, ...smoothed].sort((a, b) => a.t - b.t);
    }

    savePoints(key, merged);
    return merged;
  }

  _emit() {
    if (this._onUpdate) {
      this._onUpdate({
        enabled:     this._enabled,
        recording:   this._recording,
        sampleCount: this._samples.length,
        mouse:       this._mouse,
      });
    }
  }
}
