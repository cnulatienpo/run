import { Application, Container, Graphics } from '../node_modules/pixi.js/dist/pixi.min.mjs';
import { GlitchFilter } from '../node_modules/@pixi/filter-glitch/dist/filter-glitch.mjs';
import { GodrayFilter } from '../node_modules/@pixi/filter-godray/dist/filter-godray.mjs';

function createFallbackLogger() {
  return {
    info: (...args) => console.info('[hud]', ...args),
    warn: (...args) => console.warn('[hud]', ...args),
    error: (...args) => console.error('[hud]', ...args),
  };
}

let log = createFallbackLogger();
(async () => {
  try {
    const module = await import('../node_modules/electron-log/renderer.js');
    const resolved = module?.default ?? module;
    if (resolved) {
      log = resolved;
      if (resolved?.transports?.file) {
        resolved.transports.file.level = 'info';
      }
    }
  } catch (error) {
    console.warn('[hud] electron-log unavailable, falling back to console.', error);
  }

  log.info('Session started:', new Date().toISOString());
})();

const app = new Application();
const overlay = new Container();

const glitch = new GlitchFilter({ slices: 5 });
const godrays = new GodrayFilter();

const activeFilters = {
  Dreamcore: [godrays],
  Urban: [glitch],
  Ambient: [],
};

const pacing = {
  Dreamcore: [4000, 6000],
  Urban: [6000, 12000],
  Ambient: [15000, 25000],
};

let currentTag = 'Ambient';
let steps = 0;
let scheduleHandle;

const hud = document.getElementById('hud') ?? document.body.appendChild(document.createElement('div'));

hud.id = 'hud';
hud.style.position = 'absolute';
hud.style.top = '10px';
hud.style.left = '10px';
hud.style.zIndex = '9999';
hud.style.color = '#fff';
hud.style.background = 'rgba(0, 0, 0, 0.7)';
hud.style.padding = '10px';
hud.style.borderRadius = '6px';
hud.style.fontFamily = "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const tagContainer = document.createElement('div');
tagContainer.style.display = 'flex';
tagContainer.style.gap = '6px';
tagContainer.style.marginBottom = '8px';
hud.appendChild(tagContainer);

const statusEl = document.createElement('div');
statusEl.textContent = 'Steps: 0';
hud.appendChild(statusEl);

const tags = ['Dreamcore', 'Urban', 'Ambient'];
const tagButtons = new Map();

function updateTagButtonStyles() {
  tagButtons.forEach((button, tag) => {
    const isActive = tag === currentTag;
    button.style.background = isActive ? '#0ea5e9' : '#1f2937';
    button.style.color = '#ffffff';
    button.style.border = 'none';
    button.style.padding = '6px 10px';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.style.opacity = isActive ? '1' : '0.7';
  });
}

tags.forEach((tag) => {
  const button = document.createElement('button');
  button.textContent = tag;
  button.type = 'button';
  button.addEventListener('click', () => {
    if (currentTag === tag) {
      return;
    }
    currentTag = tag;
    updateTagButtonStyles();
    applyTagFilters();
    rescheduleEffects();
    log.info('Mood tag set:', tag);
  });
  tagContainer.appendChild(button);
  tagButtons.set(tag, button);
});

updateTagButtonStyles();

function applyTagFilters() {
  overlay.filters = activeFilters[currentTag] ?? [];
}

function spawnEffect() {
  if (!app.renderer) {
    return;
  }

  const graphic = new Graphics();
  graphic.beginFill(Math.floor(0xffffff * Math.random()));
  graphic.drawCircle(0, 0, 30 + Math.random() * 20);
  graphic.endFill();
  graphic.x = Math.random() * app.renderer.width;
  graphic.y = Math.random() * app.renderer.height;
  overlay.addChild(graphic);

  setTimeout(() => {
    overlay.removeChild(graphic);
    graphic.destroy({ children: true });
  }, 4000);

  log.info('Effect spawned', { time: Date.now(), tag: currentTag, step: steps });
}

function scheduleNext() {
  const [minDelay, maxDelay] = pacing[currentTag] ?? [6000, 10000];
  const delay = minDelay + Math.random() * (maxDelay - minDelay);
  scheduleHandle = window.setTimeout(() => {
    spawnEffect();
    scheduleNext();
  }, delay);
}

function rescheduleEffects() {
  if (scheduleHandle) {
    window.clearTimeout(scheduleHandle);
  }
  scheduleNext();
}

function updateSteps(stepCount) {
  steps = stepCount;
  statusEl.textContent = `Steps: ${stepCount.toLocaleString()}`;
}

const wsUrl =
  globalThis.preloadConfig?.WS_URL ?? globalThis.RTW_WS_URL ?? 'ws://localhost:6789';

let socket;

function connectSocket() {
  try {
    socket = new WebSocket(wsUrl);
  } catch (error) {
    log.error('WS create error', error);
    scheduleReconnect();
    return;
  }

  socket.addEventListener('open', () => log.info('WS connected'));
  socket.addEventListener('error', (event) => log.error('WS error', event));
  socket.addEventListener('close', () => {
    log.warn('WS closed');
    scheduleReconnect();
  });
  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (typeof data.steps === 'number') {
        updateSteps(data.steps);
        log.info('Step received', data.steps);
      }
    } catch (error) {
      log.error('WS parse error', event.data);
    }
  });
}

let reconnectTimer;

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    connectSocket();
  }, 4000);
}

connectSocket();

(async () => {
  await app.init({ backgroundAlpha: 0, resizeTo: window });
  document.body.appendChild(app.canvas);
  Object.assign(app.canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '1',
  });
  app.stage.addChild(overlay);
  applyTagFilters();
  scheduleNext();
})();
