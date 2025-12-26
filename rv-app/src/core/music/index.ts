/**
 * Music system exports
 * Complete music-driven animation pipeline
 */

export { AudioFileLoader } from './AudioFileLoader.js';
export type { AudioFileMetadata } from './AudioFileLoader.js';

export { AudioDecoder } from './AudioDecoder.js';

export { AudioPlaybackEngine } from './AudioPlaybackEngine.js';
export type { PlaybackState, PlaybackStatus } from './AudioPlaybackEngine.js';

export { AudioAnalysisEngine } from './AudioAnalysisEngine.js';
export type {
  AudioFeatures,
  OnsetEvent,
  EnergyEvent,
  AnalysisEventType,
  AnalysisEventListener,
} from './AudioAnalysisEngine.js';

export { TempoDetector } from './TempoDetector.js';
export type { BeatEvent, TempoInfo } from './TempoDetector.js';

export { MusicEventBridge } from './MusicEventBridge.js';
export type { MusicEventCallbacks } from './MusicEventBridge.js';
