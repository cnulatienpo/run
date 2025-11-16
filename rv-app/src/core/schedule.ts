import { Item, Plan, PlanEntry, RunMode } from './schema.js';

function dwellForItem(item: Item): number {
  const wordCount = `${item.front} ${item.back ?? ''}`.trim().split(/\s+/).length;
  return Math.min(9, 2.5 + wordCount * 0.3);
}

export function buildPlan(items: Item[], mode: RunMode, durationSec = 3600): Plan {
  const baseId = `plan-${Date.now()}`;
  const schedule: PlanEntry[] = [];
  if (mode === 'freestyle') {
    let atSec = 0;
    items.forEach((item) => {
      schedule.push({ itemId: item.id, atSec, dwell: dwellForItem(item) });
      atSec += 30;
    });
    return { id: baseId, mode, schedule };
  }
  const intervalMin = 25;
  const intervalMax = 45;
  let atSec = 0;
  let index = 0;
  while (atSec < durationSec && index < items.length) {
    const item = items[index % items.length];
    const dwell = dwellForItem(item);
    schedule.push({ itemId: item.id, atSec, dwell });
    const cooldown = 2 + Math.random() * 2;
    const jitter = intervalMin + Math.random() * (intervalMax - intervalMin);
    atSec += dwell + cooldown + jitter;
    index += 1;
  }
  return { id: baseId, mode, durationSec, schedule };
}
