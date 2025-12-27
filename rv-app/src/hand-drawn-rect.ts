/**
 * Procedural hand-drawn rectangle SVG generator.
 * Adapted from renderer/hand-drawn-rect.js for rv-app.
 */
export function createHandDrawnRectSVG(
  width: number,
  height: number,
  options: Partial<{
    stroke: string;
    strokeWidth: number;
    wobble: number;
    overshoot: number;
  }> = {}
): SVGSVGElement {
  const {
    stroke = '#1f2a44',
    strokeWidth = 2.5,
    wobble = 2.5,
    overshoot = 8,
  } = options;

  function rand(seed: number) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function jitter(val: number, amt: number, seed: number) {
    return val + (rand(seed) - 0.5) * amt;
  }

  // Four corners, with overshoot
  const points = [
    [-overshoot, -overshoot],
    [width + overshoot, -overshoot],
    [width + overshoot, height + overshoot],
    [-overshoot, height + overshoot],
  ];

  let path = '';
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % 4];
    path += `M${jitter(x1, wobble, i)} ${jitter(y1, wobble, i + 10)} `;
    path += `L${jitter(x2, wobble, i + 20)} ${jitter(y2, wobble, i + 30)} `;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width + overshoot * 2));
  svg.setAttribute('height', String(height + overshoot * 2));
  svg.setAttribute('viewBox', `0 0 ${width + overshoot * 2} ${height + overshoot * 2}`);

  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathEl.setAttribute('d', path);
  pathEl.setAttribute('stroke', stroke);
  pathEl.setAttribute('stroke-width', String(strokeWidth));
  pathEl.setAttribute('fill', 'none');
  pathEl.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(pathEl);

  return svg;
}