/**
 * DATA MODEL DIVERGENCE WARNING:
 * rv-app uses Deck + Mnemonic objects stored in IndexedDB.
 * backend/clip library uses ClipMetadata stored in JSON.
 * These models DO NOT align and are NOT synced.
 * No mapping exists; no transformation layer implemented.
 * High-risk architectural mismatch.
 */

export type MnemonicDevice = 'pun' | 'metaphor' | 'loci' | 'PAO' | 'acrostic';
export type AbsurdityLevel = 'mild' | 'medium' | 'wild';
export type RunMode = '60min' | 'custom' | 'freestyle';

export interface Profile {
  id: string;
  createdAt: number;
  mnemonicPrefs: {
    devices: MnemonicDevice[];
    absurdity: AbsurdityLevel;
    complexity: 2 | 3 | 4 | 5;
  };
  audioPrefs: {
    mode: 'silent' | 'earcons' | 'whisper' | 'voiceover';
    talkback: 'off' | 'short' | 'long';
  };
  safety: {
    sfw: boolean;
    motion: 'gentle';
  };
  cityAnchors: string[];
  defaults: {
    runMode: RunMode;
  };
}

export interface Item {
  id: string;
  type: 'fact' | 'flashcard' | 'concept' | 'list';
  front: string;
  back?: string;
  tags: string[];
  difficulty?: 'easy' | 'med' | 'hard';
}

export interface Deck {
  id: string;
  name: string;
  sourceMeta?: Record<string, unknown>;
  tags: string[];
  items: Item[];
}

export interface MnemonicSceneBrief {
  anchor: string;
  mascot: string;
  action: string;
  colors: string[];
  absurdity: AbsurdityLevel;
  complexity: number;
}

export interface Mnemonic {
  id: string;
  itemId: string;
  sceneBrief: MnemonicSceneBrief;
  hookPhrase: string;
  whisperText: string;
  locked: boolean;
  media: {
    thumbUrl?: string;
    earconId?: string;
  };
}

export interface PlanEntry {
  itemId: string;
  atSec: number;
  dwell: number;
}

export interface Plan {
  id: string;
  mode: RunMode;
  durationSec?: number;
  schedule: PlanEntry[];
}

export interface SessionLogEvent {
  atSec: number;
  itemId: string;
  action: 'shown' | 'repeat' | 'heard' | 'unsure';
}

export interface SessionLog {
  id: string;
  planId: string;
  startedAt: number;
  events: SessionLogEvent[];
  endedAt?: number;
}

export interface Pack {
  profileId: string;
  decks: Deck[];
  mnemonics: Mnemonic[];
  sessions: SessionLog[];
}

export interface RVPrefs {
  id: string;
  hush: boolean;
  quietUntil?: number;
}
