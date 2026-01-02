let plan = [];
let cursor = 0;
let A = null;
let B = null;
let active = null;
let standby = null;

export function initVideos() {
  A = document.getElementById("v1");
  B = document.getElementById("v2");
  active = A;
  standby = B;
}

export async function startRun(planInput) {
  plan = planInput;
  cursor = 0;
  
  if (!A || !B) {
    initVideos();
  }
  
  scheduleNext();
}

function scheduleNext() {
  const atom = plan[cursor++];
  if (!atom) return;

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

  console.log('[runEngine] Setting video URL:', videoUrl);
  console.log('[runEngine] Standby video element:', standby);
  
  standby.src = videoUrl;
  standby.playbackRate = 1 / (atom.stretch || 1);
  standby.className = "atom-video " + (Math.random() > 0.5 ? "dark" : "light");

  standby.oncanplay = () => {
    console.log('[runEngine] Video canplay, starting playback');
    standby.play();

    active.classList.remove("active");
    standby.classList.add("active");

    [active, standby] = [standby, active];
    console.log('[runEngine] Crossfade complete, active:', active.id);
  };
  
  standby.onerror = (e) => {
    console.error('[runEngine] Video error:', e, standby.error);
  };
}
