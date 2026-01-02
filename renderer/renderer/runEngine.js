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
  const meta = await fetch(atom.url).then(r => r.json());

  const startSec = meta.start_frame / meta.fps;
  const endSec = meta.end_frame / meta.fps;

  standby.src =
    `https://f005.backblazeb2.com/file/RunnyVisionSourceVideos/` +
    `${meta.video}#t=${startSec},${endSec}`;

  standby.playbackRate = 1 / (atom.stretch || 1);
  standby.className = "atom-video " + (Math.random() > 0.5 ? "dark" : "light");

  standby.oncanplay = () => {
    standby.play();

    active.classList.remove("active");
    standby.classList.add("active");

    [active, standby] = [standby, active];
  };
}
