const DEFAULT_WS_URL = 'ws://localhost:6789';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readInjectedUrl() {
  if (typeof globalThis !== 'undefined' && isNonEmptyString(globalThis.RTW_WS_URL)) {
    return globalThis.RTW_WS_URL.trim();
  }

  if (typeof window !== 'undefined') {
    const preloadUrl = window.preloadConfig?.WS_URL;
    if (isNonEmptyString(preloadUrl)) {
      return preloadUrl.trim();
    }
  }

  return undefined;
}

export const WS_URL = readInjectedUrl() ?? DEFAULT_WS_URL;

export default {
  WS_URL,
};
