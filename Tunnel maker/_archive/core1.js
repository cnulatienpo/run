export const APP_VERSION = '1.2.0';
export const SCHEMA_VERSION = 2;

export function phaseScale(p, minScale, maxScale) {
  const a = Math.log(minScale);
  const b = Math.log(maxScale);
  return Math.exp(a + p * (b - a));
}

export function phaseOpacity(p, fadeInEnd, fadeOutStart) {
  if (p < fadeInEnd) return p / fadeInEnd;
  if (p > fadeOutStart) return Math.max(0, 1 - (p - fadeOutStart) / (1 - fadeOutStart));
  return 1;
}

function clamp01(v, fallback = 0.5) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function validateSessionShape(data) {
  if (!data || typeof data !== 'object') return { ok: false, message: 'Session must be an object.' };
  if (!Array.isArray(data.library)) return { ok: false, message: 'Session library must be an array.' };
  if (!Array.isArray(data.layers)) return { ok: false, message: 'Session layers must be an array.' };
  if (data.layers.length > 6) return { ok: false, message: 'Session has more than 6 layers.' };
  return { ok: true };
}

export function migrateSession(raw) {
  const src = raw || {};
  const v = Number.isInteger(src.schemaVersion) ? src.schemaVersion : 1;

  const out = {
    schemaVersion: SCHEMA_VERSION,
    projectId: src.projectId || null,
    projectName: src.projectName || 'Untitled Project',
    updatedAt: src.updatedAt || Date.now(),
    vanishingPoint: {
      x: clamp01(src?.vanishingPoint?.x, 0.5),
      y: clamp01(src?.vanishingPoint?.y, 0.5)
    },
    zoomSpeed: Number.isFinite(src.zoomSpeed) ? src.zoomSpeed : 0.18,
    minScale: Number.isFinite(src.minScale) ? src.minScale : 0.05,
    maxScale: Number.isFinite(src.maxScale) ? src.maxScale : 5,
    fadeInEnd: Number.isFinite(src.fadeInEnd) ? src.fadeInEnd : 0.18,
    fadeOutStart: Number.isFinite(src.fadeOutStart) ? src.fadeOutStart : 0.72,
    vignette: Number.isFinite(src.vignette) ? src.vignette : 0.45,
    fadeColor: typeof src.fadeColor === 'string' ? src.fadeColor : '',
    fadeAmount: Number.isFinite(src.fadeAmount) ? src.fadeAmount : 0,
    lockToRail: src.lockToRail !== false,
    strictRail: src.strictRail === true,
    railDrift: Number.isFinite(src.railDrift) ? src.railDrift : 0.05,
    radialBlend: src.radialBlend !== false,
    centerRadius: Number.isFinite(src.centerRadius) ? src.centerRadius : 0.28,
    blendWidth: Number.isFinite(src.blendWidth) ? src.blendWidth : 0.32,
    edgeHold: Number.isFinite(src.edgeHold) ? src.edgeHold : 0.8,
    edgeBlur: Number.isFinite(src.edgeBlur) ? src.edgeBlur : 0,
    autoMatch: src.autoMatch === true,
    uploadOnlyMode: src.uploadOnlyMode === true,
    useProxy: src.useProxy !== false,
    library: Array.isArray(src.library) ? src.library : [],
    layers: Array.isArray(src.layers) ? src.layers : []
  };

  if (v < 2) {
    out.library = out.library.map((folder) => ({
      id: folder.id,
      name: folder.name || 'UNSORTED',
      images: Array.isArray(folder.images) ? folder.images.map((img) => ({
        id: img.id,
        imageId: img.imageId || img.id,
        sourceUrl: img.sourceUrl || '',
        sourceType: img.sourceType || 'local',
        thumb: img.thumb || '',
        name: img.name || 'IMAGE'
      })) : []
    }));
  }

  return out;
}
