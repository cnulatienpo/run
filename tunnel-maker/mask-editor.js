const stage = document.getElementById('stage');
const canvas = document.getElementById('maskCanvas');
const ctx = canvas.getContext('2d');

const toolSelect = document.getElementById('toolSelect');
const featherSlider = document.getElementById('featherSlider');
const featherValue = document.getElementById('featherValue');
const invertToggle = document.getElementById('invertToggle');
const saveMaskBtn = document.getElementById('saveMaskBtn');
const loadMaskBtn = document.getElementById('loadMaskBtn');
const maskJson = document.getElementById('maskJson');

let currentShape = null;
let dragState = null;
const HANDLE_SIZE = 8;

function resizeCanvas() {
  const rect = stage.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  draw();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function normalizeRect(shape) {
  const left = Math.min(shape.x, shape.x + shape.width);
  const top = Math.min(shape.y, shape.y + shape.height);
  const width = Math.abs(shape.width);
  const height = Math.abs(shape.height);
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function getBoundingRect(shape) {
  if (!shape) return null;
  if (shape.shape === 'freehand') {
    const xs = shape.path.map((p) => p.x);
    const ys = shape.path.map((p) => p.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    return { left, top, width: right - left, height: bottom - top, right, bottom };
  }
  return normalizeRect(shape);
}

function getHandles(rect) {
  return {
    nw: { x: rect.left, y: rect.top },
    ne: { x: rect.right, y: rect.top },
    sw: { x: rect.left, y: rect.bottom },
    se: { x: rect.right, y: rect.bottom }
  };
}

function hitHandle(pos) {
  if (!currentShape) return null;
  const rect = getBoundingRect(currentShape);
  const handles = getHandles(rect);
  for (const [name, point] of Object.entries(handles)) {
    if (Math.abs(pos.x - point.x) <= HANDLE_SIZE && Math.abs(pos.y - point.y) <= HANDLE_SIZE) {
      return name;
    }
  }
  return null;
}

function pointInShape(pos, shape) {
  if (!shape) return false;
  const rect = getBoundingRect(shape);

  if (shape.shape === 'circle') {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rx = rect.width / 2;
    const ry = rect.height / 2;
    if (!rx || !ry) return false;
    const dx = (pos.x - cx) / rx;
    const dy = (pos.y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  if (shape.shape === 'freehand') {
    return pos.x >= rect.left && pos.x <= rect.right && pos.y >= rect.top && pos.y <= rect.bottom;
  }

  return pos.x >= rect.left && pos.x <= rect.right && pos.y >= rect.top && pos.y <= rect.bottom;
}

function drawShapePath(shape) {
  if (!shape) return;
  if (shape.shape === 'freehand') {
    if (!shape.path || shape.path.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(shape.path[0].x, shape.path[0].y);
    for (let i = 1; i < shape.path.length; i += 1) {
      ctx.lineTo(shape.path[i].x, shape.path[i].y);
    }
    ctx.closePath();
    return;
  }

  const rect = normalizeRect(shape);
  if (shape.shape === 'circle') {
    ctx.beginPath();
    ctx.ellipse(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      rect.width / 2,
      rect.height / 2,
      0,
      0,
      Math.PI * 2
    );
    return;
  }

  ctx.beginPath();
  ctx.rect(rect.left, rect.top, rect.width, rect.height);
}

function drawPortalPreview(shape) {
  if (!shape) return;
  const feather = Number(shape.feather || 0);

  ctx.save();
  if (!shape.invert) {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.filter = `blur(${feather}px)`;
    drawShapePath(shape);
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
    ctx.filter = `blur(${feather}px)`;
    drawShapePath(shape);
    ctx.fill();
  }
  ctx.restore();
}

function drawEditorOverlay(shape) {
  if (!shape) return;
  const rect = getBoundingRect(shape);

  ctx.save();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);
  drawShapePath(shape);
  ctx.stroke();
  ctx.setLineDash([]);

  const handles = getHandles(rect);
  ctx.fillStyle = '#f8fafc';
  Object.values(handles).forEach((h) => {
    ctx.fillRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
  });
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawPortalPreview(currentShape);
  drawEditorOverlay(currentShape);
}

function getPos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function clampShape(shape) {
  if (shape.shape === 'freehand') {
    return;
  }
  if (Number.isNaN(shape.width)) shape.width = 0;
  if (Number.isNaN(shape.height)) shape.height = 0;
}

canvas.addEventListener('mousedown', (evt) => {
  const pos = getPos(evt);
  const selectedTool = toolSelect.value;

  const handle = hitHandle(pos);
  if (handle && currentShape) {
    dragState = { type: 'resize', handle, start: pos, origin: structuredClone(currentShape) };
    return;
  }

  if (pointInShape(pos, currentShape)) {
    dragState = { type: 'move', start: pos, origin: structuredClone(currentShape) };
    return;
  }

  if (selectedTool === 'freehand') {
    currentShape = {
      shape: 'freehand',
      feather: Number(featherSlider.value),
      invert: invertToggle.checked,
      path: [pos]
    };
    dragState = { type: 'drawingFreehand' };
  } else {
    currentShape = {
      shape: selectedTool,
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
      feather: Number(featherSlider.value),
      invert: invertToggle.checked
    };
    dragState = { type: 'drawingRect', start: pos };
  }

  draw();
});

canvas.addEventListener('mousemove', (evt) => {
  if (!dragState || !currentShape) return;
  const pos = getPos(evt);

  if (dragState.type === 'drawingRect') {
    currentShape.width = pos.x - dragState.start.x;
    currentShape.height = pos.y - dragState.start.y;

    if (currentShape.shape === 'square' || currentShape.shape === 'circle') {
      const side = Math.max(Math.abs(currentShape.width), Math.abs(currentShape.height));
      currentShape.width = Math.sign(currentShape.width || 1) * side;
      currentShape.height = Math.sign(currentShape.height || 1) * side;
    }
  }

  if (dragState.type === 'drawingFreehand') {
    currentShape.path.push(pos);
  }

  if (dragState.type === 'move') {
    const dx = pos.x - dragState.start.x;
    const dy = pos.y - dragState.start.y;
    if (currentShape.shape === 'freehand') {
      currentShape.path = dragState.origin.path.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else {
      currentShape.x = dragState.origin.x + dx;
      currentShape.y = dragState.origin.y + dy;
    }
  }

  if (dragState.type === 'resize') {
    const origin = dragState.origin;
    const rect = getBoundingRect(origin);
    let left = rect.left;
    let right = rect.right;
    let top = rect.top;
    let bottom = rect.bottom;

    if (dragState.handle.includes('n')) top = pos.y;
    if (dragState.handle.includes('s')) bottom = pos.y;
    if (dragState.handle.includes('w')) left = pos.x;
    if (dragState.handle.includes('e')) right = pos.x;

    let width = right - left;
    let height = bottom - top;

    if (origin.shape === 'square' || origin.shape === 'circle') {
      const side = Math.max(Math.abs(width), Math.abs(height));
      width = Math.sign(width || 1) * side;
      height = Math.sign(height || 1) * side;
      if (dragState.handle.includes('w')) left = right - width;
      if (dragState.handle.includes('n')) top = bottom - height;
    }

    if (origin.shape === 'freehand') {
      const originRect = getBoundingRect(origin);
      const scaleX = originRect.width === 0 ? 1 : width / originRect.width;
      const scaleY = originRect.height === 0 ? 1 : height / originRect.height;
      currentShape.path = origin.path.map((p) => ({
        x: left + (p.x - originRect.left) * scaleX,
        y: top + (p.y - originRect.top) * scaleY
      }));
    } else {
      currentShape.x = left;
      currentShape.y = top;
      currentShape.width = width;
      currentShape.height = height;
      clampShape(currentShape);
    }
  }

  draw();
});

window.addEventListener('mouseup', () => {
  if (!currentShape) return;
  currentShape.feather = Number(featherSlider.value);
  currentShape.invert = invertToggle.checked;
  dragState = null;
  draw();
});

featherSlider.addEventListener('input', () => {
  featherValue.textContent = featherSlider.value;
  if (currentShape) currentShape.feather = Number(featherSlider.value);
  draw();
});

invertToggle.addEventListener('change', () => {
  if (currentShape) currentShape.invert = invertToggle.checked;
  draw();
});

saveMaskBtn.addEventListener('click', () => {
  if (!currentShape) {
    maskJson.value = '';
    return;
  }
  const rect = getBoundingRect(currentShape);
  const payload = {
    x: currentShape.shape === 'freehand' ? rect.left + rect.width / 2 : currentShape.x,
    y: currentShape.shape === 'freehand' ? rect.top + rect.height / 2 : currentShape.y,
    width: rect.width,
    height: rect.height,
    shape: currentShape.shape === 'square' ? 'rectangle' : currentShape.shape,
    feather: Number(currentShape.feather || 0),
    invert: Boolean(currentShape.invert),
    path: currentShape.shape === 'freehand' ? currentShape.path : []
  };
  maskJson.value = JSON.stringify(payload, null, 2);
});

loadMaskBtn.addEventListener('click', () => {
  try {
    const data = JSON.parse(maskJson.value);
    if (!data || !data.shape) return;

    if (data.shape === 'freehand') {
      currentShape = {
        shape: 'freehand',
        path: Array.isArray(data.path) ? data.path : [],
        feather: Number(data.feather || 0),
        invert: Boolean(data.invert)
      };
    } else {
      currentShape = {
        shape: data.shape,
        x: Number(data.x || 0),
        y: Number(data.y || 0),
        width: Number(data.width || 0),
        height: Number(data.height || 0),
        feather: Number(data.feather || 0),
        invert: Boolean(data.invert)
      };
    }

    featherSlider.value = String(currentShape.feather);
    featherValue.textContent = featherSlider.value;
    invertToggle.checked = Boolean(currentShape.invert);
    toolSelect.value = currentShape.shape === 'rectangle' ? 'rectangle' : currentShape.shape;
    draw();
  } catch {
    alert('Mask JSON is invalid.');
  }
});
