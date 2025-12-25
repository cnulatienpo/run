/**
 * PROCEDURAL HAND-DRAWN RECTANGLE DRAWING SYSTEM
 * 
 * This is NOT a UI component system.
 * This is a drawing system that makes rectangles look hand-written.
 * 
 * Every rectangle is drawn as four independent, imperfect line segments.
 * No two rectangles ever look identical.
 */

/**
 * Seeded pseudo-random number generator (Mulberry32)
 * Ensures deterministic randomness for consistent results
 */
function createRNG(seed) {
  let state = seed;
  return function() {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw a single imperfect line as a series of short strokes
 * 
 * @param {number} x1 - Start X coordinate
 * @param {number} y1 - Start Y coordinate  
 * @param {number} x2 - End X coordinate
 * @param {number} y2 - End Y coordinate
 * @param {object} options - Drawing parameters
 * @param {function} rng - Random number generator
 * @returns {string} SVG path data
 */
function drawLine(x1, y1, x2, y2, options, rng) {
  const {
    wobble = 2.5,           // Position jitter amplitude
    segments = 12,          // Number of sub-strokes
    pressureVariance = 0.4, // Stroke width variation
    jitter = 1.2,           // Angle jitter
    overshoot = 3.5,        // How far lines extend past corners
  } = options;
  
  // Calculate line vector
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  // Normalize direction
  const dirX = dx / length;
  const dirY = dy / length;
  
  // Perpendicular for wobble (normal vector)
  const perpX = -dirY;
  const perpY = dirX;
  
  // Extend line slightly past endpoints (hand-drawn overshoot)
  const startOvershoot = rng() * overshoot;
  const endOvershoot = rng() * overshoot;
  
  const actualX1 = x1 - dirX * startOvershoot;
  const actualY1 = y1 - dirY * startOvershoot;
  const actualX2 = x2 + dirX * endOvershoot;
  const actualY2 = y2 + dirY * endOvershoot;
  
  const actualLength = length + startOvershoot + endOvershoot;
  
  // Build path with segmented strokes
  let pathData = `M ${actualX1} ${actualY1}`;
  
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    
    // Base position along line
    let x = actualX1 + (actualX2 - actualX1) * t;
    let y = actualY1 + (actualY2 - actualY1) * t;
    
    // Add perpendicular wobble (hand shake)
    const wobbleAmount = (rng() - 0.5) * wobble;
    x += perpX * wobbleAmount;
    y += perpY * wobbleAmount;
    
    // Add slight angle jitter
    const angleJitter = (rng() - 0.5) * jitter;
    x += angleJitter;
    y += angleJitter;
    
    pathData += ` L ${x} ${y}`;
  }
  
  return pathData;
}

/**
 * Draw a hand-drawn rectangle by drawing four independent imperfect lines
 * 
 * @param {SVGElement} svg - Target SVG element
 * @param {number} x - Rectangle X position
 * @param {number} y - Rectangle Y position
 * @param {number} w - Rectangle width
 * @param {number} h - Rectangle height
 * @param {object} options - Drawing options
 */
export function drawHandRect(svg, x, y, w, h, options = {}) {
  const {
    seed = Date.now(),
    strokeColor = '#8b0000',
    strokeWidth = 2.0,
    wobble = 0.8,
    segments = 12,
    pressureVariance = 0.3,
    jitter = 0.5,
    overshoot = 2.5,
    style = {},
  } = options;
  
  // Create seeded RNG for deterministic results
  const rng = createRNG(seed);
  
  // Define the four corners with slight initial jitter
  const cornerJitter = 1.5;
  const x1 = x + (rng() - 0.5) * cornerJitter;
  const y1 = y + (rng() - 0.5) * cornerJitter;
  const x2 = x + w + (rng() - 0.5) * cornerJitter;
  const y2 = y + (rng() - 0.5) * cornerJitter;
  const x3 = x + w + (rng() - 0.5) * cornerJitter;
  const y3 = y + h + (rng() - 0.5) * cornerJitter;
  const x4 = x + (rng() - 0.5) * cornerJitter;
  const y4 = y + h + (rng() - 0.5) * cornerJitter;
  
  const lineOptions = {
    wobble,
    segments,
    pressureVariance,
    jitter,
    overshoot,
  };
  
  // Draw four independent lines (top, right, bottom, left)
  const lines = [
    drawLine(x1, y1, x2, y2, lineOptions, rng), // Top
    drawLine(x2, y2, x3, y3, lineOptions, rng), // Right
    drawLine(x3, y3, x4, y4, lineOptions, rng), // Bottom
    drawLine(x4, y4, x1, y1, lineOptions, rng), // Left
  ];
  
  // Create individual path elements for each line
  lines.forEach((pathData, index) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', strokeColor);
    
    // Vary stroke width slightly for pressure effect
    const pressureVariation = 1 + (rng() - 0.5) * pressureVariance;
    const actualStrokeWidth = strokeWidth * pressureVariation;
    path.setAttribute('stroke-width', actualStrokeWidth);
    
    // Apply line cap for ballpoint pen effect
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    
    // Apply custom styles
    Object.entries(style).forEach(([key, value]) => {
      path.style[key] = value;
    });
    
    svg.appendChild(path);
  });
}

/**
 * Create a button with hand-drawn rectangle frame
 * 
 * @param {string} text - Button label
 * @param {object} options - Button options
 * @returns {SVGElement} SVG button element
 */
export function createHandDrawnButton(text, options = {}) {
  const {
    width = 120,
    height = 32,
    seed = Date.now(),
    frameColor = '#8b0000',
    textColor = '#e63946',
    padding = 4,
  } = options;
  
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.cursor = 'pointer';
  svg.style.overflow = 'visible';
  
  // Draw single frame
  drawHandRect(svg, 1, 1, width - 2, height - 2, {
    seed: seed,
    strokeColor: frameColor,
    strokeWidth: 2.2,
    wobble: 2.8,
    segments: 14,
    overshoot: 6,
  });
  
  // Add text with varied positioning
  const rng = createRNG(seed + 5000);
  const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  
  // Vary horizontal alignment
  const hAlignRand = rng();
  let x, textAnchor;
  if (hAlignRand < 0.25) {
    x = 8 + rng() * 6; // Left aligned with jitter
    textAnchor = 'start';
  } else if (hAlignRand < 0.5) {
    x = width - 8 - rng() * 6; // Right aligned with jitter
    textAnchor = 'end';
  } else {
    x = width / 2 + (rng() - 0.5) * 8; // Center with jitter
    textAnchor = 'middle';
  }
  
  // Vary vertical alignment
  const vAlignRand = rng();
  let y, dominantBaseline;
  if (vAlignRand < 0.25) {
    y = 10 + rng() * 4; // Top aligned with jitter
    dominantBaseline = 'hanging';
  } else if (vAlignRand < 0.5) {
    y = height - 6 - rng() * 4; // Bottom aligned with jitter
    dominantBaseline = 'auto';
  } else {
    y = height / 2 + (rng() - 0.5) * 6; // Center with jitter
    dominantBaseline = 'central';
  }
  
  textEl.setAttribute('x', x);
  textEl.setAttribute('y', y);
  textEl.setAttribute('text-anchor', textAnchor);
  textEl.setAttribute('dominant-baseline', dominantBaseline);
  textEl.setAttribute('fill', textColor);
  textEl.setAttribute('font-weight', '900');
  textEl.setAttribute('font-size', '11');
  textEl.setAttribute('font-family', 'var(--rv-font)');
  textEl.textContent = text;
  
  svg.appendChild(textEl);
  
  return svg;
}

/**
 * Create a panel with hand-drawn border
 * 
 * @param {object} options - Panel options
 * @returns {HTMLElement} Panel element with SVG border
 */
export function createHandDrawnPanel(options = {}) {
  const {
    width = 200,
    height = 150,
    seed = Date.now(),
    borderColor = '#8b0000',
    backgroundColor = 'rgba(0, 0, 0, 0.6)',
    padding = 12,
  } = options;
  
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  
  // Background SVG with hand-drawn border
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.pointerEvents = 'none';
  
  // Add background rect (for fill)
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', 0);
  bgRect.setAttribute('y', 0);
  bgRect.setAttribute('width', width);
  bgRect.setAttribute('height', height);
  bgRect.setAttribute('fill', backgroundColor);
  svg.appendChild(bgRect);
  
  // Draw hand-drawn border
  drawHandRect(svg, 2, 2, width - 4, height - 4, {
    seed: seed,
    strokeColor: borderColor,
    strokeWidth: 2.5,
    wobble: 3.0,
    segments: 16,
    overshoot: 5,
  });
  
  container.appendChild(svg);
  
  // Content container
  const content = document.createElement('div');
  content.style.position = 'relative';
  content.style.padding = `${padding}px`;
  content.style.width = '100%';
  content.style.height = '100%';
  content.style.boxSizing = 'border-box';
  content.className = 'hand-drawn-panel-content';
  
  container.appendChild(content);
  
  return container;
}
