export function softPulse(el, duration = 2200) {
  if (!el) return;
  el.classList.add('fx-softPulse');
  window.setTimeout(() => el.classList.remove('fx-softPulse'), duration);
}

export function scanline(el, duration = 1600) {
  if (!el) return;
  el.classList.add('fx-scanline');
  window.setTimeout(() => el.classList.remove('fx-scanline'), duration);
}
