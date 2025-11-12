const { contextBridge, app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULT_WS_URL = 'ws://localhost:6789';
const resolvedWsUrl = process.env.RTW_WS_URL || DEFAULT_WS_URL;

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitiseSettings(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('[preload] Failed to sanitise settings payload:', error);
    return {};
  }
}

function readSettingsFile() {
  try {
    if (!fs.existsSync(settingsPath)) {
      return {};
    }

    const raw = fs.readFileSync(settingsPath, 'utf-8');
    if (!raw.trim()) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return sanitiseSettings(parsed);
  } catch (error) {
    console.warn('[preload] Unable to read settings file:', error);
    return {};
  }
}

function writeSettingsFile(settings) {
  try {
    const payload = sanitiseSettings(settings);
    fs.writeFileSync(settingsPath, JSON.stringify(payload, null, 2));
    return true;
  } catch (error) {
    console.warn('[preload] Unable to write settings file:', error);
    return false;
  }
}

contextBridge.exposeInMainWorld('preloadConfig', {
  WS_URL: resolvedWsUrl,
});

contextBridge.exposeInMainWorld('electronInfo', {
  version: app.getVersion(),
  versions: process.versions,
});

contextBridge.exposeInMainWorld('electronSettings', {
  load: () => readSettingsFile(),
  save: (settings) => writeSettingsFile(settings),
  path: settingsPath,
});
