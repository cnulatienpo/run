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
    camera: {
      scale: 1,
      translateX: 0,
      translateY: 0
    }
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

  function applyCamera(video, camera) {
    video.style.transform = `translate(${camera.translateX}px, ${camera.translateY}px) scale(${camera.scale})`;
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
    videos.forEach((video) => {
      video.style.transform = 'translate(0px, 0px) scale(1)';
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

    state.camera.scale = 1;
    state.camera.translateX = 0;
    state.camera.translateY = 0;

    currentWorldLabel.textContent = state.currentWorld;
    nextWorldLabel.textContent = '—';
    setLayerRoles(state.activeLayerIndex);
    clearVideoTransformsAndMasks();

    await queueChildClip();
  }

  function tick() {
    if (!state.started) return;

    const { activeVideo, standbyVideo } = getActiveElements();

    if (state.childReady && state.parentClip) {
      const target = cameraTargetForPortal(state.parentClip);
      const alpha = 0.045;

      state.camera.scale += (target.scale - state.camera.scale) * alpha;
      state.camera.translateX += (target.translateX - state.camera.translateX) * alpha;
      state.camera.translateY += (target.translateY - state.camera.translateY) * alpha;

      applyCamera(activeVideo, state.camera);
      applyCamera(standbyVideo, state.camera);

      if (state.camera.scale >= target.scale * 0.985) {
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
      video.style.transform = 'translate(0px, 0px) scale(1)';
    });
    setLayerRoles(state.activeLayerIndex);
    currentWorldLabel.textContent = state.currentWorld;
    nextWorldLabel.textContent = '—';
    setStatus('Ready. Press Play Session.');
    bindUI();
  }

  init();
})();
