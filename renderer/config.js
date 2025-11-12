const DEFAULT_WS_URL = 'ws://localhost:6789';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveFromGlobal() {
  if (typeof globalThis !== 'undefined' && isNonEmptyString(globalThis.RTW_WS_URL)) {
    return globalThis.RTW_WS_URL.trim();
  }
  return undefined;
}

const resolvedUrl = resolveFromGlobal() ?? DEFAULT_WS_URL;

const config = {
  RTW_WS_URL: resolvedUrl,
  default: resolvedUrl,
};

Object.defineProperty(config, '__esModule', { value: true });

module.exports = config;
