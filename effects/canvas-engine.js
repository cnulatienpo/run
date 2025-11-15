const DEFAULT_ZONE = Object.freeze({ shape: 'rect', x: 0, y: 0, w: 1, h: 1 });
const DEFAULT_DURATION = 3600;

let canvas;
let ctx;
let resizeListener;
let activeAnimationId = null;
let activeCleanup = null;

const zoneRegistry = new Map([
  [
    'full',
    {
      shape: 'rect',
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    },
  ],
  [
    'center',
    {
      shape: 'rect',
      x: 0.25,
      y: 0.2,
      w: 0.5,
      h: 0.6,
    },
  ],
  [
    'topLeft',
    {
      shape: 'rect',
      x: 0,
      y: 0,
      w: 0.45,
      h: 0.45,
    },
  ],
  [
    'bottom',
    {
      shape: 'rect',
      x: 0.1,
      y: 0.65,
      w: 0.8,
      h: 0.35,
    },
  ],
  [
    'spot',
    {
      shape: 'circle',
      x: 0.5,
      y: 0.4,
      r: 0.25,
    },
  ],
]);

const canvasEffects = new Map();

function clamp01(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function normalizeZone(zone) {
  if (!zone || typeof zone !== 'object') {
    return { ...DEFAULT_ZONE };
  }

  const shape = typeof zone.shape === 'string' ? zone.shape.toLowerCase() : 'rect';

  if (shape === 'circle') {
    const radius =
      zone.r ?? zone.radius ?? zone.size ?? (Number.isFinite(zone.diameter) ? zone.diameter / 2 : undefined);
    return {
      shape: 'circle',
      x: clamp01(zone.x ?? 0.5, 0.5),
      y: clamp01(zone.y ?? 0.5, 0.5),
      r: clamp01(radius ?? 0.25, 0.25),
    };
  }

  return {
    shape: 'rect',
    x: clamp01(zone.x ?? 0, 0),
    y: clamp01(zone.y ?? 0, 0),
    w: clamp01(zone.w ?? zone.width ?? 1, 1),
    h: clamp01(zone.h ?? zone.height ?? 1, 1),
  };
}

function resolveZone(zoneSpec) {
  if (!zoneSpec) {
    return normalizeZone(DEFAULT_ZONE);
  }

  if (typeof zoneSpec === 'string') {
    const match = zoneRegistry.get(zoneSpec);
    return normalizeZone(match || DEFAULT_ZONE);
  }

  if (typeof zoneSpec === 'object' && typeof zoneSpec.name === 'string') {
    const match = zoneRegistry.get(zoneSpec.name);
    return normalizeZone({ ...match, ...zoneSpec });
  }

  return normalizeZone(zoneSpec);
}

function ensureCanvas(options = {}) {
  if (canvas && ctx) {
    return canvas;
  }

  const {
    parent = document.body,
    className = 'effect-zones-canvas',
    id = 'effect-zones-canvas',
    zIndex = 10000,
    position = 'fixed',
  } = options;

  canvas = document.createElement('canvas');
  canvas.id = id;
  canvas.className = className;
  Object.assign(canvas.style, {
    position,
    inset: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: String(zIndex),
  });

  ctx = canvas.getContext('2d');

  function resizeCanvas() {
    if (!canvas) {
      return;
    }
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * pixelRatio);
    const height = Math.round(window.innerHeight * pixelRatio);
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
    }
  }

  resizeListener = resizeCanvas;
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  parent.appendChild(canvas);

  return canvas;
}

function clearCanvas() {
  if (!ctx || !canvas) {
    return;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

export function destroyCanvas() {
  if (resizeListener) {
    window.removeEventListener('resize', resizeListener);
    resizeListener = undefined;
  }
  cancelActiveEffect();
  if (canvas?.parentNode) {
    canvas.parentNode.removeChild(canvas);
  }
  canvas = undefined;
  ctx = undefined;
}

export function initCanvas(options = {}) {
  ensureCanvas(options);
  return canvas;
}

export function registerZone(name, zoneSpec) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('[canvas-engine] Zone name must be a non-empty string');
  }
  zoneRegistry.set(name.trim(), normalizeZone(zoneSpec));
}

export function getRegisteredZones() {
  return new Map(zoneRegistry);
}

export function registerCanvasEffect(effectName, renderer) {
  if (typeof effectName !== 'string' || !effectName.trim()) {
    throw new Error('[canvas-engine] Effect name must be a non-empty string');
  }
  if (typeof renderer !== 'function') {
    throw new Error('[canvas-engine] Effect renderer must be a function');
  }
  canvasEffects.set(effectName.trim(), renderer);
}

function cancelAnimation() {
  if (activeAnimationId !== null) {
    cancelAnimationFrame(activeAnimationId);
    activeAnimationId = null;
  }
}

export function cancelActiveEffect() {
  cancelAnimation();
  if (typeof activeCleanup === 'function') {
    try {
      activeCleanup();
    } catch (error) {
      console.warn('[canvas-engine] Failed to cleanup active effect', error);
    }
  }
  activeCleanup = null;
  clearCanvas();
}

function applyZoneClip(zone) {
  if (!ctx || !canvas || !zone) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;

  if (zone.shape === 'circle') {
    const radius = Math.max(0, zone.r) * Math.min(width, height);
    const centerX = zone.x * width;
    const centerY = zone.y * height;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();
  } else {
    const rectWidth = zone.w * width;
    const rectHeight = zone.h * height;
    const startX = zone.x * width;
    const startY = zone.y * height;
    ctx.beginPath();
    ctx.rect(startX, startY, rectWidth, rectHeight);
    ctx.clip();
  }
}

function getZoneMetrics(zone) {
  if (!canvas) {
    return null;
  }
  const width = canvas.width;
  const height = canvas.height;
  if (zone.shape === 'circle') {
    return {
      shape: 'circle',
      centerX: zone.x * width,
      centerY: zone.y * height,
      radius: Math.max(0, zone.r) * Math.min(width, height),
    };
  }
  return {
    shape: 'rect',
    x: zone.x * width,
    y: zone.y * height,
    width: zone.w * width,
    height: zone.h * height,
  };
}

function runEffectLoop(renderer, zone, duration, options = {}) {
  if (!ctx || !canvas) {
    return () => {};
  }

  const startTime = performance.now();
  let frameIndex = 0;
  let lastFrameTime = startTime;

  const zoneMetrics = getZoneMetrics(zone);

  function step(now) {
    const elapsed = now - startTime;
    const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 1;
    const delta = now - lastFrameTime;

    clearCanvas();
    ctx.save();
    if (
      !(zone.shape === 'rect' && zone.x === 0 && zone.y === 0 && zone.w === 1 && zone.h === 1)
    ) {
      applyZoneClip(zone);
    }

    const continueAnimation =
      renderer(ctx, {
        canvas,
        elapsed,
        duration,
        progress,
        delta,
        frame: frameIndex,
        zone,
        zoneMetrics,
        options,
        isFinalFrame: elapsed >= duration,
      }) !== false;

    ctx.restore();

    frameIndex += 1;
    lastFrameTime = now;

    if (elapsed < duration && continueAnimation) {
      activeAnimationId = requestAnimationFrame(step);
    } else {
      cancelAnimation();
    }
  }

  activeAnimationId = requestAnimationFrame(step);

  const cleanup = () => {
    cancelAnimation();
    clearCanvas();
  };

  activeCleanup = cleanup;

  return cleanup;
}

function getRenderer(effectName) {
  if (!effectName) {
    return null;
  }
  return canvasEffects.get(effectName) ?? canvasEffects.get('wave');
}

export function triggerCanvasEffect(effectName, zoneSpec, duration, options = {}) {
  ensureCanvas(options.canvasOptions);

  const renderer = getRenderer(effectName);
  if (typeof renderer !== 'function') {
    console.warn(`[canvas-engine] Canvas effect "${effectName}" is not registered.`);
    return () => {};
  }

  const zone = resolveZone(zoneSpec);
  const clampedDuration = Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_DURATION;

  cancelActiveEffect();

  const cleanup = runEffectLoop(renderer, zone, clampedDuration, options);
  activeCleanup = cleanup;
  return cleanup;
}

function registerBuiltInEffects() {
  if (canvasEffects.has('wave')) {
    return;
  }

  registerCanvasEffect('wave', (context, state) => {
    const { canvas: currentCanvas, elapsed, progress, zoneMetrics, options = {} } = state;
    const intensity = typeof options.intensity === 'number' ? options.intensity : 0.45;
    const width = currentCanvas.width;
    const height = currentCanvas.height;

    const hue = (elapsed / 15) % 360;
    const alpha = 0.25 + 0.4 * Math.sin(progress * Math.PI);

    context.fillStyle = `hsla(${hue.toFixed(2)}, 80%, 60%, ${alpha.toFixed(3)})`;
    context.fillRect(0, 0, width, height);

    context.globalCompositeOperation = 'lighter';
    context.lineWidth = Math.max(1.5, intensity * 6);
    context.strokeStyle = `hsla(${(hue + 60) % 360}, 90%, 70%, ${Math.max(0.15, alpha)})`;
    context.beginPath();

    const effectiveHeight = zoneMetrics?.shape === 'circle' ? zoneMetrics.radius : zoneMetrics?.height ?? height;
    const effectiveWidth = zoneMetrics?.shape === 'circle' ? zoneMetrics.radius * 2 : zoneMetrics?.width ?? width;
    const waveHeight = Math.max(12, effectiveHeight * intensity);
    const wavelength = Math.max(40, effectiveWidth / 6);

    for (let x = 0; x <= width; x += 12) {
      const normalizedX = x / width;
      const offset = Math.sin(normalizedX * Math.PI * 4 + elapsed / 180) * waveHeight;
      const y = height / 2 + offset * Math.sin(progress * Math.PI * 2 + x / wavelength);
      if (x === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();
    context.globalCompositeOperation = 'source-over';
  });
}

registerBuiltInEffects();

export const __testUtils = {
  normalizeZone,
  resolveZone,
  clearCanvas,
  getRenderer,
  getZoneMetrics,
};

