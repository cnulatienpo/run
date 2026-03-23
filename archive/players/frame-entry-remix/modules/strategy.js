/*
THIS IS ARCHIVED PLAYER CODE.
DO NOT USE.
DO NOT MODIFY.
NOT PART OF ACTIVE SYSTEM.
*/

const ENTRY_MODES =
  window.__ARCHIVED_FRAME_ENTRY_ENTRY_MODE__?.ENTRY_MODES || [];

const cycleOrder = ENTRY_MODES.slice();
let cycleIndex = 0;

function randomEntryMode() {
  const idx = Math.floor(Math.random() * ENTRY_MODES.length);
  return ENTRY_MODES[idx];
}

function nextCycledMode() {
  const mode = cycleOrder[cycleIndex % cycleOrder.length];
  cycleIndex += 1;
  return mode;
}

function chooseAutoMode(context) {
  if (context.randomize) return randomEntryMode();
  return context.baseMode;
}

function chooseSmartMode(context) {
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

function resolveEntryMode({
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

if (typeof window !== 'undefined') {
  window.__ARCHIVED_FRAME_ENTRY_STRATEGY__ = {
    randomEntryMode,
    nextCycledMode,
    chooseAutoMode,
    chooseSmartMode,
    resolveEntryMode,
  };
}
