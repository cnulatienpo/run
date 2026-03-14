import { Item, Mnemonic, Plan, SessionLog } from './schema.js';

export interface SessionState {
  plan: Plan;
  mnemonics: Mnemonic[];
  startedAt: number;
  pointer: number;
  log: SessionLog;
}

export function startSession(plan: Plan, mnemonics: Mnemonic[]): SessionState {
  return {
    plan,
    mnemonics,
    startedAt: Date.now(),
    pointer: 0,
    log: {
      id: `session-${Date.now()}`,
      planId: plan.id,
      startedAt: Date.now(),
      events: [],
    },
  };
}

export function getCurrentMnemonic(state: SessionState): Mnemonic | null {
  const entry = state.plan.schedule[state.pointer];
  if (!entry) return null;
  return state.mnemonics.find((m) => m.itemId === entry.itemId) ?? null;
}

export function advance(state: SessionState, action: SessionLog['events'][number]['action']) {
  const entry = state.plan.schedule[state.pointer];
  if (!entry) return;
  state.log.events.push({ atSec: entry.atSec, itemId: entry.itemId, action });
  state.pointer = Math.min(state.pointer + 1, state.plan.schedule.length - 1);
}

export function markComplete(state: SessionState) {
  state.log.endedAt = Date.now();
}

export function findItem(items: Item[], id: string) {
  return items.find((item) => item.id === id);
}
