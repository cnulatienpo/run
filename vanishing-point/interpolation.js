// interpolation.js — Smoothing, linear interpolation, and the public API.

import { loadPoints } from './storage.js';

// ---------------------------------------------------------------------------
// Smoothing
// ---------------------------------------------------------------------------

/**
 * Apply a simple moving-average to an array of {t, x, y} points.
 * The timestamp of each point is preserved; only x and y are averaged.
 *
 * @param {{ t: number, x: number, y: number }[]} points
 * @param {number} [windowSize=4]   — number of neighbours (each side) in average
 * @returns {{ t: number, x: number, y: number }[]}
 */
export function smooth(points, windowSize = 4) {
  if (points.length < 2) return points.slice();
  const half = Math.floor(windowSize / 2);

  return points.map((pt, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(points.length - 1, i + half);
    let sx = 0, sy = 0;
    const n = hi - lo + 1;
    for (let j = lo; j <= hi; j++) {
      sx += points[j].x;
      sy += points[j].y;
    }
    return { t: pt.t, x: sx / n, y: sy / n };
  });
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/**
 * Linear interpolation between two {t,x,y} points at time `t`.
 * @private
 */
function lerp(a, b, t) {
  const alpha = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return {
    x: a.x + (b.x - a.x) * alpha,
    y: a.y + (b.y - a.y) * alpha,
  };
}

/**
 * Find the interpolated position in a *sorted* points array at time `t`.
 * Clamps to the first/last point outside the recorded range.
 *
 * @param {{ t: number, x: number, y: number }[]} points  — sorted ascending by t
 * @param {number} t
 * @returns {{ x: number, y: number }}
 */
export function interpolate(points, t) {
  if (!points || points.length === 0) return { x: 0.5, y: 0.5 };

  // Clamp to edges.
  if (t <= points[0].t) return { x: points[0].x, y: points[0].y };
  const last = points[points.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y };

  // Binary search for the surrounding pair.
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }

  return lerp(points[lo], points[hi], t);
}

// ---------------------------------------------------------------------------
// Public integration API
// ---------------------------------------------------------------------------

/**
 * Get the vanishing-point position for clip `src` at `time` seconds.
 *
 * Returns { x: 0.5, y: 0.5 } when no recorded data exists for the clip.
 * Coordinates are normalised 0–1 relative to the video frame.
 *
 * @param {string} src   — clip storage key (same value used when recording)
 * @param {number} time  — video currentTime in seconds
 * @returns {{ x: number, y: number }}
 */
export function getVanishingPoint(src, time) {
  const data = loadPoints(src);
  if (!data || !Array.isArray(data.points) || data.points.length === 0) {
    return { x: 0.5, y: 0.5 };
  }
  return interpolate(data.points, time);
}
