let plan = [];
let cursor = 0;
let A = null;
let B = null;
let active = null;
let standby = null;

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
  plan = planInput;
  cursor = 0;
  
  console.log('[runEngine] Starting run with plan:', plan);
  console.log('[runEngine] Plan length:', plan.length);
  
  if (!A || !B) {
    initVideos();
  }
  
  scheduleNext();
}

function scheduleNext() {
  const atom = plan[cursor++];
  
  console.log('[runEngine] scheduleNext - cursor:', cursor, 'plan length:', plan.length);
  
  if (!atom) {
    console.log('[runEngine] No more atoms, plan exhausted');
    return;
  }

  playAtom(atom);

  setTimeout(scheduleNext, atom.effectiveDuration * 1000 - 500);
}

async function playAtom(atom) {
  console.log('[runEngine] Playing atom:', atom);
  const meta = await fetch(atom.url).then(r => r.json());
  console.log('[runEngine] Atom metadata:', meta);

  // Get the signed video URL from the atom metadata
  const videoUrl = meta.signed_url;
  
  if (!videoUrl) {
    console.error('[runEngine] No signed_url in atom metadata:', meta);
    return;
  }

  // Calculate time range from frame numbers
  const fps = meta.fps || 30;
  const startTime = (meta.start_frame || 0) / fps;
  const endTime = (meta.end_frame || 0) / fps;
  const duration = endTime - startTime;

  console.log('[runEngine] Setting video URL:', videoUrl);
  console.log('[runEngine] Time range:', { startTime, endTime, duration });
  console.log('[runEngine] Standby video element:', standby);
  
  // Add time fragment to URL if supported, otherwise use currentTime
  const urlWithFragment = `${videoUrl}#t=${startTime},${endTime}`;
  
  standby.src = urlWithFragment;
  standby.currentTime = startTime;
  standby.playbackRate = 1 / (atom.stretch || 1);
  standby.className = "atom-video " + (Math.random() > 0.5 ? "dark" : "light");

  // Set up time-based cutoff
  const checkTime = () => {
    if (standby.currentTime >= endTime) {
      console.log('[runEngine] Reached end time, stopping segment');
      standby.pause();
      standby.ontimeupdate = null;
    }
  };

  standby.oncanplay = () => {
    console.log('[runEngine] Video canplay, starting playback from', startTime);
    console.log('[runEngine] Video element ready state:', standby.readyState);
    console.log('[runEngine] Video dimensions:', standby.videoWidth, 'x', standby.videoHeight);
    
    standby.currentTime = startTime;
    
    const playPromise = standby.play();
    if (playPromise) {
      playPromise.then(() => {
        console.log('[runEngine] Play started successfully');
      }).catch(err => {
        console.error('[runEngine] Play failed:', err);
      });
    }
    
    standby.ontimeupdate = checkTime;

    active.classList.remove("active");
    standby.classList.add("active");

    [active, standby] = [standby, active];
    console.log('[runEngine] Crossfade complete, active:', active.id);
    console.log('[runEngine] Active element classes:', active.className);
  };
  
  standby.onerror = (e) => {
    console.error('[runEngine] Video error:', e, standby.error);
  };
}
