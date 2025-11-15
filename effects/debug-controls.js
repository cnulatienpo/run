import { applyEffect } from './effect-loader.js';
import { exportEffectSessionLog } from './effect-session-log.js';

let panel;
let cleanupHandlers = [];

const DEFAULT_ZONE = Object.freeze({ shape: 'circle', x: 0.5, y: 0.5, r: 0.25 });
const DEFAULT_DURATION = 3000;
const DEFAULT_INTENSITY = 'medium';
const DEFAULT_EFFECTS = [
  { label: 'Wave', effect: 'wave' },
  { label: 'Ripple', effect: 'ripple' },
  { label: 'Melt', effect: 'melt' },
  { label: 'Hue Shift', effect: 'hueshift' },
];

function createButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  cleanupHandlers.push(() => button.removeEventListener('click', onClick));
  return button;
}

function cloneZone(zone) {
  if (!zone || typeof zone !== 'object') {
    return { ...DEFAULT_ZONE };
  }
  if (zone.shape === 'circle') {
    return {
      shape: 'circle',
      x: Number.isFinite(zone.x) ? zone.x : DEFAULT_ZONE.x,
      y: Number.isFinite(zone.y) ? zone.y : DEFAULT_ZONE.y,
      r: Number.isFinite(zone.r) ? zone.r : DEFAULT_ZONE.r,
    };
  }
  return {
    shape: zone.shape || 'rect',
    x: Number.isFinite(zone.x) ? zone.x : 0,
    y: Number.isFinite(zone.y) ? zone.y : 0,
    w: Number.isFinite(zone.w) ? zone.w : 1,
    h: Number.isFinite(zone.h) ? zone.h : 1,
  };
}

function buildEffectConfig(effect, overrides = {}) {
  const base = {
    type: 'canvas',
    effect,
    zone: cloneZone(overrides.zone ?? DEFAULT_ZONE),
    duration: Number.isFinite(overrides.duration) ? overrides.duration : DEFAULT_DURATION,
    intensity: overrides.intensity ?? DEFAULT_INTENSITY,
    tag: overrides.tag || 'debug',
  };

  if (overrides.options && typeof overrides.options === 'object') {
    base.options = { ...overrides.options };
  }

  if (overrides.type) {
    base.type = overrides.type;
  }

  return base;
}

export function initDebugControls(options = {}) {
  if (panel) {
    return panel;
  }
  if (typeof document === 'undefined') {
    console.warn('[effect-debug] Document is not available for debug controls.');
    return null;
  }

  const {
    effects = DEFAULT_EFFECTS,
    container = document.body,
    zone = DEFAULT_ZONE,
    duration = DEFAULT_DURATION,
    intensity = DEFAULT_INTENSITY,
    className = 'effect-debug-panel',
  } = options;

  panel = document.createElement('div');
  panel.className = className;
  Object.assign(panel.style, {
    position: 'fixed',
    top: '10px',
    right: '10px',
    background: '#111',
    color: '#fff',
    padding: '10px',
    borderRadius: '8px',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '13px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: '160px',
  });

  const title = document.createElement('strong');
  title.textContent = options.title || 'Effect Debug';
  panel.appendChild(title);

  const list = Array.isArray(effects) && effects.length > 0 ? effects : DEFAULT_EFFECTS;

  list.forEach((entry) => {
    if (!entry) {
      return;
    }
    const label = entry.label || entry.effect || String(entry);
    const effectName = entry.effect || entry;
    const overrides = entry.config || entry.overrides || {};
    const button = createButton(label, () => {
      const config = buildEffectConfig(effectName, {
        zone: overrides.zone ?? zone,
        duration: overrides.duration ?? duration,
        intensity: overrides.intensity ?? intensity,
        options: overrides.options,
        type: overrides.type ?? 'canvas',
        tag: overrides.tag ?? 'debug',
      });
      applyEffect(config);
    });
    panel.appendChild(button);
  });

  const exportButton = createButton(options.exportLabel || 'Export Log', () => {
    exportEffectSessionLog();
  });
  panel.appendChild(exportButton);

  const closeButton = createButton('Close', () => {
    destroyDebugControls();
  });
  closeButton.style.marginTop = '4px';
  panel.appendChild(closeButton);

  (container || document.body).appendChild(panel);
  return panel;
}

export function destroyDebugControls() {
  if (!panel) {
    return;
  }
  cleanupHandlers.forEach((cleanup) => {
    try {
      cleanup();
    } catch (error) {
      console.warn('[effect-debug] Failed to cleanup handler', error);
    }
  });
  cleanupHandlers = [];
  panel.remove();
  panel = null;
}

if (typeof window !== 'undefined') {
  window.__initEffectDebugControls = initDebugControls;
  window.__destroyEffectDebugControls = destroyDebugControls;
}
