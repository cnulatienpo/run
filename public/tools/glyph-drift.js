'use strict';

// Glyph-level variation keeps text editable and accessible while avoiding the "stamped" look
// that a single global distortion would create across the entire word.
// Minute baseline shifts mimic pen pressure and hand movement; they read as handwriting
// more than heavy shape distortion would.
// Deterministic output is vital so layout, filters, and reviews remain consistent across renders.
const SEED = 20240817;

const SVG_NS = 'http://www.w3.org/2000/svg';

function createRng(seed) {
  // Mulberry32-style generator for stable, repeatable values.
  return function rng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deriveSeed(base, label) {
  let hash = base;
  for (let i = 0; i < label.length; i += 1) {
    hash ^= label.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash >>> 0;
}

function jitter(rng, min, max) {
  return min + (max - min) * rng();
}

function jitterSigned(rng, min, max) {
  const magnitude = jitter(rng, min, max);
  return rng() > 0.5 ? magnitude : -magnitude;
}

function applyGlyphDrift(root = document) {
  const words = Array.from(root.querySelectorAll('text[data-drift="true"]'));

  words.forEach((textEl, wordIndex) => {
    if (textEl.dataset.driftApplied === 'true') return;

    const content = textEl.textContent;
    if (!content) return;

    const baseX = textEl.getAttribute('x');
    const baseY = textEl.getAttribute('y');

    const rng = createRng(deriveSeed(SEED + wordIndex, content));
    const directionalBias = jitterSigned(rng, 0.1, 0.35); // subtle upward/downward trend in px per glyph

    textEl.textContent = '';

    for (let i = 0; i < content.length; i += 1) {
      const glyph = content[i];
      const tspan = document.createElementNS(SVG_NS, 'tspan');

      if (i === 0) {
        if (baseX !== null) tspan.setAttribute('x', baseX);
        if (baseY !== null) tspan.setAttribute('y', baseY);
      }

      const baselineDrift = jitterSigned(rng, 1, 3);
      const scale = 1 + jitterSigned(rng, 0.02, 0.04);
      const rotation = jitterSigned(rng, 1, 2);
      const horizontalNudge = jitterSigned(rng, 0.05, 0.35);
      const biasLift = directionalBias * i;

      tspan.textContent = glyph;
      tspan.setAttribute('dx', horizontalNudge.toFixed(2));
      tspan.setAttribute(
        'style',
        [
          `transform: translate(0px, ${(baselineDrift + biasLift).toFixed(2)}px) rotate(${rotation.toFixed(
            2
          )}deg) scale(${scale.toFixed(4)})`,
          'transform-box: fill-box',
          'transform-origin: center',
          'display: inline-block',
        ].join('; ')
      );

      textEl.appendChild(tspan);
    }

    textEl.dataset.driftApplied = 'true';
  });
}

function runWhenReady() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyGlyphDrift());
  } else {
    applyGlyphDrift();
  }
}

runWhenReady();
