/**
 * AudioAnalysisEngine.ts
 * Real-time DSP analysis of audio using Web Audio API
 * Computes FFT, energy bands, spectral features, and onset detection
 */

export interface AudioFeatures {
  timestamp: number;
  energy: number;
  spectralCentroid: number;
  spectralFlux: number;
  lowEnergy: number;
  midEnergy: number;
  highEnergy: number;
  rms: number;
}

export interface OnsetEvent {
  timestamp: number;
  strength: number;
}

export interface EnergyEvent {
  timestamp: number;
  type: 'rise' | 'drop';
  magnitude: number;
}

export type AnalysisEventType = 'onset' | 'energyRise' | 'energyDrop' | 'features';

export type AnalysisEventListener = (event: OnsetEvent | EnergyEvent | AudioFeatures) => void;

export class AudioAnalysisEngine {
  private audioContext: AudioContext;
  private analyserNode: AnalyserNode;
  private gainNode: GainNode;
  private isActive = false;
  private animationFrameId: number | null = null;

  // FFT data buffers
  private fftSize = 2048;
  private frequencyData: Uint8Array<ArrayBuffer>;
  private timeDomainData: Uint8Array<ArrayBuffer>;

  // Analysis state
  private previousSpectrum: Float32Array | null = null;
  private energyHistory: number[] = [];
  private energyHistorySize = 43; // ~1 second at 60fps
  private lastOnsetTime = 0;
  private onsetThreshold = 1.5;
  private onsetCooldown = 100; // ms

  // Event listeners
  private listeners: Map<AnalysisEventType, Set<AnalysisEventListener>> = new Map();

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;

    // Create analyser node
    this.analyserNode = audioContext.createAnalyser();
    this.analyserNode.fftSize = this.fftSize;
    this.analyserNode.smoothingTimeConstant = 0.6;

    // Create pass-through gain node
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 1.0;

    // Connect: input -> analyser -> gain -> output
    this.analyserNode.connect(this.gainNode);

    // Initialize buffers
    this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    this.timeDomainData = new Uint8Array(this.analyserNode.fftSize) as Uint8Array<ArrayBuffer>;
  }

  /**
   * Connect audio source to analysis engine
   */
  connectSource(sourceNode: AudioNode): void {
    sourceNode.connect(this.analyserNode);
  }

  /**
   * Get the output node to connect to destination
   */
  getOutputNode(): GainNode {
    return this.gainNode;
  }

  /**
   * Start analysis loop
   */
  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.energyHistory = [];
    this.previousSpectrum = null;
    this.analyse();
  }

  /**
   * Stop analysis loop
   */
  stop(): void {
    this.isActive = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Main analysis loop
   */
  private analyse = (): void => {
    if (!this.isActive) return;

    // Get frequency and time domain data
    this.analyserNode.getByteFrequencyData(this.frequencyData);
    this.analyserNode.getByteTimeDomainData(this.timeDomainData);

    // Compute features
    const features = this.computeFeatures();
    this.emit('features', features);

    // Detect onsets
    const onset = this.detectOnset(features);
    if (onset) {
      this.emit('onset', onset);
    }

    // Detect energy changes
    const energyEvent = this.detectEnergyChange(features.energy);
    if (energyEvent) {
      if (energyEvent.type === 'rise') {
        this.emit('energyRise', energyEvent);
      } else {
        this.emit('energyDrop', energyEvent);
      }
    }

    // Continue loop
    this.animationFrameId = requestAnimationFrame(this.analyse);
  };

  /**
   * Compute audio features from current frame
   */
  private computeFeatures(): AudioFeatures {
    const timestamp = this.audioContext.currentTime;
    const spectrum = new Float32Array(this.frequencyData.length);
    
    // Normalize frequency data to 0-1 range
    for (let i = 0; i < this.frequencyData.length; i++) {
      spectrum[i] = this.frequencyData[i] / 255;
    }

    // Compute RMS energy
    const rms = this.computeRMS(this.timeDomainData);

    // Compute total energy
    const energy = spectrum.reduce((sum, val) => sum + val * val, 0) / spectrum.length;

    // Compute energy bands
    const lowEnergy = this.computeBandEnergy(spectrum, 0, 0.2);
    const midEnergy = this.computeBandEnergy(spectrum, 0.2, 0.6);
    const highEnergy = this.computeBandEnergy(spectrum, 0.6, 1.0);

    // Compute spectral centroid
    const spectralCentroid = this.computeSpectralCentroid(spectrum);

    // Compute spectral flux
    const spectralFlux = this.computeSpectralFlux(spectrum);

    return {
      timestamp,
      energy,
      spectralCentroid,
      spectralFlux,
      lowEnergy,
      midEnergy,
      highEnergy,
      rms,
    };
  }

  /**
   * Compute RMS (root mean square) from time domain data
   */
  private computeRMS(timeDomain: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < timeDomain.length; i++) {
      const normalized = (timeDomain[i] - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / timeDomain.length);
  }

  /**
   * Compute energy in a frequency band
   */
  private computeBandEnergy(spectrum: Float32Array, startRatio: number, endRatio: number): number {
    const startIdx = Math.floor(startRatio * spectrum.length);
    const endIdx = Math.floor(endRatio * spectrum.length);
    let sum = 0;
    for (let i = startIdx; i < endIdx; i++) {
      sum += spectrum[i] * spectrum[i];
    }
    return sum / (endIdx - startIdx);
  }

  /**
   * Compute spectral centroid (brightness measure)
   */
  private computeSpectralCentroid(spectrum: Float32Array): number {
    let weightedSum = 0;
    let totalMagnitude = 0;
    
    for (let i = 0; i < spectrum.length; i++) {
      weightedSum += i * spectrum[i];
      totalMagnitude += spectrum[i];
    }

    return totalMagnitude > 0 ? weightedSum / totalMagnitude / spectrum.length : 0;
  }

  /**
   * Compute spectral flux (measure of spectral change)
   */
  private computeSpectralFlux(spectrum: Float32Array): number {
    if (!this.previousSpectrum) {
      this.previousSpectrum = new Float32Array(spectrum);
      return 0;
    }

    let flux = 0;
    for (let i = 0; i < spectrum.length; i++) {
      const diff = spectrum[i] - this.previousSpectrum[i];
      flux += diff > 0 ? diff : 0; // Half-wave rectification
    }

    // Update previous spectrum
    this.previousSpectrum.set(spectrum);

    return flux / spectrum.length;
  }

  /**
   * Detect onsets using spectral flux
   */
  private detectOnset(features: AudioFeatures): OnsetEvent | null {
    const now = Date.now();
    
    // Check cooldown
    if (now - this.lastOnsetTime < this.onsetCooldown) {
      return null;
    }

    // Use spectral flux and high-frequency energy for onset detection
    const onsetStrength = features.spectralFlux + features.highEnergy * 0.5;

    // Compute adaptive threshold from recent history
    const avgEnergy = this.energyHistory.length > 0
      ? this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length
      : 0.1;

    const threshold = avgEnergy * this.onsetThreshold;

    if (onsetStrength > threshold && onsetStrength > 0.15) {
      this.lastOnsetTime = now;
      return {
        timestamp: features.timestamp,
        strength: onsetStrength,
      };
    }

    return null;
  }

  /**
   * Detect energy rises and drops
   */
  private detectEnergyChange(currentEnergy: number): EnergyEvent | null {
    // Add to history
    this.energyHistory.push(currentEnergy);
    if (this.energyHistory.length > this.energyHistorySize) {
      this.energyHistory.shift();
    }

    // Need enough history
    if (this.energyHistory.length < 10) {
      return null;
    }

    // Compute short-term and medium-term averages
    const recentSize = 5;
    const recent = this.energyHistory.slice(-recentSize);
    const previous = this.energyHistory.slice(-this.energyHistorySize, -recentSize);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const previousAvg = previous.reduce((a, b) => a + b, 0) / previous.length;

    const ratio = previousAvg > 0 ? recentAvg / previousAvg : 1;
    const riseThreshold = 1.4;
    const dropThreshold = 0.6;

    if (ratio > riseThreshold) {
      return {
        timestamp: this.audioContext.currentTime,
        type: 'rise',
        magnitude: ratio,
      };
    } else if (ratio < dropThreshold) {
      return {
        timestamp: this.audioContext.currentTime,
        type: 'drop',
        magnitude: ratio,
      };
    }

    return null;
  }

  /**
   * Add event listener
   */
  on(eventType: AnalysisEventType, listener: AnalysisEventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
  }

  /**
   * Remove event listener
   */
  off(eventType: AnalysisEventType, listener: AnalysisEventListener): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Emit event to listeners
   */
  private emit(eventType: AnalysisEventType, data: OnsetEvent | EnergyEvent | AudioFeatures): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }

  /**
   * Configure onset detection sensitivity
   */
  setOnsetThreshold(threshold: number): void {
    this.onsetThreshold = Math.max(0.5, Math.min(3, threshold));
  }

  /**
   * Get current FFT data (for visualization)
   */
  getFrequencyData(): Uint8Array {
    return this.frequencyData;
  }

  /**
   * Get current time domain data (for waveform visualization)
   */
  getTimeDomainData(): Uint8Array {
    return this.timeDomainData;
  }

  /**
   * Check if analysis is running
   */
  isRunning(): boolean {
    return this.isActive;
  }
}
