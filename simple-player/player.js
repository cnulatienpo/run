const DEFAULT_TRANSITION_MS = 1500;
const MIN_START_SCALE = 0.1;
const PUSH_SCALE = 1.2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getDefaultPortal(containerRect) {
  return {
    x: containerRect.width / 2,
    y: containerRect.height / 2,
    width: containerRect.width * 0.28,
    height: containerRect.height * 0.28,
    shape: "circle",
    feather: 0,
  };
}

function normalizePortal(rawPortal, containerRect) {
  const fallback = getDefaultPortal(containerRect);
  if (!rawPortal || typeof rawPortal !== "object") {
    return fallback;
  }

  return {
    x: Number.isFinite(rawPortal.x) ? rawPortal.x : fallback.x,
    y: Number.isFinite(rawPortal.y) ? rawPortal.y : fallback.y,
    width: Number.isFinite(rawPortal.width) ? Math.max(1, rawPortal.width) : fallback.width,
    height: Number.isFinite(rawPortal.height) ? Math.max(1, rawPortal.height) : fallback.height,
    shape: rawPortal.shape === "rect" ? "rect" : "circle",
    feather: Number.isFinite(rawPortal.feather) ? Math.max(0, rawPortal.feather) : 0,
  };
}

function applyPortalMask(layer, portal) {
  layer.style.clipPath = portal.shape === "rect" ? "inset(0)" : "circle(50% at 50% 50%)";
  layer.style.filter = portal.feather > 0 ? `blur(${portal.feather}px)` : "none";
}

function clearMask(layer) {
  layer.style.clipPath = "none";
  layer.style.filter = "none";
}

function waitForVideoReady(video) {
  if (video.readyState >= 3) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const onReady = () => {
      if (video.readyState >= 3) {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("canplaythrough", onReady);
      video.removeEventListener("loadeddata", onReady);
    };

    video.addEventListener("canplay", onReady);
    video.addEventListener("canplaythrough", onReady);
    video.addEventListener("loadeddata", onReady);
  });
}

class SimplePortalPlayer {
  constructor(root, { transitionMs = DEFAULT_TRANSITION_MS, debugPortal = false } = {}) {
    this.root = root;
    this.transitionMs = transitionMs;
    this.debugPortal = debugPortal;
    this.activeIndex = 0;
    this.clips = [];
    this.transitioning = false;

    this.layers = [0, 1].map((index) => {
      const layer = document.createElement("div");
      layer.className = "videoLayer";
      layer.style.zIndex = String(index + 1);

      const video = document.createElement("video");
      video.className = "videoEl";
      video.preload = "auto";
      video.playsInline = true;
      video.muted = true;
      video.setAttribute("muted", "");

      layer.appendChild(video);
      this.root.appendChild(layer);
      return { layer, video, clip: null };
    });

    this.debugOutline = document.createElement("div");
    this.debugOutline.className = "portalDebug";
    this.root.appendChild(this.debugOutline);
  }

  setPlaylist(clips) {
    this.clips = Array.isArray(clips) ? clips : [];
  }

  async playClip(index) {
    const clip = this.clips[index];
    if (!clip) return;

    const active = this.layers[this.activeIndex];
    active.clip = clip;
    active.video.src = clip.src;
    await active.video.play();

    const standby = this.layers[1 - this.activeIndex];
    const preloadClip = this.clips[index + 1];
    if (preloadClip) {
      standby.clip = preloadClip;
      standby.video.src = preloadClip.src;
      standby.video.load();
    }
  }

  async transitionTo(nextClip) {
    if (this.transitioning) return;

    this.transitioning = true;
    const current = this.layers[this.activeIndex];
    const next = this.layers[1 - this.activeIndex];

    next.clip = nextClip;
    next.video.src = nextClip.src;
    next.video.load();

    await waitForVideoReady(next.video);
    const bounds = this.root.getBoundingClientRect();
    const portal = normalizePortal(nextClip.portal, bounds);

    this.prepareNextLayer(next.layer, portal);
    if (this.debugPortal) this.showPortalDebug(portal);

    await next.video.play();
    await this.runTransition(current.layer, next.layer, portal);

    current.video.pause();
    current.video.currentTime = 0;
    current.layer.classList.remove("is-current");
    next.layer.classList.add("is-current");

    this.resetLayer(next.layer);
    this.resetLayer(current.layer);

    this.activeIndex = 1 - this.activeIndex;
    this.transitioning = false;
  }

  prepareNextLayer(layer, portal) {
    layer.style.left = `${portal.x}px`;
    layer.style.top = `${portal.y}px`;
    layer.style.width = `${portal.width}px`;
    layer.style.height = `${portal.height}px`;
    layer.style.opacity = "1";
    layer.style.transform = `translate(-50%, -50%) scale(${MIN_START_SCALE})`;
    applyPortalMask(layer, portal);
  }

  resetLayer(layer) {
    layer.style.left = "50%";
    layer.style.top = "50%";
    layer.style.width = "100%";
    layer.style.height = "100%";
    layer.style.opacity = "1";
    layer.style.transform = "translate(-50%, -50%) scale(1)";
    clearMask(layer);
  }

  runTransition(currentLayer, nextLayer, portal) {
    const start = performance.now();
    const duration = this.transitionMs;

    currentLayer.style.transformOrigin = "50% 50%";
    nextLayer.style.transformOrigin = "50% 50%";
    nextLayer.style.willChange = "left, top, width, height, transform, clip-path, filter";
    currentLayer.style.willChange = "transform, opacity";

    return new Promise((resolve) => {
      const tick = (now) => {
        const t = clamp((now - start) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - t, 3);

        const left = portal.x + (this.root.clientWidth / 2 - portal.x) * eased;
        const top = portal.y + (this.root.clientHeight / 2 - portal.y) * eased;
        const width = portal.width + (this.root.clientWidth - portal.width) * eased;
        const height = portal.height + (this.root.clientHeight - portal.height) * eased;
        const nextScale = MIN_START_SCALE + (1 - MIN_START_SCALE) * eased;

        nextLayer.style.left = `${left}px`;
        nextLayer.style.top = `${top}px`;
        nextLayer.style.width = `${width}px`;
        nextLayer.style.height = `${height}px`;
        nextLayer.style.transform = `translate(-50%, -50%) scale(${nextScale})`;

        if (portal.shape === "circle") {
          const radius = 50 + 60 * eased;
          nextLayer.style.clipPath = `circle(${radius}% at 50% 50%)`;
        } else {
          const inset = Math.max(0, 50 - 50 * eased);
          nextLayer.style.clipPath = `inset(${inset}% ${inset}%)`;
        }

        const blur = portal.feather * (1 - eased);
        nextLayer.style.filter = blur > 0.25 ? `blur(${blur.toFixed(2)}px)` : "none";

        const currentScale = 1 + (PUSH_SCALE - 1) * eased;
        currentLayer.style.transform = `translate(-50%, -50%) scale(${currentScale})`;
        currentLayer.style.opacity = String(1 - eased);

        if (t < 1) {
          requestAnimationFrame(tick);
          return;
        }

        clearMask(nextLayer);
        nextLayer.style.left = "50%";
        nextLayer.style.top = "50%";
        nextLayer.style.width = "100%";
        nextLayer.style.height = "100%";
        nextLayer.style.transform = "translate(-50%, -50%) scale(1)";
        currentLayer.style.opacity = "0";
        currentLayer.style.willChange = "auto";
        nextLayer.style.willChange = "auto";
        this.hidePortalDebug();
        resolve();
      };

      requestAnimationFrame(tick);
    });
  }

  showPortalDebug(portal) {
    this.debugOutline.style.display = "block";
    this.debugOutline.style.left = `${portal.x}px`;
    this.debugOutline.style.top = `${portal.y}px`;
    this.debugOutline.style.width = `${portal.width}px`;
    this.debugOutline.style.height = `${portal.height}px`;
    this.debugOutline.style.borderRadius = portal.shape === "circle" ? "9999px" : "12px";
    window.clearTimeout(this.debugTimeout);
    this.debugTimeout = window.setTimeout(() => this.hidePortalDebug(), 500);
  }

  hidePortalDebug() {
    this.debugOutline.style.display = "none";
  }
}


if (typeof window !== "undefined") window.SimplePortalPlayer = SimplePortalPlayer;
if (typeof module !== "undefined") module.exports = { SimplePortalPlayer };
