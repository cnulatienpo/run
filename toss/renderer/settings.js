const SETTINGS_STORAGE_KEY = 'rtwSettings';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneSettings(settings) {
  if (!isPlainObject(settings)) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(settings));
  } catch (error) {
    console.warn('[settings] Failed to clone settings:', error);
    return {};
  }
}

function readFromLocalStorage() {
  try {
    const raw = window?.localStorage?.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return cloneSettings(JSON.parse(raw));
  } catch (error) {
    console.warn('[settings] Unable to read settings from localStorage:', error);
    return {};
  }
}

function writeToLocalStorage(settings) {
  try {
    window?.localStorage?.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(cloneSettings(settings), null, 2)
    );
    return true;
  } catch (error) {
    console.warn('[settings] Unable to write settings to localStorage:', error);
    return false;
  }
}

function readFromBridge() {
  try {
    const loader = window?.electronSettings?.load;
    if (typeof loader !== 'function') {
      return null;
    }
    const result = loader();
    return cloneSettings(result);
  } catch (error) {
    console.warn('[settings] Unable to read settings via bridge:', error);
    return null;
  }
}

function writeToBridge(settings) {
  try {
    const saver = window?.electronSettings?.save;
    if (typeof saver !== 'function') {
      return false;
    }
    return Boolean(saver(cloneSettings(settings)));
  } catch (error) {
    console.warn('[settings] Unable to write settings via bridge:', error);
    return false;
  }
}

let cachedSettings;

/**
 * Stored user settings structure.
 * {
 *   "defaultTag": "Dreamcore",
 *   "defaultMood": "Medium",
 *   "effectsEnabled": true,
 *   "lastPlaylist": "urban_night"
 * }
 */
export function loadSettings() {
  if (cachedSettings) {
    return cachedSettings;
  }

  const bridgeSettings = readFromBridge();
  if (bridgeSettings) {
    cachedSettings = bridgeSettings;
    return cachedSettings;
  }

  cachedSettings = readFromLocalStorage();
  return cachedSettings;
}

export function saveSettings(settings = cachedSettings) {
  if (!isPlainObject(settings)) {
    return;
  }

  cachedSettings = settings;
  const didPersistToBridge = writeToBridge(settings);
  if (!didPersistToBridge) {
    writeToLocalStorage(settings);
  }
}

export function getCachedSettings() {
  return cachedSettings ?? loadSettings();
}
