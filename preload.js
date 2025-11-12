const { contextBridge } = require('electron');

const DEFAULT_WS_URL = 'ws://localhost:6789';
const resolvedWsUrl = process.env.RTW_WS_URL || DEFAULT_WS_URL;

contextBridge.exposeInMainWorld('preloadConfig', {
  WS_URL: resolvedWsUrl,
});

contextBridge.exposeInMainWorld('electronInfo', { versions: process.versions });
