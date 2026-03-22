// storage.js — Persist vanishing-point data to localStorage.

const PREFIX = 'vp:';

/** @param {string} src @returns {string} */
function makeKey(src) {
  return PREFIX + src;
}

/**
 * Save a sorted array of {t, x, y} points for a clip.
 *
 * @param {string} src   — clip storage key (URL, filename, or any stable string)
 * @param {{ t: number, x: number, y: number }[]} points
 */
export function savePoints(src, points) {
  try {
    localStorage.setItem(makeKey(src), JSON.stringify({ src, points }));
  } catch (err) {
    console.warn('[vp:storage] save failed:', err);
  }
}

/**
 * Load saved points for a clip.
 * Returns null when nothing is stored.
 *
 * @param {string} src
 * @returns {{ src: string, points: { t: number, x: number, y: number }[] } | null}
 */
export function loadPoints(src) {
  try {
    const raw = localStorage.getItem(makeKey(src));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Basic validation.
    if (!Array.isArray(parsed.points)) return null;
    return parsed;
  } catch (err) {
    console.warn('[vp:storage] load failed:', err);
    return null;
  }
}

/**
 * Delete saved points for a clip.
 *
 * @param {string} src
 */
export function clearPoints(src) {
  localStorage.removeItem(makeKey(src));
}

/**
 * Return all storage keys that have vanishing-point data.
 * @returns {string[]}
 */
export function listKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) {
      keys.push(k.slice(PREFIX.length));
    }
  }
  return keys;
}
