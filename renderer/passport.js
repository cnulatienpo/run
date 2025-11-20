/**
 * ============================================================
 *  HUD (renderer/) – PROJECT MAP
 * ------------------------------------------------------------
 *  Role:
 *    - This is the web-based heads-up display (HUD) shown inside Electron.
 *    - Contains YouTube controls, playlist manager, step counter,
 *      telemetry status, Google Fit integration, and passport export.
 *
 *  Structure:
 *    index.html       → Loads HUD layout + scripts
 *    renderer.js      → Main HUD logic (YouTube, Fit, playlists)
 *    passport.js      → Passport export/logic
 *    style.css        → Static HUD styling (no bundler)
 *    package.json     → HUD-specific metadata (no build step)
 *
 *  Notes:
 *    - No bundler, no Vite/Webpack. Everything is served as static files.
 *    - HUD is distinct from rv-app (learning studio).
 *    - Renderer receives data but does not compile, bundle, or transform it.
 * ============================================================
 */

/**
 * Passport storage and transformation utilities.
 *
 * This module keeps the passport JSON payload isolated from the verbose
 * session log entries. It exposes helpers to create diary-friendly stamps,
 * persist them to localStorage, and derive aggregate statistics for the UI.
 *
 * The JSDoc typedefs mirror the canonical TypeScript interfaces that the
 * product specification defines for the passport feature.
 */

/**
 * @typedef {Object} SessionLog
 * @property {string} id
 * @property {string} startedAt
 * @property {string} endedAt
 * @property {string} routeId
 * @property {string} routeLabel
 * @property {number} miles
 * @property {string} mood
 * @property {string} pack
 */

/**
 * @typedef {Object} PassportStamp
 * @property {string} stampId
 * @property {string} sessionId
 * @property {string} date
 * @property {string} startedAt
 * @property {string} endedAt
 * @property {string} routeId
 * @property {string} routeLabel
 * @property {number} miles
 * @property {string} mood
 * @property {string} pack
 * @property {string} note
 * @property {('user'|'auto')} noteSource
 * @property {string[]} emojis
 * @property {string} [thumbnailUrl]
 * @property {string} [swatchColor]
 * @property {string} createdAt
 * @property {string} [appVersion]
 */

/**
 * @typedef {Object} PassportStore
 * @property {1} version
 * @property {PassportStamp[]} stamps
 */

export const PASSPORT_STORAGE_KEY = 'rtw_passport_v1';
const DEFAULT_STORE_JSON = '{"version":1,"stamps":[]}';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (!isPlainObject(value)) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('[passport] Failed to clone value:', error);
    return value;
  }
}

function normaliseStore(rawStore) {
  const store = isPlainObject(rawStore) ? rawStore : {};
  const stamps = Array.isArray(store.stamps) ? [...store.stamps] : [];
  return { version: 1, stamps };
}

function readStoreFromLocalStorage() {
  try {
    const raw = window?.localStorage?.getItem(PASSPORT_STORAGE_KEY);
    if (!raw) {
      return normaliseStore(JSON.parse(DEFAULT_STORE_JSON));
    }
    return normaliseStore(JSON.parse(raw));
  } catch (error) {
    console.warn('[passport] Unable to read passport store:', error);
    return normaliseStore(JSON.parse(DEFAULT_STORE_JSON));
  }
}

function writeStoreToLocalStorage(store) {
  try {
    const serialised = JSON.stringify(normaliseStore(store));
    window?.localStorage?.setItem(PASSPORT_STORAGE_KEY, serialised);
    return true;
  } catch (error) {
    console.warn('[passport] Unable to persist passport store:', error);
    return false;
  }
}

let cachedStore;

export function loadPassportStore() {
  if (cachedStore) {
    return cachedStore;
  }
  cachedStore = readStoreFromLocalStorage();
  return cachedStore;
}

export function savePassportStore(store = cachedStore) {
  if (!store) {
    return false;
  }
  cachedStore = normaliseStore(store);
  return writeStoreToLocalStorage(cachedStore);
}

export function getPassportStamps() {
  return loadPassportStore().stamps;
}

export function replacePassportStamps(stamps) {
  const store = loadPassportStore();
  store.stamps = Array.isArray(stamps) ? [...stamps] : [];
  return savePassportStore(store);
}

function deriveStampId(sessionId, startedAt) {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) {
    return `${sessionId}_${Date.now()}`;
  }
  return `${sessionId}_${date.toISOString().slice(0, 10)}`;
}

function coerceDateOnly(startedAt) {
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return started.toISOString().slice(0, 10);
}

export function makePassportStampFromSession(session, options = {}) {
  if (!isPlainObject(session)) {
    throw new TypeError('Expected a session object when creating a passport stamp.');
  }
  const {
    userNote,
    emojis = [],
    autoNote = '',
    swatchColor,
    appVersion,
  } = options;

  const trimmedUserNote = typeof userNote === 'string' ? userNote.trim() : '';
  const hasUserNote = trimmedUserNote.length > 0;
  const note = hasUserNote ? trimmedUserNote : String(autoNote ?? '').trim();

  const startedAt = session.startedAt ?? new Date().toISOString();
  const endedAt = session.endedAt ?? startedAt;
  const dateOnly = coerceDateOnly(startedAt);

  /** @type {PassportStamp} */
  const stamp = {
    stampId: deriveStampId(session.id ?? 'session', startedAt),
    sessionId: session.id ?? 'session',
    date: dateOnly,
    startedAt,
    endedAt,
    routeId: session.routeId ?? '',
    routeLabel: session.routeLabel ?? '',
    miles: Number.isFinite(session.miles) ? session.miles : 0,
    mood: session.mood ?? '',
    pack: session.pack ?? '',
    note,
    noteSource: hasUserNote ? 'user' : 'auto',
    emojis: Array.isArray(emojis) ? emojis.filter((item) => typeof item === 'string') : [],
    thumbnailUrl: undefined,
    swatchColor,
    createdAt: new Date().toISOString(),
    appVersion,
  };

  return stamp;
}

export function appendStampToPassport(stamp) {
  if (!isPlainObject(stamp)) {
    throw new TypeError('Expected a passport stamp object when appending.');
  }
  const store = loadPassportStore();
  store.stamps.push(clone(stamp));
  savePassportStore(store);
  return store;
}

export function computePassportStats(stamps = getPassportStamps()) {
  const list = Array.isArray(stamps) ? stamps : [];
  const totalSessions = list.length;
  const totalMiles = list.reduce((sum, current) => {
    const miles = Number(current?.miles);
    return sum + (Number.isFinite(miles) ? miles : 0);
  }, 0);

  const packCounts = new Map();
  for (const stamp of list) {
    const pack = typeof stamp?.pack === 'string' ? stamp.pack : '';
    if (!pack) {
      continue;
    }
    packCounts.set(pack, (packCounts.get(pack) ?? 0) + 1);
  }

  let favoritePack = null;
  let maxCount = 0;
  for (const [pack, count] of packCounts.entries()) {
    if (count > maxCount) {
      favoritePack = pack;
      maxCount = count;
    }
  }

  return {
    totalSessions,
    totalMiles,
    favoritePack,
  };
}

export function clearPassportStore() {
  cachedStore = normaliseStore({});
  savePassportStore(cachedStore);
  return cachedStore;
}
