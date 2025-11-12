const { contextBridge } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULT_WS_URL = 'ws://localhost:6789';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getGlobalOverride() {
  if (typeof globalThis !== 'undefined' && isNonEmptyString(globalThis.RTW_WS_URL)) {
    return globalThis.RTW_WS_URL.trim();
  }
  return undefined;
}

function getConfigValue() {
  const configPath = path.join(__dirname, 'renderer', 'config.js');
  if (!fs.existsSync(configPath)) {
    return undefined;
  }

  try {
    const configModule = require(configPath);
    const candidate =
      configModule?.RTW_WS_URL ??
      configModule?.WS_URL ??
      configModule?.default?.RTW_WS_URL ??
      configModule?.default;

    if (isNonEmptyString(candidate)) {
      return candidate.trim();
    }
  } catch (error) {
    console.warn('[preload] Failed to read renderer/config.js:', error);
  }

  return undefined;
}

const resolvedWsUrl = getGlobalOverride() ?? getConfigValue() ?? DEFAULT_WS_URL;

contextBridge.exposeInMainWorld('RTW_WS_URL', resolvedWsUrl);
contextBridge.exposeInMainWorld('electronInfo', { versions: process.versions });
