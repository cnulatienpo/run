/**
 * MusicEventBridge.ts
 * Bridges real-time music analysis events to hallucinationEngine
 * Coordinates AudioPlaybackEngine, AudioAnalysisEngine, and TempoDetector
 */

import { AudioPlaybackEngine } from './AudioPlaybackEngine.js';
import { AudioAnalysisEngine, AudioFeatures, OnsetEvent, EnergyEvent } from './AudioAnalysisEngine.js';
import { TempoDetector, BeatEvent } from './TempoDetector.js';

export interface MusicEventCallbacks {
  onBeat?: (event: BeatEvent) => void;
  onOnset?: (event: OnsetEvent) => void;
  onEnergyRise?: (event: EnergyEvent) => void;
  onEnergyDrop?: (event: EnergyEvent) => void;
  onBpmUpdate?: (bpm: number, confidence: number) => void;
  onFeatures?: (features: AudioFeatures) => void;
}

export class MusicEventBridge {
  private playbackEngine: AudioPlaybackEngine;
  private analysisEngine: AudioAnalysisEngine;
  private tempoDetector: TempoDetector;
  private callbacks: MusicEventCallbacks = {};
  private isActive = false;
  private bpmUpdateInterval: number | null = null;

  constructor(
    playbackEngine: AudioPlaybackEngine,
    analysisEngine: AudioAnalysisEngine,
    tempoDetector: TempoDetector
  ) {
    this.playbackEngine = playbackEngine;
    this.analysisEngine = analysisEngine;
    this.tempoDetector = tempoDetector;

    this.setupEventListeners();
  }

  /**
   * Set up event listeners for analysis events
   */
  private setupEventListeners(): void {
    // Listen for onset events
    this.analysisEngine.on('onset', (event) => {
      const onsetEvent = event as OnsetEvent;
      
      // Process onset for tempo detection
      const beatEvent = this.tempoDetector.processOnset(onsetEvent.timestamp, onsetEvent.strength);
      
      // Emit onset callback
      if (this.callbacks.onOnset) {
        this.callbacks.onOnset(onsetEvent);
      }

      // Emit beat callback if beat detected
      if (beatEvent && this.callbacks.onBeat) {
        this.callbacks.onBeat(beatEvent);
      }
    });

    // Listen for energy rise events
    this.analysisEngine.on('energyRise', (event) => {
      if (this.callbacks.onEnergyRise) {
        this.callbacks.onEnergyRise(event as EnergyEvent);
      }
    });

    // Listen for energy drop events
    this.analysisEngine.on('energyDrop', (event) => {
      if (this.callbacks.onEnergyDrop) {
        this.callbacks.onEnergyDrop(event as EnergyEvent);
      }
    });

    // Listen for features (optional, for debugging/viz)
    this.analysisEngine.on('features', (event) => {
      if (this.callbacks.onFeatures) {
        this.callbacks.onFeatures(event as AudioFeatures);
      }
    });
  }

  /**
   * Register callbacks for music events
   */
  setCallbacks(callbacks: MusicEventCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Start the bridge (begins analysis and tempo detection)
   */
  start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.analysisEngine.start();
    this.tempoDetector.reset();

    // Periodically update BPM
    this.bpmUpdateInterval = window.setInterval(() => {
      const tempoInfo = this.tempoDetector.getTempoInfo();
      if (this.callbacks.onBpmUpdate) {
        this.callbacks.onBpmUpdate(tempoInfo.bpm, tempoInfo.confidence);
      }
    }, 500); // Update every 500ms
  }

  /**
   * Stop the bridge
   */
  stop(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.analysisEngine.stop();

    if (this.bpmUpdateInterval !== null) {
      clearInterval(this.bpmUpdateInterval);
      this.bpmUpdateInterval = null;
    }
  }

  /**
   * Get current BPM
   */
  getCurrentBpm(): number {
    return this.tempoDetector.getBpm();
  }

  /**
   * Get current tempo info
   */
  getTempoInfo() {
    return this.tempoDetector.getTempoInfo();
  }

  /**
   * Check if bridge is active
   */
  isRunning(): boolean {
    return this.isActive;
  }

  /**
   * Manually set BPM (for override or testing)
   */
  setBpm(bpm: number): void {
    this.tempoDetector.setBpm(bpm);
    if (this.callbacks.onBpmUpdate) {
      this.callbacks.onBpmUpdate(bpm, 1.0);
    }
  }
}
