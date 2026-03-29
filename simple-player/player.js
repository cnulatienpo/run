/*
  THIS IS THE ONLY ACTIVE VIDEO PLAYER.
  DO NOT CREATE ANOTHER PLAYER.
  ALL FEATURE WORK MUST MODIFY THIS PLAYER IN PLACE.
*/

(() => {
  const CLIPS = {
    grey: [
      { src: '/grey/a.mp4' },
      { src: '/grey/chegall tunnel 2.mp4' },
      { src: '/grey/grey marble.mp4' },
      { src: '/grey/grey partial.mp4' },
      { src: '/grey/grey white.mp4' },
      { src: '/grey/high school hallway.mp4' },
      { src: '/grey/stained sqaures 1.mp4' }
    ],
    clown: [
      { src: '/clown/video-1010505465482296.mp4' },
      { src: '/clown/video-1011496565383186.mp4' },
      { src: '/clown/video-1018069851392524.mp4' },
      { src: '/clown/video-1018070068059169.mp4' },
      { src: '/clown/video-1018078004725042.mp4' },
      { src: '/clown/video-1018365751362934.mp4' }
    ]
  };

  const DEFAULT_PORTAL_SIZE = 0.3;
  const FIT_MODE = {
    CONTAIN: 'contain',
    COVER: 'cover'
  };
  const DEFAULT_FIT_MODE = FIT_MODE.COVER;
  const DEBUG_OVERLAY_ENABLED = true;

  const shell = document.getElementById('playerShell');
  const playButton = document.getElementById('playButton');
  const statusReadout = document.getElementById('statusReadout');
  const currentWorldLabel = document.getElementById('currentWorldLabel');
  const nextWorldLabel = document.getElementById('nextWorldLabel');

  const videos = [document.getElementById('videoA'), document.getElementById('videoB')];
  const layers = [document.getElementById('layerA'), document.getElementById('layerB')];

  const state = {
    started: false,
    activeLayerIndex: 0,
    currentWorld: 'grey',
    pendingWorld: null,
    clipIndexByWorld: {
      grey: 0,
      clown: 0
    },
    parentClip: null,
    childClip: null,
    childWorld: null,
    childReady: false,
    rafId: null,
    layerTransforms: [
      {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        autoFit: false,
        fitMode: DEFAULT_FIT_MODE,
        offsetX: 0,
        offsetY: 0,
        offsetScale: 1
      },
      {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        autoFit: true,
        fitMode: DEFAULT_FIT_MODE,
        offsetX: 0,
        offsetY: 0,
        offsetScale: 1
      }
    ],
    debug: {
      enabled: DEBUG_OVERLAY_ENABLED,
      holeRect: null,
      videoRects: [null, null],
      layerCenters: [null, null]
    }
  };

  function createDebugNode(className) {
    const node = document.createElement('div');
    node.className = className;
    shell?.appendChild(node);
    return node;
  }

  const debugNodes = {
    holeRect: createDebugNode('debug-hole-rect'),
    holeCenter: createDebugNode('debug-hole-center'),
    videoRects: [createDebugNode('debug-video-rect-a'), createDebugNode('debug-video-rect-b')],
    videoCenters: [createDebugNode('debug-video-center-a'), createDebugNode('debug-video-center-b')]
  };

  function setStatus(message) {
    if (statusReadout) statusReadout.textContent = message;
  }

  function getActiveElements() {
    const activeIndex = state.activeLayerIndex;
    const standbyIndex = activeIndex === 0 ? 1 : 0;
    return {
      activeLayer: layers[activeIndex],
      standbyLayer: layers[standbyIndex],
      activeVideo: videos[activeIndex],
      standbyVideo: videos[standbyIndex],
      activeIndex,
      standbyIndex
    };
  }

  function setLayerRoles(frontIndex) {
    layers.forEach((layer, idx) => {
      layer.classList.toggle('is-front', idx === frontIndex);
      layer.classList.toggle('is-back', idx !== frontIndex);
    });
  }

  function encodeClipSrc(src) {
    return encodeURI(src);
  }

  function nextClipFor(worldName) {
    const list = CLIPS[worldName] ?? [];
    if (!list.length) return null;
    const index = state.clipIndexByWorld[worldName] % list.length;
    state.clipIndexByWorld[worldName] = (index + 1) % list.length;
    return list[index];
  }

  function sanitizePortal(clip) {
    const x = Number.isFinite(clip?.portal?.x) ? clip.portal.x : 0.5;
    const y = Number.isFinite(clip?.portal?.y) ? clip.portal.y : 0.5;
    const w = Number.isFinite(clip?.portal?.w) ? clip.portal.w : DEFAULT_PORTAL_SIZE;
    const h = Number.isFinite(clip?.portal?.h) ? clip.portal.h : DEFAULT_PORTAL_SIZE;

    return {
      x: Math.min(0.95, Math.max(0.05, x)),
      y: Math.min(0.95, Math.max(0.05, y)),
      w: Math.min(0.9, Math.max(0.05, w)),
      h: Math.min(0.9, Math.max(0.05, h))
    };
  }

  function portalToRect(portal) {
    const left = Math.min(1 - portal.w, Math.max(0, portal.x - portal.w * 0.5));
    const top = Math.min(1 - portal.h, Math.max(0, portal.y - portal.h * 0.5));
    return {
      left,
      top,
      right: left + portal.w,
      bottom: top + portal.h
    };
  }

  function loadVideo(video, src) {
    return new Promise((resolve, reject) => {
      const onCanPlay = () => {
        if (video.readyState >= 3) {
          cleanup();
          resolve();
        }
      };

      const onError = () => {
        cleanup();
        reject(new Error(`Unable to load video: ${src}`));
      };

      const cleanup = () => {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('canplaythrough', onCanPlay);
        video.removeEventListener('error', onError);
      };

      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('canplaythrough', onCanPlay);
      video.addEventListener('error', onError);

      video.src = encodeClipSrc(src);
      video.currentTime = 0;
      video.load();
      onCanPlay();
    });
  }

  async function ensurePlaying(video) {
    if (video.readyState < 3) {
      await new Promise((resolve) => {
        const onCanPlay = () => {
          if (video.readyState >= 3) {
            video.removeEventListener('canplay', onCanPlay);
            video.removeEventListener('canplaythrough', onCanPlay);
            resolve();
          }
        };
        video.addEventListener('canplay', onCanPlay);
        video.addEventListener('canplaythrough', onCanPlay);
      });
    }

    await video.play();
  }

  async function preloadIntoStandby(world) {
    const clip = nextClipFor(world);
    if (!clip) throw new Error(`No clips available for world: ${world}`);

    const { standbyVideo } = getActiveElements();
    await loadVideo(standbyVideo, clip.src);

    standbyVideo.classList.add('is-preloaded');
    standbyVideo.classList.remove('is-active');

    return clip;
  }

  function renderChildMask(clip) {
    const { standbyVideo } = getActiveElements();
    const portal = sanitizePortal(clip);
    const rect = portalToRect(portal);
    const top = rect.top * 100;
    const right = (1 - rect.right) * 100;
    const bottom = (1 - rect.bottom) * 100;
    const left = rect.left * 100;
    standbyVideo.style.clipPath = `inset(${top}% ${right}% ${bottom}% ${left}%)`;
  }

  function clearVideoTransformsAndMasks() {
    videos.forEach((video, idx) => {
      const tr = state.layerTransforms[idx] || {};
      tr.x = 0;
      tr.y = 0;
      tr.scale = 1;
      tr.rotation = 0;
      tr.offsetX = tr.offsetX ?? 0;
      tr.offsetY = tr.offsetY ?? 0;
      tr.offsetScale = tr.offsetScale ?? 1;
      video.style.transform = 'translate(0px, 0px) rotate(0deg) scale(1) translate(0px, 0px)';
      video.style.clipPath = 'none';
    });
  }

  function cameraTargetForPortal(clip) {
    const portal = sanitizePortal(clip);
    const width = shell?.clientWidth || window.innerWidth;
    const height = shell?.clientHeight || window.innerHeight;
    const centerX = portal.x * width;
    const centerY = portal.y * height;
    const scale = Math.max(1 / portal.w, 1 / portal.h);

    return {
      scale,
      translateX: width * 0.5 - centerX * scale,
      translateY: height * 0.5 - centerY * scale
    };
  }

  function rectToMaskCanvas(rect, width, height) {
    const mask = document.createElement('canvas');
    mask.width = width;
    mask.height = height;
    const mctx = mask.getContext('2d');
    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, width, height);
    mctx.fillStyle = '#fff';
    mctx.fillRect(rect.left, rect.top, rect.width, rect.height);
    return mask;
  }

  function getHoleBounds(maskCanvas) {
    const width = maskCanvas.width;
    const height = maskCanvas.height;
    const mctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    const { data } = mctx.getImageData(0, 0, width, height);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (luma < 127) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) {
      return {
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
        width: 0,
        height: 0,
        centerX: 0,
        centerY: 0
      };
    }

    const holeWidth = maxX - minX + 1;
    const holeHeight = maxY - minY + 1;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: holeWidth,
      height: holeHeight,
      centerX: minX + holeWidth * 0.5,
      centerY: minY + holeHeight * 0.5
    };
  }

  function normalizedToPixels(value, size) {
    if (!Number.isFinite(value)) return size * 0.5;
    if (Math.abs(value) <= 1) return size * 0.5 + value * size * 0.5;
    return value;
  }

  function computeVideoBoundsFromTransform(transform, videoWidth, videoHeight) {
    const scale = Math.max(0.01, Math.min(2, Number(transform.scale) || 1));
    const rotation = Number(transform.rotation) || 0;
    const x = Number(transform.x) || 0;
    const y = Number(transform.y) || 0;

    const halfW = (videoWidth * scale) * 0.5;
    const halfH = (videoHeight * scale) * 0.5;
    const cos = Math.cos((rotation * Math.PI) / 180);
    const sin = Math.sin((rotation * Math.PI) / 180);
    const corners = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH }
    ].map((p) => ({
      x: x + p.x * cos - p.y * sin,
      y: y + p.x * sin + p.y * cos
    }));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
      centerX: x,
      centerY: y
    };
  }

  function applyLayerTransform(video, layerTransform, videoWidth, videoHeight) {
    const x = Number(layerTransform.x) || 0;
    const y = Number(layerTransform.y) || 0;
    const scale = Math.max(0.01, Math.min(2, Number(layerTransform.scale) || 1));
    const rotation = Number(layerTransform.rotation) || 0;
    const originX = videoWidth * 0.5;
    const originY = videoHeight * 0.5;
    video.style.width = `${videoWidth}px`;
    video.style.height = `${videoHeight}px`;
    video.style.transformOrigin = '0 0';
    video.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scale}) translate(${-originX}px, ${-originY}px)`;
  }

  function updateDebugOverlay() {
    if (!state.debug.enabled || !shell) {
      Object.values(debugNodes).flat().forEach((node) => {
        if (node) node.style.display = 'none';
      });
      return;
    }

    const hole = state.debug.holeRect;
    if (hole) {
      debugNodes.holeRect.style.display = 'block';
      debugNodes.holeRect.style.left = `${hole.left}px`;
      debugNodes.holeRect.style.top = `${hole.top}px`;
      debugNodes.holeRect.style.width = `${hole.width}px`;
      debugNodes.holeRect.style.height = `${hole.height}px`;
      debugNodes.holeCenter.style.display = 'block';
      debugNodes.holeCenter.style.left = `${hole.centerX}px`;
      debugNodes.holeCenter.style.top = `${hole.centerY}px`;
    } else {
      debugNodes.holeRect.style.display = 'none';
      debugNodes.holeCenter.style.display = 'none';
    }

    state.debug.videoRects.forEach((rect, idx) => {
      const rectNode = debugNodes.videoRects[idx];
      const centerNode = debugNodes.videoCenters[idx];
      if (!rect) {
        rectNode.style.display = 'none';
        centerNode.style.display = 'none';
        return;
      }
      rectNode.style.display = 'block';
      rectNode.style.left = `${rect.left}px`;
      rectNode.style.top = `${rect.top}px`;
      rectNode.style.width = `${Math.max(0, rect.right - rect.left)}px`;
      rectNode.style.height = `${Math.max(0, rect.bottom - rect.top)}px`;
      centerNode.style.display = 'block';
      centerNode.style.left = `${rect.centerX}px`;
      centerNode.style.top = `${rect.centerY}px`;
    });
  }

  function recalculateTransformsForFrame() {
    const { activeVideo, standbyVideo, activeIndex, standbyIndex } = getActiveElements();
    const target = cameraTargetForPortal(state.parentClip);
    const shellWidth = shell?.clientWidth || window.innerWidth;
    const shellHeight = shell?.clientHeight || window.innerHeight;
    const activeVideoWidth = activeVideo.videoWidth || shellWidth;
    const activeVideoHeight = activeVideo.videoHeight || shellHeight;
    const standbyVideoWidth = standbyVideo.videoWidth || shellWidth;
    const standbyVideoHeight = standbyVideo.videoHeight || shellHeight;

    const activeTransform = state.layerTransforms[activeIndex];
    activeTransform.x = target.translateX + shellWidth * 0.5;
    activeTransform.y = target.translateY + shellHeight * 0.5;
    activeTransform.scale = Math.max(0.01, Math.min(2, target.scale));

    let holeBounds = null;
    if (state.parentClip) {
      const portal = sanitizePortal(state.parentClip);
      const rect = portalToRect(portal);
      const holeRect = {
        left: rect.left * shellWidth,
        top: rect.top * shellHeight,
        width: rect.right * shellWidth - rect.left * shellWidth,
        height: rect.bottom * shellHeight - rect.top * shellHeight
      };
      const mask = rectToMaskCanvas(holeRect, shellWidth, shellHeight);
      holeBounds = getHoleBounds(mask);
    }

    const standbyTransform = state.layerTransforms[standbyIndex];
    if (standbyTransform.autoFit && holeBounds && standbyVideoWidth > 0 && standbyVideoHeight > 0) {
      const scaleX = holeBounds.width / standbyVideoWidth;
      const scaleY = holeBounds.height / standbyVideoHeight;
      const baseScale = standbyTransform.fitMode === FIT_MODE.CONTAIN
        ? Math.min(scaleX, scaleY)
        : Math.max(scaleX, scaleY);
      standbyTransform.scale = Math.max(0.01, Math.min(2, baseScale * (standbyTransform.offsetScale || 1)));
      standbyTransform.x = holeBounds.centerX + (standbyTransform.offsetX || 0);
      standbyTransform.y = holeBounds.centerY + (standbyTransform.offsetY || 0);
    } else {
      standbyTransform.x = normalizedToPixels(standbyTransform.x, shellWidth);
      standbyTransform.y = normalizedToPixels(standbyTransform.y, shellHeight);
      standbyTransform.scale = Math.max(0.01, Math.min(2, standbyTransform.scale));
    }

    applyLayerTransform(activeVideo, activeTransform, activeVideoWidth, activeVideoHeight);
    applyLayerTransform(standbyVideo, standbyTransform, standbyVideoWidth, standbyVideoHeight);

    state.debug.holeRect = holeBounds
      ? {
          left: holeBounds.minX,
          top: holeBounds.minY,
          width: holeBounds.width,
          height: holeBounds.height,
          centerX: holeBounds.centerX,
          centerY: holeBounds.centerY
        }
      : null;
    state.debug.videoRects[activeIndex] = computeVideoBoundsFromTransform(activeTransform, activeVideoWidth, activeVideoHeight);
    state.debug.videoRects[standbyIndex] = computeVideoBoundsFromTransform(standbyTransform, standbyVideoWidth, standbyVideoHeight);
    updateDebugOverlay();
  }

  async function queueChildClip() {
    const worldForNextClip = state.pendingWorld || state.currentWorld;
    nextWorldLabel.textContent = worldForNextClip;

    const childClip = await preloadIntoStandby(worldForNextClip);
    const { standbyVideo } = getActiveElements();

    await ensurePlaying(standbyVideo);

    state.childWorld = worldForNextClip;
    state.childClip = childClip;
    state.childReady = true;

    renderChildMask(state.parentClip);
    setStatus(`Zooming into ${state.childWorld} portal`);
  }

  async function promoteChildToParent() {
    if (!state.childReady || !state.childClip) return;

    const { activeVideo, standbyVideo, standbyIndex } = getActiveElements();

    activeVideo.pause();
    activeVideo.currentTime = 0;
    activeVideo.classList.remove('is-active', 'is-preloaded');
    activeVideo.style.clipPath = 'none';

    standbyVideo.classList.remove('is-preloaded');
    standbyVideo.classList.add('is-active');
    standbyVideo.style.clipPath = 'none';

    state.activeLayerIndex = standbyIndex;
    state.currentWorld = state.childWorld || state.currentWorld;
    state.pendingWorld = null;
    state.parentClip = state.childClip;
    state.childClip = null;
    state.childWorld = null;
    state.childReady = false;

    state.layerTransforms.forEach((tr, idx) => {
      tr.x = 0;
      tr.y = 0;
      tr.scale = 1;
      tr.rotation = 0;
      if (idx > 0 && tr.autoFit === undefined) tr.autoFit = true;
    });

    currentWorldLabel.textContent = state.currentWorld;
    nextWorldLabel.textContent = '—';
    setLayerRoles(state.activeLayerIndex);
    clearVideoTransformsAndMasks();

    await queueChildClip();
  }

  function tick() {
    if (!state.started) return;

    if (state.childReady && state.parentClip) {
      recalculateTransformsForFrame();

      const target = cameraTargetForPortal(state.parentClip);
      const activeTransform = state.layerTransforms[state.activeLayerIndex];
      if (activeTransform.scale >= Math.max(0.01, Math.min(2, target.scale * 0.985))) {
        promoteChildToParent().catch((error) => {
          console.error(error);
          setStatus(error.message);
        });
      }
    }

    state.rafId = requestAnimationFrame(tick);
  }

  async function startSession() {
    if (state.started) return;
    state.started = true;

    setLayerRoles(state.activeLayerIndex);
    const { activeVideo } = getActiveElements();

    const firstClip = nextClipFor(state.currentWorld);
    if (!firstClip) {
      setStatus('No clips available to play.');
      state.started = false;
      return;
    }

    state.parentClip = firstClip;

    await loadVideo(activeVideo, firstClip.src);
    activeVideo.classList.add('is-active');
    await ensurePlaying(activeVideo);

    setStatus(`Playing ${state.currentWorld} world`);
    await queueChildClip();
    tick();
  }

  function bindUI() {
    playButton?.addEventListener('click', () => {
      startSession().catch((error) => {
        console.error(error);
        setStatus(error.message);
      });
    });

    const worldButtons = document.querySelectorAll('[data-world-button]');
    worldButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const selectedWorld = button.getAttribute('data-world-button');
        if (!selectedWorld || !(selectedWorld in CLIPS)) return;

        state.pendingWorld = selectedWorld;
        nextWorldLabel.textContent = selectedWorld;

        worldButtons.forEach((other) => {
          other.classList.toggle('is-current', other === button && selectedWorld === state.currentWorld);
          other.classList.toggle('is-pending', other === button && selectedWorld !== state.currentWorld);
        });

        setStatus(`World switch queued: ${selectedWorld}`);
      });
    });

    shell?.addEventListener('dblclick', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        shell.requestFullscreen?.().catch(() => {});
      }
    });

    document.getElementById('fullscreenButton')?.addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        shell?.requestFullscreen?.().catch(() => {});
      }
    });
  }

  function init() {
    videos.forEach((video) => {
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.classList.remove('is-preloaded');
      video.style.clipPath = 'none';
      video.style.transform = 'translate(0px, 0px) rotate(0deg) scale(1) translate(0px, 0px)';
    });
    setLayerRoles(state.activeLayerIndex);
    currentWorldLabel.textContent = state.currentWorld;
    nextWorldLabel.textContent = '—';
    setStatus('Ready. Press Play Session.');
    updateDebugOverlay();
    bindUI();
  }

  init();
})();
