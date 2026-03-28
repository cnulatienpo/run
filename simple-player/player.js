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

  const TRANSITION_LOOKAHEAD_SECONDS = 0.65;
  const MASK_START_RADIUS = 10;

  const shell = document.getElementById('playerShell');
  const playButton = document.getElementById('playButton');
  const statusReadout = document.getElementById('statusReadout');
  const currentWorldLabel = document.getElementById('currentWorldLabel');
  const nextWorldLabel = document.getElementById('nextWorldLabel');
  const transitionSecondsInput = document.getElementById('uiTransitionSeconds');

  const videos = [document.getElementById('videoA'), document.getElementById('videoB')];
  const layers = [document.getElementById('layerA'), document.getElementById('layerB')];

  const state = {
    started: false,
    transitioning: false,
    activeLayerIndex: 0,
    currentWorld: 'grey',
    pendingWorld: null,
    clipIndexByWorld: {
      grey: 0,
      clown: 0
    }
  };

  function setStatus(message) {
    if (statusReadout) statusReadout.textContent = message;
  }

  function normalizedTransitionMs() {
    const parsed = Number(transitionSecondsInput?.value ?? 0.8);
    if (!Number.isFinite(parsed) || parsed <= 0) return 800;
    return parsed * 1000;
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

  function readPortalPosition(clip, videoEl) {
    if (clip?.portal && Number.isFinite(clip.portal.x) && Number.isFinite(clip.portal.y)) {
      return {
        x: Math.min(1, Math.max(0, clip.portal.x)) * videoEl.clientWidth,
        y: Math.min(1, Math.max(0, clip.portal.y)) * videoEl.clientHeight
      };
    }

    return {
      x: videoEl.clientWidth * 0.5,
      y: videoEl.clientHeight * 0.5
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

  function maxRevealRadius(video, x, y) {
    const width = video.clientWidth;
    const height = video.clientHeight;
    const corners = [
      Math.hypot(x, y),
      Math.hypot(width - x, y),
      Math.hypot(x, height - y),
      Math.hypot(width - x, height - y)
    ];
    return Math.max(...corners) + 4;
  }

  function animatePortalReveal(video, clip) {
    return new Promise((resolve) => {
      const durationMs = normalizedTransitionMs();
      const { x, y } = readPortalPosition(clip, video);
      const endRadius = maxRevealRadius(video, x, y);
      const startTs = performance.now();

      video.classList.add('is-masked');
      video.style.clipPath = `circle(${MASK_START_RADIUS}px at ${x}px ${y}px)`;

      const step = (now) => {
        const t = Math.min(1, (now - startTs) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        const radius = MASK_START_RADIUS + (endRadius - MASK_START_RADIUS) * eased;
        video.style.clipPath = `circle(${radius}px at ${x}px ${y}px)`;

        if (t < 1) {
          requestAnimationFrame(step);
          return;
        }

        resolve();
      };

      requestAnimationFrame(step);
    });
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

  function scheduleTransitionWatch() {
    const { activeVideo } = getActiveElements();
    const onTimeUpdate = async () => {
      if (state.transitioning || !Number.isFinite(activeVideo.duration) || activeVideo.duration <= 0) {
        return;
      }

      const remaining = activeVideo.duration - activeVideo.currentTime;
      if (remaining <= TRANSITION_LOOKAHEAD_SECONDS) {
        activeVideo.removeEventListener('timeupdate', onTimeUpdate);
        try {
          await runTransition();
        } catch (error) {
          console.error(error);
          setStatus(error.message);
          state.transitioning = false;
        }
      }
    };

    activeVideo.addEventListener('timeupdate', onTimeUpdate);
  }

  async function runTransition() {
    state.transitioning = true;

    const worldForNextClip = state.pendingWorld || state.currentWorld;
    nextWorldLabel.textContent = worldForNextClip;

    const clip = await preloadIntoStandby(worldForNextClip);
    const { activeVideo, standbyVideo, standbyIndex } = getActiveElements();

    // Requirement: the next video must be playing BEFORE hole expands.
    await ensurePlaying(standbyVideo);

    await animatePortalReveal(activeVideo, clip);

    // Transition completion: remove old mask and swap active layer.
    activeVideo.pause();
    activeVideo.currentTime = 0;
    activeVideo.classList.remove('is-active', 'is-preloaded', 'is-masked');
    activeVideo.style.clipPath = 'none';

    standbyVideo.classList.remove('is-preloaded');
    standbyVideo.classList.add('is-active');

    state.activeLayerIndex = standbyIndex;
    state.currentWorld = worldForNextClip;
    state.pendingWorld = null;

    currentWorldLabel.textContent = state.currentWorld;
    nextWorldLabel.textContent = '—';
    setLayerRoles(state.activeLayerIndex);
    setStatus(`Now playing ${state.currentWorld} clip`);

    state.transitioning = false;
    scheduleTransitionWatch();
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

    await loadVideo(activeVideo, firstClip.src);
    activeVideo.classList.add('is-active');
    await ensurePlaying(activeVideo);

    setStatus(`Playing ${state.currentWorld} world`);
    scheduleTransitionWatch();
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
      video.classList.remove('is-masked', 'is-preloaded');
      video.style.clipPath = 'none';
    });
    setLayerRoles(state.activeLayerIndex);
    currentWorldLabel.textContent = state.currentWorld;
    nextWorldLabel.textContent = '—';
    setStatus('Ready. Press Play Session.');
    bindUI();
  }

  init();
})();
