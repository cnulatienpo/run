// Minimal RunnyVision browser player.
// All logic runs in-browser: fetch manifest, chain atom clips, preload next, and crossfade.

(() => {
  const MANIFEST_PATH = 'runnyvision/atoms/manifest_v1.json';
  const DEFAULT_ATOM_SECONDS = 5;
  const CROSSFADE_SECONDS = 1.5;

  // Optionally expose a base URL from the embedding page: window.RUNNYVISION_BASE_URL = 'https://.../';
  const BUCKET_BASE = (window.RUNNYVISION_BASE_URL || '').replace(/\/+$/, '');

  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const durationSelect = $('duration');
  const startBtn = $('start');
  const videoA = $('videoA');
  const videoB = $('videoB');
  const videos = [videoA, videoB];

  const state = {
    manifest: null,
    plan: [],
    currentIndex: 0,
    activeVideo: videoA,
    idleVideo: videoB,
    nextPreparedIndex: null,
    raf: null,
    fallbackRawUrl: null,
    stopped: true,
  };

  function withBase(path) {
    if (/^https?:\/\//i.test(path)) return path;
    const trimmed = path.replace(/^\/+/, '');
    return BUCKET_BASE ? `${BUCKET_BASE}/${trimmed}` : trimmed;
  }

  function setStatus(message) {
    statusEl.textContent = message;
  }

  async function fetchJson(url) {
    const response = await fetch(withBase(url));
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    return response.json();
  }

  async function loadManifest() {
    if (state.manifest) return state.manifest;
    setStatus('Loading manifest...');
    state.manifest = await fetchJson(MANIFEST_PATH);
    return state.manifest;
  }

  function pickVideoEntry(manifest) {
    const videosList = manifest.videos || manifest.entries || manifest.list || [];
    if (videosList.length) return videosList[0];
    // As a fallback, try to reconstruct shape from a dictionary.
    const stems = Object.keys(manifest).filter((k) => manifest[k]?.atom_count);
    if (stems.length) return { stem: stems[0], atom_count: manifest[stems[0]].atom_count };
    throw new Error('Manifest does not include any videos.');
  }

  function buildPlan(manifest, minutes) {
    const entry = pickVideoEntry(manifest);
    const targetSeconds = minutes * 60;
    const atomCount = entry.atom_count || entry.count || entry.total || 0;
    if (!atomCount) throw new Error('Selected video reports zero atoms.');

    const plan = [];
    let estimate = 0;
    let index = 1;
    const stem = entry.stem || entry.name || entry.id;

    const rawSource = entry.raw_url || entry.rawUrl || entry.source || `runnyvision/raw/${stem}.mp4`;

    // Walk forward through atoms and wrap as needed until we meet or exceed the requested duration.
    while (estimate < targetSeconds) {
      const padded = String(index).padStart(4, '0');
      const jsonPath = `runnyvision/atoms/${stem}/chunk_${padded}_v1.json`;
      plan.push({ stem, jsonPath });
      estimate += DEFAULT_ATOM_SECONDS;
      index = index >= atomCount ? 1 : index + 1;
    }

    return { items: plan, rawSource };
  }

  function deriveVideoUrl(atomJsonUrl, atomMeta) {
    const candidates = [
      atomMeta?.video_url,
      atomMeta?.videoUrl,
      atomMeta?.video,
      atomMeta?.segment,
      atomMeta?.segment_url,
      atomMeta?.mp4,
      atomMeta?.signed_url,
      atomMeta?.signedUrl,
    ].filter(Boolean);

    if (!candidates.length) {
      candidates.push(atomJsonUrl.replace(/\.json$/i, '.mp4'));
    }

    const firstAbsolute = candidates.find((c) => /^https?:\/\//.test(c));
    const choice = firstAbsolute || candidates[0];
    return withBase(choice);
  }

  function deriveDuration(atomMeta) {
    return (
      atomMeta?.duration_seconds ||
      atomMeta?.duration ||
      atomMeta?.seconds ||
      atomMeta?.length ||
      DEFAULT_ATOM_SECONDS
    );
  }

  async function hydrateAtom(planItem) {
    if (planItem.resolved) return planItem;
    try {
      const meta = await fetchJson(planItem.jsonPath);
      const videoUrl = deriveVideoUrl(planItem.jsonPath, meta);
      const duration = deriveDuration(meta);
      planItem.meta = meta;
      planItem.videoUrl = videoUrl;
      planItem.duration = duration;
      planItem.resolved = true;
    } catch (err) {
      console.warn('Atom fetch failed, will fall back to raw video', err);
      planItem.meta = {};
      planItem.videoUrl = null;
      planItem.duration = DEFAULT_ATOM_SECONDS;
      planItem.resolved = true;
    }
    return planItem;
  }

  async function prepareVideoElement(videoEl, planIndex) {
    const item = state.plan[planIndex];
    await hydrateAtom(item);
    if (!item.videoUrl) return false;
    videoEl.src = item.videoUrl;
    videoEl.preload = 'auto';
    videoEl.muted = true;
    await videoEl.load();
    state.nextPreparedIndex = planIndex;
    return true;
  }

  function swapVideos() {
    const wasActive = state.activeVideo;
    state.activeVideo.classList.remove('visible');
    state.idleVideo.classList.add('visible');
    [state.activeVideo, state.idleVideo] = [state.idleVideo, state.activeVideo];
    state.activeVideo.classList.add('visible');
    state.idleVideo.pause();
    state.idleVideo.currentTime = 0;
  }

  async function startCrossfade(targetIndex) {
    const nextItem = state.plan[targetIndex];
    setStatus(`Playing ${nextItem.stem} chunk #${targetIndex + 1}`);
    await state.idleVideo.play();
    state.idleVideo.classList.add('visible');
    state.activeVideo.classList.add('fading');
    setTimeout(() => {
      state.activeVideo.classList.remove('fading', 'visible');
      swapVideos();
      state.currentIndex = targetIndex;
      state.nextPreparedIndex = null;
      preloadNext(targetIndex + 1);
      state.raf = requestAnimationFrame(watchForCrossfade);
    }, CROSSFADE_SECONDS * 1000);
  }

  async function preloadNext(index) {
    if (index >= state.plan.length) {
      state.nextPreparedIndex = null;
      return;
    }
    state.idleVideo.classList.remove('visible', 'fading');
    await prepareVideoElement(state.idleVideo, index);
  }

  function stopPlayback(message) {
    cancelAnimationFrame(state.raf);
    state.activeVideo.pause();
    state.idleVideo.pause();
    state.stopped = true;
    setStatus(message);
  }

  function watchForCrossfade() {
    if (state.stopped) return;
    const active = state.activeVideo;
    const nextIndex = state.currentIndex + 1;
    const nextReady = state.nextPreparedIndex === nextIndex;

    if (nextReady && active.duration && active.currentTime) {
      const remaining = active.duration - active.currentTime;
      if (remaining <= CROSSFADE_SECONDS) {
        startCrossfade(nextIndex);
        return;
      }
    }

    if (nextIndex >= state.plan.length && active.ended) {
      stopPlayback('Finished planned run.');
      return;
    }

    state.raf = requestAnimationFrame(watchForCrossfade);
  }

  async function playFirstAtom() {
    state.activeVideo.classList.add('visible');
    await prepareVideoElement(state.activeVideo, 0);

    // If we failed to load the first atom, fall back to the raw source video.
    if (!state.plan[0].videoUrl && state.fallbackRawUrl) {
      state.activeVideo.src = withBase(state.fallbackRawUrl);
    }

    await state.activeVideo.play();
    preloadNext(1);
    watchForCrossfade();
  }

  function resetVideos() {
    videos.forEach((video) => {
      video.pause();
      video.currentTime = 0;
      video.removeAttribute('src');
      video.load();
      video.className = 'video-layer';
    });
    videoA.classList.add('visible');
    state.activeVideo = videoA;
    state.idleVideo = videoB;
    state.nextPreparedIndex = null;
    state.raf = null;
    state.stopped = false;
  }

  async function startRun() {
    try {
      resetVideos();
      const manifest = await loadManifest();
      const minutes = Number(durationSelect.value);
      const plan = buildPlan(manifest, minutes);
      state.plan = plan.items;
      state.fallbackRawUrl = plan.rawSource;
      state.currentIndex = 0;
      setStatus(`Starting ${minutes}-minute run from ${state.plan[0].stem}...`);
      await playFirstAtom();
    } catch (err) {
      console.error(err);
      stopPlayback(`Unable to start run: ${err.message}`);
    }
  }

  // What plays next?
  // 1. Manifest tells us available videos and how many atoms each has.
  // 2. We pick one video, walk its atoms in order (chunk_0001, chunk_0002, ...), and loop as needed to meet the requested duration.
  // 3. For each atom we fetch its JSON, resolve the matching video segment URL, and estimate its duration.
  // 4. While one atom is playing, the next is preloaded in a hidden <video>. When the active clip is close to its end, we start the hidden video and crossfade.
  // 5. If an atom fails to load, we fall back to the raw source video so playback never freezes.

  startBtn.addEventListener('click', startRun);
})();
