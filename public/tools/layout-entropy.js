const ENTROPY_X = 10; // Maximum horizontal offset in pixels (kept small to stay legible)
const ENTROPY_Y = 12; // Maximum vertical offset in pixels (kept small to stay legible)
const SEED = 20240701; // Deterministic seed so layouts remain repeatable

// Simple deterministic pseudo-random generator (no Math.random) to keep jitter reproducible.
function createGenerator(seed) {
  let state = seed >>> 0;
  return function next() {
    state += 0x6D2B79F5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boundedJitter(random, max) {
  const spread = max * 2;
  const sample = Math.round(random() * spread) - max;
  return sample;
}

function applyLayoutEntropy() {
  const generator = createGenerator(SEED);
  const takenOffsets = new Set();
  const nodes = document.querySelectorAll('.stage .node');

  nodes.forEach((node, index) => {
    let dx = 0;
    let dy = 0;
    let attempts = 0;
    const totalSlots = (ENTROPY_X * 2 + 1) * (ENTROPY_Y * 2 + 1) - 1; // exclude perfectly still state

    // Entropy runs after manual placement so the designer's intent stays primary while still resisting polish.
    do {
      if (attempts <= totalSlots) {
        dx = boundedJitter(generator, ENTROPY_X);
        dy = boundedJitter(generator, ENTROPY_Y);
      } else {
        // Deterministic fallback: walk the space systematically to guarantee uniqueness if randomness collides.
        const offset = attempts - totalSlots;
        dx = (offset % (ENTROPY_X * 2 + 1)) - ENTROPY_X;
        dy = (Math.floor(offset / (ENTROPY_X * 2 + 1)) % (ENTROPY_Y * 2 + 1)) - ENTROPY_Y;
      }

      attempts += 1;
    } while ((dx === 0 && dy === 0) || takenOffsets.has(`${dx},${dy}`));

    takenOffsets.add(`${dx},${dy}`);

    const currentLeft = parseFloat(node.style.left || window.getComputedStyle(node).left) || 0;
    const currentTop = parseFloat(node.style.top || window.getComputedStyle(node).top) || 0;

    // Determinism matters so the discomfort can be tuned, reviewed, and shared without surprises.
    node.style.left = `${currentLeft + dx}px`;
    node.style.top = `${currentTop + dy}px`;
  });
}

// Snapping or alignment would erase the tension we want; offsets stay irregular and are applied once on load.
window.addEventListener('DOMContentLoaded', applyLayoutEntropy);
