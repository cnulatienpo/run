import { APP_VERSION, SCHEMA_VERSION, phaseScale, phaseOpacity, migrateSession, validateSessionShape } from './core.js';
import { uid, putProject, getProject, getAllProjects, deleteProject, putImage, getImage, deleteImage, putMeta, getMeta } from './db.js';

const S = {
  vp: { x: 0.5, y: 0.5 },
  zoomSpeed: 0.18,
  playing: false,
  showGuides: true,
  vignette: 0.45,
  fadeColor: '',
  fadeAmount: 0,
  globalTime: 0,
  minScale: 0.05,
  maxScale: 5,
  fadeInEnd: 0.18,
  fadeOutStart: 0.72,
  lockToRail: true,
  strictRail: false,
  railDrift: 0.05,
  radialBlend: true,
  centerRadius: 0.28,
  blendWidth: 0.32,
  edgeHold: 0.8,
  edgeBlur: 0,
  autoMatch: false,
  uploadOnlyMode: false,
  useProxy: true,
  projectId: null,
  projectName: 'Untitled Project',
  library: [],
  layers: []
};

const historyState = {
  undo: [],
  redo: [],
  max: 80,
  mute: false
};

const selection = {
  activeId: null,
  selectedIds: new Set(),
  activeFolderId: null,
  activeTab: 'library'
};

const runtime = {
  rafId: null,
  lastTs: null,
  isDragging: false,
  imageUrlCache: new Map(),
  autosaveTimer: null,
  exportJob: null
};

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const _eBuf = document.createElement('canvas');
const _rBuf = document.createElement('canvas');
const _eBctx = _eBuf.getContext('2d');
const _rBctx = _rBuf.getContext('2d');
const _mBuf = document.createElement('canvas');
const _mBctx = _mBuf.getContext('2d');
const _mfBuf = document.createElement('canvas');
const _mfBctx = _mfBuf.getContext('2d');
const _sc = document.createElement('canvas');
_sc.width = 20;
_sc.height = 20;
const _sctx = _sc.getContext('2d');

function $(id) { return document.getElementById(id); }

function safeFileBase(name = 'runnyvision-tunnel-maker-project') {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'runnyvision-tunnel-maker-project';
}

function showToast(message, type = 'ok', timeout = 2800) {
  const wrap = $('toast-wrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    if (el.isConnected) el.remove();
  }, timeout);
}

function hideSplash() {
  const splash = $('splash');
  splash.classList.add('hidden');
  setTimeout(() => splash.remove(), 450);
}

function resizeCanvas() {
  const area = $('canvas-area');
  const W = area.clientWidth;
  const H = area.clientHeight;
  const ratio = 16 / 9;
  let cw;
  let ch;
  if (W / H > ratio) {
    ch = H;
    cw = ch * ratio;
  } else {
    cw = W;
    ch = cw / ratio;
  }
  canvas.width = Math.round(cw);
  canvas.height = Math.round(ch);
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
}

function updateSliderOut(inputId, outputId, targetProp, precision = 2) {
  const el = $(inputId);
  el.addEventListener('input', () => {
    const v = Number(el.value);
    S[targetProp] = v;
    $(outputId).textContent = v.toFixed(precision);
    markDirty();
  });
}

function markDirty() {
  queueAutosave();
}

function snapshot() {
  return JSON.stringify(serializeSession(false));
}

function commitHistory() {
  if (historyState.mute) return;
  const snap = snapshot();
  const last = historyState.undo[historyState.undo.length - 1];
  if (last === snap) return;
  historyState.undo.push(snap);
  if (historyState.undo.length > historyState.max) historyState.undo.shift();
  historyState.redo = [];
}

function applySnapshot(raw) {
  historyState.mute = true;
  const migrated = migrateSession(JSON.parse(raw));
  applyState(migrated, { skipHistory: true, fromUndo: true }).finally(() => {
    historyState.mute = false;
  });
}

function undo() {
  if (historyState.undo.length < 2) return;
  const current = historyState.undo.pop();
  historyState.redo.push(current);
  const prev = historyState.undo[historyState.undo.length - 1];
  applySnapshot(prev);
}

function redo() {
  if (!historyState.redo.length) return;
  const next = historyState.redo.pop();
  historyState.undo.push(next);
  applySnapshot(next);
}

function mkFolder(name) {
  return { id: uid('f'), name: name.toUpperCase(), images: [] };
}

function getOrCreateFolderByName(name) {
  const normalized = (name || 'UNSORTED').trim().toUpperCase();
  let folder = S.library.find((f) => f.name === normalized);
  if (!folder) {
    folder = mkFolder(normalized);
    S.library.push(folder);
  }
  return folder;
}

function getActiveFolder() {
  return S.library.find((f) => f.id === selection.activeFolderId) || S.library[0] || null;
}

async function persistBlob(blob, name, sourceType = 'local', sourceUrl = '') {
  const id = uid('img');
  await putImage({ id, blob, name, sourceType, sourceUrl, createdAt: Date.now() });
  const objUrl = URL.createObjectURL(blob);
  runtime.imageUrlCache.set(id, objUrl);
  return { id, url: objUrl };
}

async function resolveImageURL(imageId) {
  if (runtime.imageUrlCache.has(imageId)) return runtime.imageUrlCache.get(imageId);
  const rec = await getImage(imageId);
  if (!rec?.blob) return '';
  const objUrl = URL.createObjectURL(rec.blob);
  runtime.imageUrlCache.set(imageId, objUrl);
  return objUrl;
}

async function makeMiniThumbFromBlob(blob) {
  const img = new Image();
  const u = URL.createObjectURL(blob);
  try {
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = u;
    });
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 48;
    c.getContext('2d').drawImage(img, 0, 0, 64, 48);
    return c.toDataURL('image/jpeg', 0.6);
  } catch {
    return '';
  } finally {
    URL.revokeObjectURL(u);
  }
}

async function pushBlobToFolder(folderId, blob, name, sourceType = 'local', sourceUrl = '') {
  if (blob.size > 30 * 1024 * 1024) {
    showToast('Image too large (>30MB).', 'warn');
    return;
  }
  const folder = S.library.find((f) => f.id === folderId);
  if (!folder) return;
  const saved = await persistBlob(blob, name, sourceType, sourceUrl);
  const thumb = await makeMiniThumbFromBlob(blob);
  folder.images.push({
    id: uid('li'),
    imageId: saved.id,
    sourceType,
    sourceUrl,
    thumb,
    name: (name || 'IMAGE').slice(0, 24)
  });
  refreshLibrary();
  markDirty();
}

async function handleLibFiles(files) {
  const folder = getActiveFolder();
  if (!folder) return;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    if (file.size > 25 * 1024 * 1024) {
      showToast(`Skipped ${file.name}: exceeds 25MB.`, 'warn');
      continue;
    }
    const name = file.name.replace(/\.[^.]+$/, '').toUpperCase();
    await pushBlobToFolder(folder.id, file, name, 'local', '');
  }
}

async function handleLibFolderFiles(fileRecords) {
  let imported = 0;
  for (const rec of fileRecords) {
    const file = rec.file;
    if (!file.type.startsWith('image/')) continue;
    if (file.size > 25 * 1024 * 1024) {
      showToast(`Skipped ${file.name}: exceeds 25MB.`, 'warn');
      continue;
    }

    const rel = rec.relativePath || file.webkitRelativePath || file.name;
    const parts = rel.split('/').filter(Boolean);
    const folderName = parts.length > 1 ? parts[parts.length - 2] : (getActiveFolder()?.name || 'UNSORTED');
    const folder = getOrCreateFolderByName(folderName);
    const name = file.name.replace(/\.[^.]+$/, '').toUpperCase();
    await pushBlobToFolder(folder.id, file, name, 'local', '');
    imported += 1;
  }

  if (!imported) {
    showToast('No image files found in selected folder.', 'warn');
    return;
  }

  await refreshLibrary();
  showToast(`Imported ${imported} image(s) from folder selection.`, 'ok');
}

function recordsFromFiles(files) {
  return files.map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }));
}

function readFileEntry(entry) {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readDirectoryBatch(reader) {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function collectEntryFileRecords(entry, basePath = '') {
  if (!entry) return [];
  if (entry.isFile) {
    const file = await readFileEntry(entry);
    return [{ file, relativePath: `${basePath}${file.name}` }];
  }

  if (!entry.isDirectory) return [];
  const dirPath = `${basePath}${entry.name}/`;
  const reader = entry.createReader();
  const out = [];

  while (true) {
    const batch = await readDirectoryBatch(reader);
    if (!batch.length) break;
    for (const child of batch) {
      out.push(...await collectEntryFileRecords(child, dirPath));
    }
  }
  return out;
}

async function extractDropRecords(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []);
  const supportsEntries = items.some((it) => typeof it.webkitGetAsEntry === 'function');
  if (!supportsEntries) return recordsFromFiles(Array.from(dataTransfer?.files || []));

  const out = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (!entry) continue;
    out.push(...await collectEntryFileRecords(entry));
  }

  return out.length ? out : recordsFromFiles(Array.from(dataTransfer?.files || []));
}

async function addLibFromURL() {
  if (S.uploadOnlyMode) {
    showToast('Upload-only mode is enabled.', 'warn');
    return;
  }
  const input = $('lib-url-input');
  const url = input.value.trim();
  if (!url) return;
  const folder = getActiveFolder();
  if (!folder) return;

  let target = url;
  if (S.useProxy) target = `/api/proxy-image?url=${encodeURIComponent(url)}`;

  try {
    const r = await fetch(target);
    if (!r.ok) throw new Error('fetch failed');
    const blob = await r.blob();
    if (!blob.type.startsWith('image/')) throw new Error('not image');
    const name = (url.split('/').pop().split('?')[0] || 'IMAGE').toUpperCase();
    await pushBlobToFolder(folder.id, blob, name, 'url', url);
    input.value = '';
    showToast('Image imported.', 'ok');
  } catch {
    showToast('URL import failed. Try proxy ON or upload directly.', 'err', 3800);
  }
}

async function removeLibImage(folderId, imgId) {
  const folder = S.library.find((f) => f.id === folderId);
  if (!folder) return;
  const imgRef = folder.images.find((i) => i.id === imgId);
  if (imgRef?.imageId) await deleteImage(imgRef.imageId);
  if (imgRef?.imageId && runtime.imageUrlCache.has(imgRef.imageId)) {
    URL.revokeObjectURL(runtime.imageUrlCache.get(imgRef.imageId));
    runtime.imageUrlCache.delete(imgRef.imageId);
  }
  folder.images = folder.images.filter((i) => i.id !== imgId);
  refreshLibrary();
  markDirty();
}

async function addLibImageAsLayer(folderId, imgId) {
  if (S.layers.length >= 6) {
    showToast('Max 6 active layers.', 'warn');
    return;
  }
  const folder = S.library.find((f) => f.id === folderId);
  const imgData = folder?.images.find((i) => i.id === imgId);
  if (!imgData) return;

  const src = await resolveImageURL(imgData.imageId);
  if (!src) {
    showToast('Image data missing from local storage.', 'err');
    return;
  }

  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = src;
  }).catch(() => {
    showToast('Could not load image.', 'err');
  });
  if (!img.naturalWidth) return;

  const layer = mkLayer(img, imgData.imageId, imgData.thumb, imgData.name);
  addLayer(layer);
  switchTab('layers');
  commitHistory();
}

function mkLayer(img, imageId, thumb, name) {
  const n = S.layers.length;
  return {
    id: uid('l'),
    img,
    imageId,
    thumb: thumb || '',
    name: (name || 'LAYER').slice(0, 20),
    visible: true,
    locked: false,
    x: 0.5,
    y: 0.5,
    scale: 1.0,
    featherRadius: 24,
    vpX: 0.5,
    vpY: 0.5,
    phaseOffset: n / Math.max(n + 1, 1),
    opacity: 1,
    blur: 0,
    brightness: 1,
    contrast: 1,
    saturation: 1,
    blendMode: 'source-over',
    zIndex: n
  };
}

function setActiveLayer(id, multi = false) {
  if (!multi) selection.selectedIds.clear();
  if (multi && selection.selectedIds.has(id)) {
    selection.selectedIds.delete(id);
  } else {
    selection.selectedIds.add(id);
  }
  selection.activeId = id;
  refreshPanel();
}

function addLayer(layer) {
  placeOnHorizon(layer);
  S.layers.push(layer);
  selection.activeId = layer.id;
  selection.selectedIds = new Set([layer.id]);
  guardClustering();
  refreshPanel();
  $('empty-state').style.display = 'none';
  if (!runtime.rafId) startLoop();
  markDirty();
}

function removeLayer(id) {
  const l = getLayer(id);
  if (!l || l.locked) return;
  S.layers = S.layers.filter((x) => x.id !== id);
  selection.selectedIds.delete(id);
  if (selection.activeId === id) selection.activeId = S.layers.length ? S.layers[0].id : null;
  refreshPanel();
  if (!S.layers.length) {
    $('empty-state').style.display = '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  markDirty();
}

function removeSelectedLayers() {
  [...selection.selectedIds].forEach(removeLayer);
  commitHistory();
}

function duplicateSelectedLayers() {
  const ids = [...selection.selectedIds];
  if (!ids.length) return;
  for (const id of ids) {
    if (S.layers.length >= 6) break;
    const src = getLayer(id);
    if (!src) continue;
    const clone = { ...src, id: uid('l'), name: `${src.name.slice(0, 16)} COPY`, zIndex: src.zIndex + 1, phaseOffset: (src.phaseOffset + 0.06) % 1 };
    S.layers.push(clone);
    selection.selectedIds.add(clone.id);
  }
  refreshPanel();
  markDirty();
  commitHistory();
}

function moveSelectedToFront() {
  const ids = [...selection.selectedIds];
  if (!ids.length) return;
  const maxZ = Math.max(0, ...S.layers.map((l) => l.zIndex));
  ids.forEach((id, i) => {
    const l = getLayer(id);
    if (l) l.zIndex = maxZ + i + 1;
  });
  refreshPanel();
  markDirty();
  commitHistory();
}

function moveSelectedToBack() {
  const ids = [...selection.selectedIds];
  if (!ids.length) return;
  const minZ = Math.min(0, ...S.layers.map((l) => l.zIndex));
  ids.forEach((id, i) => {
    const l = getLayer(id);
    if (l) l.zIndex = minZ - i - 1;
  });
  refreshPanel();
  markDirty();
  commitHistory();
}

function getLayer(id) {
  return S.layers.find((l) => l.id === id);
}

function placeOnHorizon(layer) {
  layer.x = 0.5;
  layer.y = 0.5;
  if (!S.layers.length) {
    layer.phaseOffset = 0;
    return;
  }
  const n = S.layers.length;
  const step = 1 / (n + 1);
  const maxPh = Math.max(...S.layers.map((l) => l.phaseOffset));
  layer.phaseOffset = (maxPh + step) % 1;
}

function getDepth(layer) {
  return ((S.globalTime * S.zoomSpeed + layer.phaseOffset) % 1 + 1) % 1;
}

function guardClustering() {
  const n = S.layers.length;
  if (n < 2) return;
  const phases = S.layers.map((l) => l.phaseOffset).sort((a, b) => a - b);
  const maxGap = Math.max(...phases.map((p, i) => (i === 0 ? p + (1 - phases[n - 1]) : p - phases[i - 1])));
  if (maxGap < 1 / (n * 2)) normalizeRailSpacing();
}

function normalizeRailSpacing() {
  const n = S.layers.length;
  if (!n) return;
  const byDepth = [...S.layers].sort((a, b) => getDepth(a) - getDepth(b));
  byDepth.forEach((l, i) => {
    l.phaseOffset = i / n;
  });
  refreshPanel();
  markDirty();
}

function layerHTML(l) {
  const sel = l.id === selection.activeId;
  const multi = selection.selectedIds.has(l.id);
  const blends = [['source-over', 'NORMAL'], ['lighter', 'ADDITIVE'], ['multiply', 'MULTIPLY'], ['screen', 'SCREEN'], ['overlay', 'OVERLAY'], ['color-dodge', 'DODGE'], ['hard-light', 'HARD LIGHT']];
  const bOpts = blends.map(([v, n]) => `<option value="${v}"${l.blendMode === v ? ' selected' : ''}>${n}</option>`).join('');
  const f = (v) => Number(v).toFixed(2);
  return `<div class="layer-item${sel ? ' sel' : ''}${multi ? ' multi' : ''}${l.locked ? ' locked' : ''}" data-layer-id="${l.id}">
    <div class="layer-hdr" data-action="select" data-layer-id="${l.id}">
      <img class="layer-thumb" src="${l.thumb || ''}" onerror="this.style.background='#2a2a35';this.removeAttribute('src')">
      <span class="layer-name" title="${l.name}">${l.name}</span>
      <div class="layer-hdr-actions">
        <button class="hdr-btn lock ${l.locked ? 'on' : ''}" data-action="lock" data-layer-id="${l.id}">${l.locked ? 'L' : 'U'}</button>
        <button class="hdr-btn vis${l.visible ? '' : ' off'}" data-action="vis" data-layer-id="${l.id}">${l.visible ? '◉' : '○'}</button>
        <button class="hdr-btn del" data-action="del" data-layer-id="${l.id}">X</button>
      </div>
    </div>
    <div class="layer-ctrls">
      <div class="cr"><span class="cr-lbl">PHASE</span><input data-layer-id="${l.id}" data-prop="phaseOffset" type="range" min="0" max="0.99" step="0.01" value="${f(l.phaseOffset)}" ${l.locked ? 'disabled' : ''}><span class="vd">${f(l.phaseOffset)}</span></div>
      <div class="cr"><span class="cr-lbl">OPACITY</span><input data-layer-id="${l.id}" data-prop="opacity" type="range" min="0" max="1" step="0.01" value="${f(l.opacity)}" ${l.locked ? 'disabled' : ''}><span class="vd">${f(l.opacity)}</span></div>
      <div class="cr"><span class="cr-lbl">SCALE</span><input data-layer-id="${l.id}" data-prop="scale" type="range" min="0.01" max="0.2" step="0.01" value="${f(Math.max(0.01, Math.min(l.scale, 0.2)))}" ${l.locked ? 'disabled' : ''}><span class="vd">${f(l.scale)}</span></div>
      <div class="cr"><span class="cr-lbl">FEATHER</span><input data-layer-id="${l.id}" data-prop="featherRadius" type="range" min="0" max="120" step="1" value="${Math.round(l.featherRadius ?? 24)}" ${l.locked ? 'disabled' : ''}><span class="vd">${Math.round(l.featherRadius ?? 24)}</span></div>
      <div class="cr"><span class="cr-lbl">VP X</span><input data-layer-id="${l.id}" data-prop="vpX" type="range" min="0" max="1" step="0.01" value="${f(l.vpX ?? 0.5)}" ${l.locked ? 'disabled' : ''}><span class="vd">${f(l.vpX ?? 0.5)}</span></div>
      <div class="cr"><span class="cr-lbl">VP Y</span><input data-layer-id="${l.id}" data-prop="vpY" type="range" min="0" max="1" step="0.01" value="${f(l.vpY ?? 0.5)}" ${l.locked ? 'disabled' : ''}><span class="vd">${f(l.vpY ?? 0.5)}</span></div>
      <div class="cr"><span class="cr-lbl">POS X</span><input data-layer-id="${l.id}" data-prop="x" type="range" min="0" max="1" step="0.01" value="${f(l.x)}" ${l.locked || S.strictRail ? 'disabled' : ''}><span class="vd">${f(l.x)}</span></div>
      <div class="cr"><span class="cr-lbl">POS Y</span><input data-layer-id="${l.id}" data-prop="y" type="range" min="0" max="1" step="0.01" value="${f(l.y)}" ${l.locked || S.strictRail ? 'disabled' : ''}><span class="vd">${f(l.y)}</span></div>
      <div class="cr"><span class="cr-lbl">BLUR</span><input data-layer-id="${l.id}" data-prop="blur" type="range" min="0" max="24" step="0.5" value="${l.blur}" ${l.locked ? 'disabled' : ''}><span class="vd">${Number(l.blur).toFixed(1)}</span></div>
      <div class="cr"><span class="cr-lbl">BRIGHTNESS</span><input data-layer-id="${l.id}" data-prop="brightness" type="range" min="0" max="3" step="0.05" value="${f(l.brightness)}" ${l.locked ? 'disabled' : ''}><span class="vd">${f(l.brightness)}</span></div>
      <div class="cr"><span class="cr-lbl">CONTRAST</span><input data-layer-id="${l.id}" data-prop="contrast" type="range" min="0" max="3" step="0.05" value="${f(l.contrast)}" ${l.locked ? 'disabled' : ''}><span class="vd">${f(l.contrast)}</span></div>
      <div class="cr"><span class="cr-lbl">SATURATE</span><input data-layer-id="${l.id}" data-prop="saturation" type="range" min="0" max="3" step="0.05" value="${f(l.saturation)}" ${l.locked ? 'disabled' : ''}><span class="vd">${f(l.saturation)}</span></div>
      <div class="cr" style="border-bottom:none"><span class="cr-lbl">BLEND</span><select data-layer-id="${l.id}" data-prop="blendMode" ${l.locked ? 'disabled' : ''}>${bOpts}</select></div>
    </div>
  </div>`;
}

function refreshPanel() {
  const list = $('layer-list');
  list.innerHTML = [...S.layers].sort((a, b) => b.zIndex - a.zIndex).map(layerHTML).join('');
  $('layers-badge').textContent = `${S.layers.length}/6`;
}

async function refreshLibrary() {
  const total = S.library.reduce((a, f) => a + f.images.length, 0);
  $('lib-badge').textContent = String(total);

  const row = $('folder-tabs-row');
  row.innerHTML = S.library.map((f) => `<div class="ftab${f.id === selection.activeFolderId ? ' active' : ''}" data-folder-id="${f.id}">${f.name} <span class="ftab-count">${f.images.length}</span></div>`).join('') + '<button class="ftab-new" id="new-folder-btn">+ FOLDER</button>';

  const folder = getActiveFolder();
  $('folder-name').textContent = folder?.name ?? '-';
  $('folder-img-count').textContent = `${folder?.images.length ?? 0} imgs`;

  const grid = $('img-grid');
  if (!folder || !folder.images.length) {
    grid.innerHTML = '<div class="grid-empty">DROP OR UPLOAD IMAGES<br>TO THIS FOLDER</div>';
    return;
  }

  const fid = folder.id;
  const cards = [];
  for (const img of folder.images) {
    const src = img.thumb || await resolveImageURL(img.imageId);
    cards.push(`<div class="igrid-thumb" title="${img.name}">
      <img src="${src}" onerror="this.style.display='none'">
      <div class="igrid-name">${img.name}</div>
      <div class="igrid-overlay" data-add-layer="${fid}:${img.id}">+</div>
      <div class="igrid-del" data-del-img="${fid}:${img.id}">X</div>
    </div>`);
  }
  grid.innerHTML = cards.join('');
}

function switchTab(tab) {
  selection.activeTab = tab;
  $('tab-library').style.display = tab === 'library' ? 'flex' : 'none';
  $('tab-layers').style.display = tab === 'layers' ? 'flex' : 'none';
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
}

function togglePlay() {
  S.playing = !S.playing;
  $('play-btn').textContent = S.playing ? '⏸' : '▶';
  $('play-btn').classList.toggle('playing', S.playing);
  if (S.playing && !runtime.rafId) startLoop();
}

function resetTime() {
  S.globalTime = 0;
  markDirty();
}

function toggleGuides() {
  S.showGuides = !S.showGuides;
  $('guides-btn').textContent = S.showGuides ? 'ON' : 'OFF';
  $('guides-btn').classList.toggle('on', S.showGuides);
}

function centerVP() {
  S.vp.x = 0.5;
  S.vp.y = 0.5;
  markDirty();
}

function toggleLockRail() {
  S.lockToRail = !S.lockToRail;
  markDirty();
}

function toggleStrictRail() {
  S.strictRail = !S.strictRail;
  if (S.strictRail && !S.lockToRail) S.lockToRail = true;
  refreshPanel();
  markDirty();
}

function startLoop() {
  runtime.lastTs = performance.now();
  (function tick(ts) {
    const dt = Math.min((ts - runtime.lastTs) / 1000, 0.05);
    runtime.lastTs = ts;
    if (S.playing) {
      S.globalTime += dt;
      $('time-out').textContent = S.globalTime.toFixed(3);
    }
    renderFrame();
    runtime.rafId = requestAnimationFrame(tick);
  })(performance.now());
}

function detectVP(img) {
  const FALLBACK = { x: 0.5, y: 0.5, confidence: 0 };
  const IW = 128;
  const IH = Math.max(2, Math.round((IW * img.naturalHeight) / (img.naturalWidth || 1)));
  const oc = document.createElement('canvas');
  oc.width = IW;
  oc.height = IH;
  const octx = oc.getContext('2d');
  octx.drawImage(img, 0, 0, IW, IH);
  let raw;
  try {
    raw = octx.getImageData(0, 0, IW, IH).data;
  } catch {
    return FALLBACK;
  }

  const gray = new Float32Array(IW * IH);
  for (let i = 0; i < IW * IH; i++) gray[i] = 0.299 * raw[i * 4] + 0.587 * raw[i * 4 + 1] + 0.114 * raw[i * 4 + 2];

  const Gx = new Float32Array(IW * IH);
  const Gy = new Float32Array(IW * IH);
  let maxMag = 0;
  for (let y = 1; y < IH - 1; y++) {
    for (let x = 1; x < IW - 1; x++) {
      const i = y * IW + x;
      const tl = gray[i - IW - 1]; const tc = gray[i - IW]; const tr = gray[i - IW + 1];
      const ml = gray[i - 1]; const mr = gray[i + 1];
      const bl = gray[i + IW - 1]; const bc = gray[i + IW]; const br = gray[i + IW + 1];
      Gx[i] = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      Gy[i] = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      const m = Math.hypot(Gx[i], Gy[i]);
      if (m > maxMag) maxMag = m;
    }
  }
  if (maxMag < 1) return FALLBACK;

  const AW = 48;
  const AH = Math.max(2, Math.round((AW * IH) / IW));
  const acc = new Float32Array(AW * AH);
  const threshold = maxMag * 0.22;
  const HALF_STEPS = 36;
  const STRIDE = Math.max(IW, IH) / HALF_STEPS;

  for (let y = 1; y < IH - 1; y++) {
    for (let x = 1; x < IW - 1; x++) {
      const i = y * IW + x;
      const gxv = Gx[i]; const gyv = Gy[i];
      const mag = Math.hypot(gxv, gyv);
      if (mag < threshold) continue;
      const tx = -gyv / mag;
      const ty = gxv / mag;
      for (let s = -HALF_STEPS; s <= HALF_STEPS; s++) {
        if (s === 0) continue;
        const vx = x + tx * s * STRIDE;
        const vy = y + ty * s * STRIDE;
        const ax = Math.floor((vx * AW) / IW);
        const ay = Math.floor((vy * AH) / IH);
        if (ax >= 0 && ax < AW && ay >= 0 && ay < AH) {
          acc[ay * AW + ax] += mag / (Math.abs(s) + 1);
        }
      }
    }
  }

  const acc2 = new Float32Array(AW * AH);
  for (let y = 1; y < AH - 1; y++) {
    for (let x = 1; x < AW - 1; x++) {
      const i = y * AW + x;
      acc2[i] = (
        acc[i - AW - 1] + acc[i - AW] * 2 + acc[i - AW + 1] +
        acc[i - 1] * 2 + acc[i] * 4 + acc[i + 1] * 2 +
        acc[i + AW - 1] + acc[i + AW] * 2 + acc[i + AW + 1]
      ) / 16;
    }
  }

  let peakVal = 0; let peakIdx = 0; let totalMass = 0;
  for (let i = 0; i < AW * AH; i++) {
    totalMass += acc2[i];
    if (acc2[i] > peakVal) {
      peakVal = acc2[i];
      peakIdx = i;
    }
  }

  const peakX = peakIdx % AW;
  const peakY = Math.floor(peakIdx / AW);
  const mean = totalMass / (AW * AH);
  const confidence = mean > 0 ? Math.min(1, (peakVal / mean - 1) / 9) : 0;
  const nx = (peakX + 0.5) / AW;
  const ny = (peakY + 0.5) / AH;
  if (confidence < 0.25) return { x: 0.5, y: 0.5, confidence };
  return { x: nx, y: ny, confidence };
}

function _ensureRadialBufs(W, H) {
  if (_eBuf.width !== W || _eBuf.height !== H) {
    _eBuf.width = W;
    _eBuf.height = H;
    _rBuf.width = W;
    _rBuf.height = H;
    _mBuf.width = W;
    _mBuf.height = H;
    _mfBuf.width = W;
    _mfBuf.height = H;
  }
}

function _layerGeo(layer, ph, vpX, vpY, W, H) {
  const effScale = phaseScale(ph, S.minScale, S.maxScale);
  const lx = layer.x * W;
  const ly = layer.y * H;
  let cx;
  let cy;
  if (S.strictRail) {
    cx = vpX;
    cy = vpY;
  } else if (S.lockToRail) {
    cx = vpX + (lx - vpX) * S.railDrift;
    cy = vpY + (ly - vpY) * S.railDrift;
  } else {
    cx = vpX + (lx - vpX) * effScale;
    cy = vpY + (ly - vpY) * effScale;
  }
  const baseW = W * layer.scale;
  const ar = layer.img.naturalHeight / (layer.img.naturalWidth || 1);
  return { effScale, cx, cy, drawW: baseW * effScale, drawH: baseW * ar * effScale };
}

function _drawOneLayer(tctx, layer, ph, vpX, vpY, W, H, alphaOverride, brightBoost) {
  const alpha = alphaOverride !== undefined ? alphaOverride : layer.opacity * phaseOpacity(ph, S.fadeInEnd, S.fadeOutStart);
  if (alpha < 0.002) return 1;
  const { effScale, cx, cy, drawW, drawH } = _layerGeo(layer, ph, vpX, vpY, W, H);
  tctx.save();
  tctx.globalAlpha = alpha;
  tctx.globalCompositeOperation = layer.blendMode;
  const fp = [];
  if (layer.blur > 0.1) fp.push(`blur(${layer.blur.toFixed(1)}px)`);
  const br = (brightBoost ?? 1) * layer.brightness;
  if (Math.abs(br - 1) > 0.001) fp.push(`brightness(${br.toFixed(3)})`);
  if (layer.contrast !== 1) fp.push(`contrast(${layer.contrast})`);
  if (layer.saturation !== 1) fp.push(`saturate(${layer.saturation})`);
  if (fp.length) tctx.filter = fp.join(' ');
  tctx.drawImage(layer.img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
  tctx.restore();
  return effScale;
}

function _sampleLuma(srcCanvas, cx, cy) {
  _sctx.clearRect(0, 0, 20, 20);
  _sctx.drawImage(srcCanvas, cx - 10, cy - 10, 20, 20, 0, 0, 20, 20);
  try {
    const d = _sctx.getImageData(0, 0, 20, 20).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / ((d.length / 4) * 255) || 0.5;
  } catch {
    return 0.5;
  }
}


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createFeatheredMask(maskCanvas, featherRadius) {
  const W = maskCanvas.width;
  const H = maskCanvas.height;
  _mfBctx.clearRect(0, 0, W, H);
  const radius = Math.max(0, Number(featherRadius) || 0);
  if (radius <= 0.01) {
    _mfBctx.drawImage(maskCanvas, 0, 0);
    return _mfBuf;
  }
  _mfBctx.filter = `blur(${radius.toFixed(2)}px)`;
  _mfBctx.drawImage(maskCanvas, 0, 0);
  _mfBctx.filter = 'none';
  return _mfBuf;
}

function getInnerLayerGeometry(layer, ph, W, H, vpX, vpY) {
  const localVpX = clamp((layer.vpX ?? vpX), 0, 1) * W;
  const localVpY = clamp((layer.vpY ?? vpY), 0, 1) * H;
  const effScale = phaseScale(ph, S.minScale, S.maxScale);
  const clampedScale = clamp(layer.scale, 0.01, 0.2);
  const baseW = W * clampedScale;
  const ar = layer.img.naturalHeight / (layer.img.naturalWidth || 1);
  const drawW = baseW * effScale;
  const drawH = baseW * ar * effScale;
  return { cx: localVpX, cy: localVpY, drawW, drawH, clampedScale, effScale };
}

function renderFrameRadial(vpX, vpY, W, H) {
  _ensureRadialBufs(W, H);
  const vis = S.layers.filter((l) => l.visible && l.img).sort((a, b) => {
    const da = ((S.globalTime * S.zoomSpeed + a.phaseOffset) % 1 + 1) % 1;
    const db = ((S.globalTime * S.zoomSpeed + b.phaseOffset) % 1 + 1) % 1;
    return da - db;
  });
  if (!vis.length) return 1;

  const inLayer = vis[vis.length - 1];
  const bgLayers = vis.slice(0, vis.length - 1);

  _eBctx.clearRect(0, 0, W, H);
  let currentZoom = 1;
  bgLayers.forEach((l) => {
    const ph = ((S.globalTime * S.zoomSpeed + l.phaseOffset) % 1 + 1) % 1;
    const es = _drawOneLayer(_eBctx, l, ph, vpX, vpY, W, H);
    if (l.id === selection.activeId) currentZoom = es;
  });

  const inPh = ((S.globalTime * S.zoomSpeed + inLayer.phaseOffset) % 1 + 1) % 1;
  const inAlpha = inLayer.opacity * phaseOpacity(inPh, S.fadeInEnd, S.fadeOutStart);
  const geom = getInnerLayerGeometry(inLayer, inPh, W, H, S.vp.x, S.vp.y);
  if (inLayer.id === selection.activeId) currentZoom = geom.effScale;

  _rBctx.clearRect(0, 0, W, H);
  let brightBoost = 1;
  if (S.autoMatch && inAlpha > 0.05) {
    _rBctx.save();
    _rBctx.globalAlpha = 1;
    _rBctx.globalCompositeOperation = inLayer.blendMode;
    _rBctx.drawImage(inLayer.img, geom.cx - geom.drawW / 2, geom.cy - geom.drawH / 2, geom.drawW, geom.drawH);
    _rBctx.restore();
    const bgLuma = _sampleLuma(_eBuf, geom.cx, geom.cy);
    const inLuma = _sampleLuma(_rBuf, geom.cx, geom.cy);
    brightBoost = inLuma > 0.01 ? Math.min(2.2, Math.max(0.45, bgLuma / inLuma)) : 1;
    _rBctx.clearRect(0, 0, W, H);
  }

  _rBctx.save();
  _rBctx.globalAlpha = inAlpha;
  _rBctx.globalCompositeOperation = inLayer.blendMode;
  const fp = [];
  if (inLayer.blur > 0.1) fp.push(`blur(${inLayer.blur.toFixed(1)}px)`);
  const br = brightBoost * inLayer.brightness;
  if (Math.abs(br - 1) > 0.001) fp.push(`brightness(${br.toFixed(3)})`);
  if (inLayer.contrast !== 1) fp.push(`contrast(${inLayer.contrast})`);
  if (inLayer.saturation !== 1) fp.push(`saturate(${inLayer.saturation})`);
  if (fp.length) _rBctx.filter = fp.join(' ');
  _rBctx.drawImage(inLayer.img, geom.cx - geom.drawW / 2, geom.cy - geom.drawH / 2, geom.drawW, geom.drawH);
  _rBctx.restore();

  _mBctx.clearRect(0, 0, W, H);
  _mBctx.fillStyle = '#000';
  _mBctx.fillRect(0, 0, W, H);
  _mBctx.fillStyle = '#fff';
  _mBctx.fillRect(geom.cx - geom.drawW / 2, geom.cy - geom.drawH / 2, geom.drawW, geom.drawH);

  const featheredMask = createFeatheredMask(_mBuf, inLayer.featherRadius ?? 24);

  _rBctx.save();
  _rBctx.globalCompositeOperation = 'destination-in';
  _rBctx.drawImage(featheredMask, 0, 0);
  _rBctx.restore();

  ctx.drawImage(_eBuf, 0, 0);
  ctx.drawImage(_rBuf, 0, 0);

  if (S.showGuides) {
    ctx.save();
    ctx.strokeStyle = 'rgba(63, 232, 197, 0.8)';
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(geom.cx - geom.drawW / 2, geom.cy - geom.drawH / 2, geom.drawW, geom.drawH);
    ctx.setLineDash([]);
    const grad = ctx.createLinearGradient(geom.cx - geom.drawW / 2, geom.cy, geom.cx + geom.drawW / 2, geom.cy);
    grad.addColorStop(0, 'rgba(0,0,0,0.1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = grad;
    ctx.fillRect(geom.cx - geom.drawW / 2, geom.cy - 1, geom.drawW, 2);
    ctx.beginPath();
    ctx.arc(geom.cx, geom.cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.restore();
  }

  return currentZoom;
}


function renderFrame() {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const vpX = S.vp.x * W;
  const vpY = S.vp.y * H;

  if (S.showGuides) {
    ctx.save();
    ctx.strokeStyle = 'rgba(232,124,63,0.09)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    [[0, 0], [W, 0], [0, H], [W, H], [W * 0.5, 0], [W * 0.5, H], [0, H * 0.5], [W, H * 0.5]].forEach(([cx0, cy0]) => {
      ctx.beginPath();
      ctx.moveTo(cx0, cy0);
      ctx.lineTo(vpX, vpY);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  const sorted = [...S.layers].sort((a, b) => a.zIndex - b.zIndex);
  let currentZoom = 1;

  if (S.radialBlend && S.layers.some((l) => l.visible && l.img)) {
    currentZoom = renderFrameRadial(vpX, vpY, W, H);
  } else {
    sorted.forEach((layer) => {
      if (!layer.visible || !layer.img) return;
      const ph = ((S.globalTime * S.zoomSpeed + layer.phaseOffset) % 1 + 1) % 1;
      const effScale = phaseScale(ph, S.minScale, S.maxScale);
      const alpha = layer.opacity * phaseOpacity(ph, S.fadeInEnd, S.fadeOutStart);
      if (alpha < 0.002) return;
      if (layer.id === selection.activeId) currentZoom = effScale;

      const lx = layer.x * W;
      const ly = layer.y * H;
      let drawCX;
      let drawCY;
      if (S.strictRail) {
        drawCX = vpX;
        drawCY = vpY;
      } else if (S.lockToRail) {
        drawCX = vpX + (lx - vpX) * S.railDrift;
        drawCY = vpY + (ly - vpY) * S.railDrift;
      } else {
        drawCX = vpX + (lx - vpX) * effScale;
        drawCY = vpY + (ly - vpY) * effScale;
      }
      const baseW = W * layer.scale;
      const ar = layer.img.naturalHeight / (layer.img.naturalWidth || 1);
      const drawW = baseW * effScale;
      const drawH = baseW * ar * effScale;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = layer.blendMode;
      const fp = [];
      if (layer.blur > 0.1) fp.push(`blur(${layer.blur.toFixed(1)}px)`);
      if (layer.brightness !== 1) fp.push(`brightness(${layer.brightness})`);
      if (layer.contrast !== 1) fp.push(`contrast(${layer.contrast})`);
      if (layer.saturation !== 1) fp.push(`saturate(${layer.saturation})`);
      if (fp.length) ctx.filter = fp.join(' ');
      ctx.drawImage(layer.img, drawCX - drawW / 2, drawCY - drawH / 2, drawW, drawH);
      ctx.restore();
    });
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(vpX, vpY, 7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(232,124,63,0.85)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(vpX, vpY, 11, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(232,124,63,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(vpX, vpY, 17, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(232,124,63,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  if (S.vignette > 0.01) {
    const cx0 = W / 2;
    const cy0 = H / 2;
    const r = Math.sqrt(cx0 * cx0 + cy0 * cy0);
    const g = ctx.createRadialGradient(cx0, cy0, r * (1 - S.vignette * 0.85), cx0, cy0, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(S.vignette * 0.9).toFixed(2)})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (S.fadeColor && S.fadeAmount > 0.001) {
    ctx.save();
    ctx.globalAlpha = S.fadeAmount;
    ctx.fillStyle = S.fadeColor;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  $('vp-x').textContent = S.vp.x.toFixed(3);
  $('vp-y').textContent = S.vp.y.toFixed(3);
  $('zoom-out').textContent = `x${currentZoom.toFixed(2)}`;
}

function vpFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
    y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
  };
}

function serializeSession(includeRuntime = false) {
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    projectId: S.projectId,
    projectName: S.projectName,
    updatedAt: Date.now(),
    vanishingPoint: { ...S.vp },
    zoomSpeed: S.zoomSpeed,
    minScale: S.minScale,
    maxScale: S.maxScale,
    fadeInEnd: S.fadeInEnd,
    fadeOutStart: S.fadeOutStart,
    vignette: S.vignette,
    fadeColor: S.fadeColor,
    fadeAmount: S.fadeAmount,
    lockToRail: S.lockToRail,
    strictRail: S.strictRail,
    railDrift: S.railDrift,
    radialBlend: S.radialBlend,
    centerRadius: S.centerRadius,
    blendWidth: S.blendWidth,
    edgeHold: S.edgeHold,
    edgeBlur: S.edgeBlur,
    autoMatch: S.autoMatch,
    uploadOnlyMode: S.uploadOnlyMode,
    useProxy: S.useProxy,
    library: S.library.map((f) => ({
      id: f.id,
      name: f.name,
      images: f.images.map((i) => ({
        id: i.id,
        imageId: i.imageId,
        sourceType: i.sourceType || 'local',
        sourceUrl: i.sourceUrl || '',
        thumb: i.thumb || '',
        name: i.name
      }))
    })),
    layers: S.layers.map((l) => ({
      id: l.id,
      imageId: l.imageId,
      thumb: l.thumb,
      name: l.name,
      x: l.x,
      y: l.y,
      scale: l.scale,
      featherRadius: l.featherRadius,
      vpX: l.vpX,
      vpY: l.vpY,
      phaseOffset: l.phaseOffset,
      opacity: l.opacity,
      blur: l.blur,
      brightness: l.brightness,
      contrast: l.contrast,
      saturation: l.saturation,
      blendMode: l.blendMode,
      zIndex: l.zIndex,
      visible: l.visible,
      locked: l.locked
    })),
    ui: includeRuntime ? {
      globalTime: S.globalTime,
      activeFolderId: selection.activeFolderId,
      activeId: selection.activeId,
      selectedIds: [...selection.selectedIds]
    } : undefined
  };
}

async function hydrateLayers(dataLayers) {
  const out = [];
  for (const ld of dataLayers || []) {
    const imageURL = await resolveImageURL(ld.imageId);
    if (!imageURL) continue;
    const img = new Image();
    await new Promise((res) => {
      img.onload = res;
      img.onerror = res;
      img.src = imageURL;
    });
    if (!img.naturalWidth) continue;
    const l = mkLayer(img, ld.imageId, ld.thumb || '', ld.name || 'LAYER');
    Object.assign(l, {
      x: ld.x ?? 0.5,
      y: ld.y ?? 0.5,
      scale: clamp(ld.scale ?? 1, 0.01, 0.2),
      featherRadius: Math.max(0, ld.featherRadius ?? 24),
      vpX: clamp(ld.vpX ?? 0.5, 0, 1),
      vpY: clamp(ld.vpY ?? 0.5, 0, 1),
      phaseOffset: ld.phaseOffset ?? 0,
      opacity: ld.opacity ?? 1,
      blur: ld.blur ?? 0,
      brightness: ld.brightness ?? 1,
      contrast: ld.contrast ?? 1,
      saturation: ld.saturation ?? 1,
      blendMode: ld.blendMode || 'source-over',
      zIndex: ld.zIndex ?? 0,
      visible: ld.visible !== false,
      locked: ld.locked === true
    });
    out.push(l);
  }
  return out;
}

async function applyState(data, opts = {}) {
  const v = validateSessionShape(data);
  if (!v.ok) {
    showToast(`Invalid session: ${v.message}`, 'err', 3800);
    return;
  }
  const s = migrateSession(data);

  S.projectId = s.projectId || S.projectId;
  S.projectName = s.projectName || 'Untitled Project';
  S.vp = { ...s.vanishingPoint };
  S.zoomSpeed = s.zoomSpeed;
  S.minScale = s.minScale;
  S.maxScale = s.maxScale;
  S.fadeInEnd = s.fadeInEnd;
  S.fadeOutStart = s.fadeOutStart;
  S.vignette = s.vignette;
  S.fadeColor = s.fadeColor;
  S.fadeAmount = s.fadeAmount;
  S.lockToRail = s.lockToRail;
  S.strictRail = s.strictRail;
  S.railDrift = s.railDrift;
  S.radialBlend = s.radialBlend;
  S.centerRadius = s.centerRadius;
  S.blendWidth = s.blendWidth;
  S.edgeHold = s.edgeHold;
  S.edgeBlur = s.edgeBlur;
  S.autoMatch = s.autoMatch;
  S.uploadOnlyMode = s.uploadOnlyMode;
  S.useProxy = s.useProxy;

  S.library = (s.library || []).map((f) => ({
    id: f.id || uid('f'),
    name: (f.name || 'UNSORTED').toUpperCase(),
    images: (f.images || []).map((i) => ({
      id: i.id || uid('li'),
      imageId: i.imageId,
      sourceType: i.sourceType || 'local',
      sourceUrl: i.sourceUrl || '',
      thumb: i.thumb || '',
      name: i.name || 'IMAGE'
    }))
  }));

  if (!S.library.length) {
    const defaults = ['UNSORTED', 'NATURE', 'URBAN', 'ABSTRACT', 'TEXTURE', 'PORTRAITS'];
    S.library = defaults.map(mkFolder);
  }

  selection.activeFolderId = selection.activeFolderId && S.library.some((f) => f.id === selection.activeFolderId)
    ? selection.activeFolderId
    : S.library[0].id;

  S.layers = await hydrateLayers(s.layers || []);
  selection.activeId = S.layers.length ? S.layers[0].id : null;
  selection.selectedIds = new Set(selection.activeId ? [selection.activeId] : []);

  syncUiFromState();
  await refreshLibrary();
  refreshPanel();
  if (S.layers.length) $('empty-state').style.display = 'none';
  else $('empty-state').style.display = '';

  if (!runtime.rafId) startLoop();
  if (!opts.skipHistory) commitHistory();
}

async function saveProject(nameOverride = '') {
  if (!S.projectId) S.projectId = uid('p');
  if (nameOverride) S.projectName = nameOverride;
  const data = serializeSession(true);
  await putProject({ id: S.projectId, name: S.projectName, updatedAt: Date.now(), data });
  await putMeta('lastProjectId', S.projectId);

  const existing = await getMeta('recents') || [];
  const next = [{ id: S.projectId, name: S.projectName, updatedAt: Date.now() }, ...existing.filter((x) => x.id !== S.projectId)].slice(0, 8);
  await putMeta('recents', next);

  await renderRecents();
  await renderProjectManager();
}

let autosavePending = false;
function queueAutosave() {
  if (autosavePending) return;
  autosavePending = true;
  clearTimeout(runtime.autosaveTimer);
  runtime.autosaveTimer = setTimeout(async () => {
    autosavePending = false;
    try {
      await saveProject();
      $('version-tag').textContent = `${APP_VERSION} SAVED`;
      setTimeout(() => {
        $('version-tag').textContent = `V${APP_VERSION}`;
      }, 1200);
    } catch {
      showToast('Autosave failed.', 'err');
    }
  }, 900);
}

async function doSaveJson() {
  const data = serializeSession(false);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${safeFileBase(S.projectName)}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Session JSON exported (without image binaries).', 'ok');
}

function doLoadJson() {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
  inp.onchange = async (e) => {
    try {
      const txt = await e.target.files[0].text();
      const parsed = JSON.parse(txt);
      const validation = validateSessionShape(parsed);
      if (!validation.ok) throw new Error(validation.message);
      await applyState(parsed);
      queueAutosave();
      showToast('Session loaded.', 'ok');
    } catch (err) {
      showToast(`Invalid JSON: ${err.message || 'Parse error.'}`, 'err', 4000);
    }
  };
  inp.click();
}

async function renderRecents() {
  const items = await getMeta('recents');
  const recents = Array.isArray(items) ? items : [];
  if (!recents.length) {
    $('recent-projects').innerHTML = '<div class="recent-time">No saved projects yet.</div>';
    return;
  }
  $('recent-projects').innerHTML = recents.map((r) => `
    <div class="recent-item">
      <div style="min-width:0;flex:1">
        <div class="recent-name">${r.name || 'Untitled Project'}</div>
        <div class="recent-time">${new Date(r.updatedAt).toLocaleString()}</div>
      </div>
      <button class="btn" data-open-project="${r.id}">OPEN</button>
    </div>`).join('');
}

async function openProject(projectId) {
  const p = await getProject(projectId);
  if (!p?.data) {
    showToast('Project not found.', 'err');
    return;
  }
  await applyState(p.data);
  S.projectId = p.id;
  S.projectName = p.name || 'Untitled Project';
  await putMeta('lastProjectId', S.projectId);
  await saveProject();
  showToast(`Opened ${S.projectName}.`, 'ok');
}

async function updateRecentsFromProjects() {
  const all = await getAllProjects();
  const sorted = all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 8);
  await putMeta('recents', sorted.map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt })));
}

async function renderProjectManager() {
  const projects = (await getAllProjects()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const wrap = $('project-manager');
  if (!projects.length) {
    wrap.innerHTML = '<div class="recent-time">No projects found.</div>';
    return;
  }

  wrap.innerHTML = projects.map((p) => `
    <div class="project-item">
      <div class="project-head">
        <div class="recent-name">${p.name || 'Untitled Project'}</div>
        <div class="recent-time">${new Date(p.updatedAt || Date.now()).toLocaleDateString()}</div>
      </div>
      <div class="project-actions">
        <button class="btn" data-pact="open" data-pid="${p.id}">OPEN</button>
        <button class="btn" data-pact="rename" data-pid="${p.id}">RENAME</button>
        <button class="btn" data-pact="dup" data-pid="${p.id}">DUP</button>
        <button class="btn danger" data-pact="del" data-pid="${p.id}">DEL</button>
      </div>
    </div>
  `).join('');
}

async function restoreLastProject() {
  const id = await getMeta('lastProjectId');
  if (!id) return false;
  const p = await getProject(id);
  if (!p?.data) return false;
  await applyState(p.data, { skipHistory: true });
  commitHistory();
  showToast('Recovered last project.', 'ok');
  return true;
}

async function createDefaultProject() {
  if (!S.library.length) {
    ['UNSORTED', 'NATURE', 'URBAN', 'ABSTRACT', 'TEXTURE', 'PORTRAITS'].forEach((name, i) => {
      const f = mkFolder(name);
      S.library.push(f);
      if (i === 0) selection.activeFolderId = f.id;
    });
  }
  await refreshLibrary();
  refreshPanel();
  commitHistory();
}

function syncUiFromState() {
  $('speed-slider').value = String(S.zoomSpeed);
  $('spd-v').textContent = S.zoomSpeed.toFixed(2);
  $('min-scale').value = String(S.minScale);
  $('max-scale').value = String(S.maxScale);
  $('fade-in').value = String(S.fadeInEnd);
  $('fade-out').value = String(S.fadeOutStart);
  $('vignette').value = String(S.vignette);
  $('fade-amt').value = String(S.fadeAmount);
  $('fade-color').value = S.fadeColor;
  $('mins-v').textContent = S.minScale.toFixed(2);
  $('maxs-v').textContent = S.maxScale.toFixed(1);
  $('fi-v').textContent = S.fadeInEnd.toFixed(2);
  $('fo-v').textContent = S.fadeOutStart.toFixed(2);
  $('vig-v').textContent = S.vignette.toFixed(2);
  $('famt-v').textContent = S.fadeAmount.toFixed(2);
  $('guides-btn').textContent = S.showGuides ? 'ON' : 'OFF';
  $('guides-btn').classList.toggle('on', S.showGuides);
  $('proxy-toggle').textContent = S.useProxy ? 'PROXY ON' : 'PROXY OFF';
  $('proxy-toggle').classList.toggle('on', S.useProxy);
  $('upload-only-toggle').textContent = S.uploadOnlyMode ? 'UPLOAD ONLY ON' : 'UPLOAD ONLY OFF';
  $('upload-only-toggle').classList.toggle('on', S.uploadOnlyMode);
}

function setLayerProp(id, prop, value) {
  const l = getLayer(id);
  if (!l || l.locked) return;
  if (prop === 'blendMode') {
    l[prop] = value;
  } else {
    const n = Number(value);
    if (prop === 'scale') l[prop] = clamp(n, 0.01, 0.2);
    else if (prop === 'vpX' || prop === 'vpY') l[prop] = clamp(n, 0, 1);
    else if (prop === 'featherRadius') l[prop] = Math.max(0, n);
    else l[prop] = n;
  }
  markDirty();
}

function bindEvents() {
  window.addEventListener('resize', () => {
    resizeCanvas();
    renderFrame();
  });

  canvas.addEventListener('mousedown', (e) => {
    runtime.isDragging = true;
    const v = vpFromEvent(e);
    S.vp.x = v.x;
    S.vp.y = v.y;
    markDirty();
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!runtime.isDragging) return;
    const v = vpFromEvent(e);
    S.vp.x = v.x;
    S.vp.y = v.y;
  });
  canvas.addEventListener('mouseup', () => {
    runtime.isDragging = false;
  });
  canvas.addEventListener('mouseleave', () => {
    runtime.isDragging = false;
  });

  $('play-btn').addEventListener('click', togglePlay);
  $('reset-time-btn').addEventListener('click', resetTime);
  $('guides-btn').addEventListener('click', toggleGuides);
  $('center-vp-btn').addEventListener('click', centerVP);
  $('save-json-btn').addEventListener('click', doSaveJson);
  $('load-json-btn').addEventListener('click', doLoadJson);
  $('save-project-btn').addEventListener('click', async () => {
    const name = prompt('Project name:', S.projectName) || S.projectName;
    S.projectName = name.trim() || 'Untitled Project';
    await saveProject();
    showToast('Project saved.', 'ok');
  });

  $('about-btn').addEventListener('click', () => {
    $('help-modal').style.display = 'flex';
  });
  $('close-help-btn').addEventListener('click', () => {
    $('help-modal').style.display = 'none';
  });

  $('speed-slider').addEventListener('input', (e) => {
    S.zoomSpeed = Number(e.target.value);
    $('spd-v').textContent = S.zoomSpeed.toFixed(2);
    markDirty();
  });

  updateSliderOut('min-scale', 'mins-v', 'minScale', 2);
  updateSliderOut('max-scale', 'maxs-v', 'maxScale', 1);
  updateSliderOut('fade-in', 'fi-v', 'fadeInEnd', 2);
  updateSliderOut('fade-out', 'fo-v', 'fadeOutStart', 2);
  updateSliderOut('vignette', 'vig-v', 'vignette', 2);
  updateSliderOut('fade-amt', 'famt-v', 'fadeAmount', 2);
  $('fade-color').addEventListener('change', (e) => {
    S.fadeColor = e.target.value;
    markDirty();
  });

  $('proxy-toggle').addEventListener('click', () => {
    S.useProxy = !S.useProxy;
    syncUiFromState();
    markDirty();
  });
  $('upload-only-toggle').addEventListener('click', () => {
    S.uploadOnlyMode = !S.uploadOnlyMode;
    syncUiFromState();
    markDirty();
  });

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  $('rename-folder-btn').addEventListener('click', () => {
    const folder = getActiveFolder();
    if (!folder) return;
    const name = prompt('Rename folder:', folder.name);
    if (!name || !name.trim()) return;
    folder.name = name.trim().toUpperCase();
    refreshLibrary();
    markDirty();
  });

  $('delete-folder-btn').addEventListener('click', () => {
    const folder = getActiveFolder();
    if (!folder) return;
    if (S.library.length <= 1) {
      showToast('Cannot delete the last folder.', 'warn');
      return;
    }
    if (!confirm(`Delete ${folder.name} and its images?`)) return;
    S.library = S.library.filter((f) => f.id !== folder.id);
    selection.activeFolderId = S.library[0].id;
    refreshLibrary();
    markDirty();
  });

  $('folder-tabs-row').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-folder-id]');
    if (tab) {
      selection.activeFolderId = tab.dataset.folderId;
      refreshLibrary();
      return;
    }
    const addBtn = e.target.closest('#new-folder-btn');
    if (addBtn) {
      const name = prompt('New folder name:');
      if (!name || !name.trim()) return;
      const f = mkFolder(name.trim());
      S.library.push(f);
      selection.activeFolderId = f.id;
      refreshLibrary();
      markDirty();
    }
  });

  $('lib-file-input').addEventListener('change', async (e) => {
    await handleLibFiles(Array.from(e.target.files || []));
    e.target.value = '';
    commitHistory();
  });

  $('lib-folder-input').addEventListener('change', async (e) => {
    await handleLibFolderFiles(recordsFromFiles(Array.from(e.target.files || [])));
    e.target.value = '';
    commitHistory();
  });

  $('upload-folder-btn').addEventListener('click', () => $('lib-folder-input').click());

  $('lib-upload-zone').addEventListener('click', () => $('lib-file-input').click());
  $('lib-upload-zone').addEventListener('dragover', (e) => {
    e.preventDefault();
    $('lib-upload-zone').classList.add('drag-over');
  });
  $('lib-upload-zone').addEventListener('dragleave', () => {
    $('lib-upload-zone').classList.remove('drag-over');
  });
  $('lib-upload-zone').addEventListener('drop', async (e) => {
    e.preventDefault();
    $('lib-upload-zone').classList.remove('drag-over');
    const records = await extractDropRecords(e.dataTransfer);
    const hasFolderShape = records.some((r) => (r.relativePath || '').includes('/'));
    if (hasFolderShape) await handleLibFolderFiles(records);
    else await handleLibFiles(records.map((r) => r.file));
    commitHistory();
  });

  $('canvas-area').addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  $('canvas-area').addEventListener('drop', async (e) => {
    e.preventDefault();
    const records = await extractDropRecords(e.dataTransfer);
    const hasFolderShape = records.some((r) => (r.relativePath || '').includes('/'));
    if (hasFolderShape) await handleLibFolderFiles(records);
    else await handleLibFiles(records.map((r) => r.file));
    switchTab('library');
    commitHistory();
  });

  $('add-url-btn').addEventListener('click', addLibFromURL);
  $('lib-url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addLibFromURL();
  });

  $('img-grid').addEventListener('click', async (e) => {
    const add = e.target.closest('[data-add-layer]');
    if (add) {
      const [folderId, imgId] = add.dataset.addLayer.split(':');
      await addLibImageAsLayer(folderId, imgId);
      return;
    }
    const del = e.target.closest('[data-del-img]');
    if (del) {
      const [folderId, imgId] = del.dataset.delImg.split(':');
      await removeLibImage(folderId, imgId);
      commitHistory();
    }
  });

  $('layer-list').addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const id = actionEl.dataset.layerId;
    if (action === 'select') {
      setActiveLayer(id, e.ctrlKey || e.metaKey);
      return;
    }
    const l = getLayer(id);
    if (!l) return;
    if (action === 'vis') l.visible = !l.visible;
    if (action === 'lock') l.locked = !l.locked;
    if (action === 'del') removeLayer(id);
    refreshPanel();
    markDirty();
    commitHistory();
  });

  $('layer-list').addEventListener('input', (e) => {
    const el = e.target;
    if (!el.dataset.layerId || !el.dataset.prop) return;
    setLayerProp(el.dataset.layerId, el.dataset.prop, el.value);
    const vd = el.nextElementSibling;
    if (vd) {
      const prop = el.dataset.prop;
      if (prop === 'blur') vd.textContent = Number(el.value).toFixed(1);
      else if (prop === 'featherRadius') vd.textContent = String(Math.round(Number(el.value)));
      else vd.textContent = Number(el.value).toFixed(2);
    }
  });

  $('layer-list').addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset.layerId || !el.dataset.prop) return;
    setLayerProp(el.dataset.layerId, el.dataset.prop, el.value);
    commitHistory();
  });

  $('auto-stagger-btn').addEventListener('click', () => {
    normalizeRailSpacing();
    commitHistory();
  });

  $('dup-selected-btn').addEventListener('click', duplicateSelectedLayers);
  $('del-selected-btn').addEventListener('click', removeSelectedLayers);
  $('front-selected-btn').addEventListener('click', moveSelectedToFront);
  $('back-selected-btn').addEventListener('click', moveSelectedToBack);

  $('new-project-btn').addEventListener('click', async () => {
    const name = prompt('New project name:', 'My Runnyvision Tunnel Maker Project');
    if (!name || !name.trim()) return;
    S.projectId = uid('p');
    S.projectName = name.trim();
    S.globalTime = 0;
    S.layers = [];
    S.library = [];
    selection.activeId = null;
    selection.selectedIds = new Set();
    ['UNSORTED', 'NATURE', 'URBAN', 'ABSTRACT', 'TEXTURE', 'PORTRAITS'].forEach((n, i) => {
      const f = mkFolder(n);
      S.library.push(f);
      if (i === 0) selection.activeFolderId = f.id;
    });
    await saveProject();
    refreshPanel();
    await refreshLibrary();
    showToast('New project created.', 'ok');
  });

  $('refresh-projects-btn').addEventListener('click', async () => {
    await updateRecentsFromProjects();
    await renderProjectManager();
    await renderRecents();
    showToast('Project list refreshed.', 'ok');
  });

  $('project-manager').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-pact]');
    if (!btn) return;
    const action = btn.dataset.pact;
    const pid = btn.dataset.pid;
    const target = await getProject(pid);
    if (!target) {
      showToast('Project not found.', 'err');
      return;
    }

    if (action === 'open') {
      await openProject(pid);
      return;
    }

    if (action === 'rename') {
      const next = prompt('Rename project:', target.name || 'Untitled Project');
      if (!next || !next.trim()) return;
      target.name = next.trim();
      target.updatedAt = Date.now();
      if (target.data) {
        target.data.projectName = target.name;
        target.data.updatedAt = target.updatedAt;
      }
      await putProject(target);
      await updateRecentsFromProjects();
      await renderProjectManager();
      await renderRecents();
      if (S.projectId === target.id) S.projectName = target.name;
      showToast('Project renamed.', 'ok');
      return;
    }

    if (action === 'dup') {
      const copyId = uid('p');
      const copyName = `${target.name || 'Untitled Project'} Copy`;
      const dataCopy = structuredClone(target.data || {});
      dataCopy.projectId = copyId;
      dataCopy.projectName = copyName;
      dataCopy.updatedAt = Date.now();
      await putProject({ id: copyId, name: copyName, updatedAt: Date.now(), data: dataCopy });
      await updateRecentsFromProjects();
      await renderProjectManager();
      await renderRecents();
      showToast('Project duplicated.', 'ok');
      return;
    }

    if (action === 'del') {
      if (!confirm(`Delete ${target.name || 'Untitled Project'}?`)) return;
      await deleteProject(pid);
      if (S.projectId === pid) {
        const all = (await getAllProjects()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        if (all[0]) await openProject(all[0].id);
        else {
          S.projectId = uid('p');
          S.projectName = 'My Runnyvision Tunnel Maker Project';
          S.layers = [];
          selection.activeId = null;
          selection.selectedIds = new Set();
          await saveProject();
          refreshPanel();
          await refreshLibrary();
        }
      }
      await updateRecentsFromProjects();
      await renderProjectManager();
      await renderRecents();
      showToast('Project deleted.', 'warn');
    }
  });

  $('recent-projects').addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open-project]');
    if (!open) return;
    await openProject(open.dataset.openProject);
  });

  window.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      togglePlay();
      return;
    }
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'z' && e.shiftKey) {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateSelectedLayers();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        removeSelectedLayers();
      }
    }
  });

  $('export-mp4-btn').addEventListener('click', () => exportMP4());
  $('export-webm-btn').addEventListener('click', () => exportWebM());
  $('export-seq-btn').addEventListener('click', () => exportImageSequence());
  $('cancel-export-btn').addEventListener('click', () => {
    if (runtime.exportJob) {
      runtime.exportJob.cancelled = true;
      runtime.exportJob.controller?.abort();
    }
  });

  window.addEventListener('beforeunload', () => {
    saveProject().catch(() => undefined);
  });
}

function getQualityPreset() {
  const p = $('quality-preset').value;
  if (p === 'draft') return { width: 1280, height: 720, fps: 24, seconds: 8 };
  if (p === 'hq') return { width: 2560, height: 1440, fps: 60, seconds: 10 };
  return { width: 1920, height: 1080, fps: 30, seconds: 8 };
}

function showExportOverlay(meta = '') {
  $('export-overlay').style.display = 'flex';
  $('export-progress-fill').style.width = '0%';
  $('export-meta').textContent = meta;
}

function hideExportOverlay() {
  $('export-overlay').style.display = 'none';
}

function setExportProgress(pct, meta = '') {
  $('export-progress-fill').style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (meta) $('export-meta').textContent = meta;
}

async function exportWebM() {
  const blob = await renderWebMBlob();
  if (!blob) return;
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `${safeFileBase(S.projectName)}-${Date.now()}.webm`
  });
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('WebM export complete.', 'ok');
}

async function renderWebMBlob() {
  if (runtime.exportJob) return null;
  const q = getQualityPreset();
  showExportOverlay(`Preparing ${q.width}x${q.height} @${q.fps}fps`);

  runtime.exportJob = { cancelled: false };
  const old = { playing: S.playing, t: S.globalTime };
  const stream = canvas.captureStream(q.fps);
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
  rec.ondataavailable = (ev) => {
    if (ev.data?.size) chunks.push(ev.data);
  };

  rec.start();
  S.playing = false;

  const frames = q.fps * q.seconds;
  const step = 1 / q.fps;
  for (let i = 0; i < frames; i++) {
    if (runtime.exportJob.cancelled) break;
    S.globalTime += step;
    renderFrame();
    setExportProgress((i / frames) * 100, `Frame ${i + 1} / ${frames}`);
    await new Promise((r) => setTimeout(r, 0));
  }

  rec.stop();
  await new Promise((r) => {
    rec.onstop = r;
  });

  S.playing = old.playing;
  S.globalTime = old.t;

  if (runtime.exportJob.cancelled) {
    runtime.exportJob = null;
    hideExportOverlay();
    showToast('Export cancelled.', 'warn');
    return null;
  }

  const blob = new Blob(chunks, { type: 'video/webm' });
  runtime.exportJob = null;
  hideExportOverlay();
  return blob;
}

async function exportMP4() {
  const webm = await renderWebMBlob();
  if (!webm) return;
  showExportOverlay('Transcoding to MP4 on server...');

  const ctrl = new AbortController();
  runtime.exportJob = { cancelled: false, controller: ctrl };

  try {
    const fd = new FormData();
    fd.append('video', webm, `${safeFileBase(S.projectName)}.webm`);
    const r = await fetch('/api/transcode/mp4', {
      method: 'POST',
      body: fd,
      signal: ctrl.signal
    });

    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error || `Server returned ${r.status}`);
    }

    const mp4 = await r.blob();
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(mp4),
      download: `${safeFileBase(S.projectName)}-${Date.now()}.mp4`
    });
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('MP4 export complete.', 'ok');
  } catch (err) {
    if (ctrl.signal.aborted) showToast('MP4 export cancelled.', 'warn');
    else showToast(`MP4 export failed: ${err.message || err}`, 'err', 4500);
  } finally {
    runtime.exportJob = null;
    hideExportOverlay();
  }
}

async function exportImageSequence() {
  if (runtime.exportJob) return;
  if (!window.JSZip) {
    showToast('JSZip not loaded; cannot create ZIP.', 'err');
    return;
  }
  const q = getQualityPreset();
  showExportOverlay(`Rendering PNG sequence ZIP at ${q.fps}fps`);
  runtime.exportJob = { cancelled: false };

  const old = { t: S.globalTime, playing: S.playing };
  S.playing = false;
  const zip = new window.JSZip();

  const frames = Math.min(180, q.fps * q.seconds);
  const step = 1 / q.fps;
  for (let i = 0; i < frames; i++) {
    if (runtime.exportJob.cancelled) break;
    S.globalTime += step;
    renderFrame();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    zip.file(`${safeFileBase(S.projectName)}-frame-${String(i).padStart(4, '0')}.png`, blob);
    setExportProgress((i / frames) * 80, `Frame ${i + 1} / ${frames}`);
    await new Promise((r) => setTimeout(r, 12));
  }

  if (!runtime.exportJob.cancelled) {
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (meta) => {
      setExportProgress(80 + meta.percent * 0.2, `Packaging ZIP ${meta.percent.toFixed(0)}%`);
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = `${safeFileBase(S.projectName)}-png-sequence-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('PNG ZIP export complete.', 'ok');
  } else {
    showToast('Export cancelled.', 'warn');
  }

  S.globalTime = old.t;
  S.playing = old.playing;
  runtime.exportJob = null;
  hideExportOverlay();
}

async function bootstrap() {
  $('version-tag').textContent = `V${APP_VERSION}`;
  resizeCanvas();
  bindEvents();
  await createDefaultProject();
  await renderRecents();
  await renderProjectManager();

  const restored = await restoreLastProject();
  if (!restored) await saveProject('My Runnyvision Tunnel Maker Project');

  syncUiFromState();
  refreshPanel();
  await refreshLibrary();
  renderFrame();
  startLoop();
  hideSplash();
}

bootstrap().catch((err) => {
  showToast(`Startup error: ${err.message || err}`, 'err', 6000);
});
