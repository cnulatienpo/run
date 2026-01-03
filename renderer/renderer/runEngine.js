let plan = [];
let cursor = 0;
let A = null;
let B = null;
let active = null;
let standby = null;
let loadingNext = false;
let isCrossfading = false;
let lastVideoUrl = null;

export function initVideos() {
  A = document.getElementById("v1");
  B = document.getElementById("v2");
  console.log('[runEngine] Initialized videos:', { A: A?.id, B: B?.id });
  
  if (!A || !B) {
    console.error('[runEngine] Video elements not found! v1:', A, 'v2:', B);
    return;
  }
  
  active = A;
  standby = B;
  
  // Ensure initial visibility
  active.classList.add('active');
  console.log('[runEngine] Active video set to:', active.id);
}

export async function startRun(planInput) {
  plan = Array.isArray(planInput) ? planInput : [];
  cursor = 0;
  lastVideoUrl = null;
  
  if (!A || !B) {
    initVideos();
  }
  
  if (!active || !standby || !plan.length) {
    return;
  }
  
  loadNextAtom();
}

function nextAtom() {
  if (!plan?.length) {
    return null;
  }
  const atom = plan[cursor];
  cursor = (cursor + 1) % plan.length;
  return atom;
}

function loadNextAtom(skipCount = 0) {
  if (loadingNext || isCrossfading) {
    return;
  }
  if (!plan?.length) {
    return;
  }
  if (skipCount >= plan.length) {
    console.warn('[runEngine] Exhausted atom list without valid source');
    return;
  }

  const atom = nextAtom();
  if (!atom) return;

  loadingNext = true;
  fetch(atom.url)
    .then((r) => {
      if (!r.ok) {
        throw new Error('Failed to fetch atom metadata');
      }
      return r.json();
    })
    .then((meta) => {
      const videoUrl = meta?.signed_url;
      if (!videoUrl) {
        console.error('[runEngine] No signed_url in atom metadata:', meta);
        loadingNext = false;
        loadNextAtom(skipCount + 1);
        return;
      }

      if (videoUrl === lastVideoUrl) {
        console.warn('[runEngine] Duplicate signed_url, skipping atom');
        loadingNext = false;
        loadNextAtom(skipCount + 1);
        return;
      }

      standby.oncanplay = null;
      standby.onerror = null;
      standby.src = '';
      standby.src = videoUrl;
      standby.playbackRate = 1 / (atom.stretch || 1);
      standby.className = "atom-video " + (Math.random() > 0.5 ? "dark" : "light");

      standby.oncanplay = () => handleStandbyReady(videoUrl);
      standby.onerror = (e) => {
        console.error('[runEngine] Video error:', e, standby.error);
        standby.onerror = null;
        loadingNext = false;
        loadNextAtom(skipCount + 1);
      };
    })
    .catch((error) => {
      console.error('[runEngine] Failed to load atom metadata:', error);
      loadingNext = false;
      loadNextAtom(skipCount + 1);
    });
}

function handleStandbyReady(videoUrl) {
  standby.oncanplay = null;
  if (isCrossfading) {
    return;
  }

  isCrossfading = true;
  standby.play().catch((err) => console.warn('[runEngine] Autoplay blocked:', err));

  const outgoing = active;
  if (outgoing) {
    outgoing.classList.remove('active');
  }
  standby.classList.add('active');

  active = standby;
  standby = outgoing;
  lastVideoUrl = videoUrl;
  isCrossfading = false;
  loadingNext = false;

  if (active) {
    active.onended = () => {
      if (!isCrossfading) {
        loadNextAtom();
      }
    };
  }

  loadNextAtom();
}
