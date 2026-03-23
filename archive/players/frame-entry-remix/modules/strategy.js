import { ENTRY_MODES } from './entryMode.js';

const cycleOrder = ENTRY_MODES.slice();
let cycleIndex = 0;

export function randomEntryMode() {
  const idx = Math.floor(Math.random() * ENTRY_MODES.length);
  return ENTRY_MODES[idx];
}

export function nextCycledMode() {
  const mode = cycleOrder[cycleIndex % cycleOrder.length];
  cycleIndex += 1;
  return mode;
}

export function chooseAutoMode(context) {
  if (context.randomize) return randomEntryMode();
  return context.baseMode;
}

export function chooseSmartMode(context) {
  const prev = context.previousClipState;
  if (!prev) return 'middle_forward';

  if (prev.direction === 'forward' && prev.exitRatio >= 0.8) {
    return 'end_forward';
  }

  if (prev.transitionDelta >= 0.4) {
    return 'middle_forward';
  }

  if (prev.motionScore <= 0.15) {
    return 'middle_reverse';
  }

  return context.baseMode || 'start_forward';
}

export function resolveEntryMode({
  strategy = 'manual',
  baseMode = 'start_forward',
  randomize = false,
  autoCycle = false,
  previousClipState = null,
}) {
  if (autoCycle) return nextCycledMode();
  if (strategy === 'auto') {
    return chooseAutoMode({ baseMode, randomize, previousClipState });
  }
  if (strategy === 'smart') {
    return chooseSmartMode({ baseMode, previousClipState });
  }
  if (randomize) return randomEntryMode();
  return baseMode;
}
