export function softPulse(el, duration = 2200) {
  el.classList.add('fx-softPulse');
  setTimeout(() => el.classList.remove('fx-softPulse'), duration);
}

export function scanline(el, duration = 1600) {
  el.classList.add('fx-scanline');
  setTimeout(() => el.classList.remove('fx-scanline'), duration);
}
