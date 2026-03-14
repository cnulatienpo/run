/**
 * TempoDetector.ts
 * BPM detection and beat tracking using onset data
 * Implements autocorrelation-based tempo estimation with smoothing
 */

export interface BeatEvent {
  timestamp: number;
  beatNumber: number;
  confidence: number;
}

export interface TempoInfo {
  bpm: number;
  confidence: number;
  beatInterval: number; // in seconds
  lastBeatTime: number;
  nextBeatTime: number;
}

export class TempoDetector {
  private onsetHistory: number[] = [];
  private beatHistory: number[] = [];
  private currentBpm = 120;
  private beatInterval = 0.5; // 120 BPM = 0.5s per beat
  private lastBeatTime = 0;
  private beatCounter = 0;
  private confidence = 0;
  
  // Configuration
  private readonly minBpm = 60;
  private readonly maxBpm = 180;
  private readonly historySize = 100;
  private readonly beatHistorySize = 8;
  private readonly smoothingFactor = 0.85;

  /**
   * Process an onset event
   */
  processOnset(timestamp: number, strength: number): BeatEvent | null {
    // Add onset to history
    this.onsetHistory.push(timestamp);
    if (this.onsetHistory.length > this.historySize) {
      this.onsetHistory.shift();
    }

    // Need enough onsets to estimate tempo
    if (this.onsetHistory.length < 8) {
      return null;
    }

    // Periodically re-estimate BPM
    if (this.onsetHistory.length % 8 === 0) {
      this.estimateTempo();
    }

    // Check if this onset is a beat
    return this.detectBeat(timestamp, strength);
  }

  /**
   * Estimate tempo from onset history using autocorrelation
   */
  private estimateTempo(): void {
    if (this.onsetHistory.length < 8) return;

    // Compute inter-onset intervals (IOIs)
    const intervals: number[] = [];
    for (let i = 1; i < this.onsetHistory.length; i++) {
      const interval = this.onsetHistory[i] - this.onsetHistory[i - 1];
      if (interval > 0.1 && interval < 2.0) { // Filter outliers
        intervals.push(interval);
      }
    }

    if (intervals.length < 4) return;

    // Find most common interval using histogram
    const histogram = this.buildIntervalHistogram(intervals);
    const peakInterval = this.findHistogramPeak(histogram);

    if (peakInterval > 0) {
      // Convert interval to BPM
      const estimatedBpm = 60 / peakInterval;
      
      // Clamp to valid range
      const clampedBpm = Math.max(this.minBpm, Math.min(this.maxBpm, estimatedBpm));

      // Smooth with previous estimate
      this.currentBpm = this.currentBpm * this.smoothingFactor + clampedBpm * (1 - this.smoothingFactor);
      this.beatInterval = 60 / this.currentBpm;

      // Update confidence based on histogram clarity
      this.confidence = this.calculateConfidence(histogram, peakInterval);
    }
  }

  /**
   * Build histogram of intervals
   */
  private buildIntervalHistogram(intervals: number[]): Map<number, number> {
    const binSize = 0.02; // 20ms bins
    const histogram = new Map<number, number>();

    for (const interval of intervals) {
      const bin = Math.round(interval / binSize) * binSize;
      histogram.set(bin, (histogram.get(bin) || 0) + 1);
    }

    return histogram;
  }

  /**
   * Find peak in histogram
   */
  private findHistogramPeak(histogram: Map<number, number>): number {
    let maxCount = 0;
    let peakInterval = 0;

    histogram.forEach((count, interval) => {
      if (count > maxCount) {
        maxCount = count;
        peakInterval = interval;
      }
    });

    return peakInterval;
  }

  /**
   * Calculate confidence based on histogram clarity
   */
  private calculateConfidence(histogram: Map<number, number>, peakInterval: number): number {
    const peakCount = histogram.get(peakInterval) || 0;
    const totalCount = Array.from(histogram.values()).reduce((sum, count) => sum + count, 0);
    
    if (totalCount === 0) return 0;

    // Confidence is ratio of peak to total
    const rawConfidence = peakCount / totalCount;
    
    // Boost confidence if we have enough history
    const historyBoost = Math.min(1, this.beatHistory.length / this.beatHistorySize);
    
    return rawConfidence * historyBoost;
  }

  /**
   * Detect if onset is a beat
   */
  private detectBeat(timestamp: number, strength: number): BeatEvent | null {
    // First beat
    if (this.lastBeatTime === 0) {
      this.lastBeatTime = timestamp;
      this.beatCounter = 1;
      this.beatHistory.push(timestamp);
      return {
        timestamp,
        beatNumber: this.beatCounter,
        confidence: 0.5,
      };
    }

    // Check if enough time has passed for next beat
    const timeSinceLastBeat = timestamp - this.lastBeatTime;
    const expectedBeatTime = this.beatInterval * 0.8; // Allow 20% early
    const lateBeatTime = this.beatInterval * 1.2; // Allow 20% late

    if (timeSinceLastBeat < expectedBeatTime) {
      return null; // Too soon
    }

    // Strong onset within beat window = beat
    if (timeSinceLastBeat <= lateBeatTime && strength > 0.2) {
      this.lastBeatTime = timestamp;
      this.beatCounter++;
      
      // Update beat history
      this.beatHistory.push(timestamp);
      if (this.beatHistory.length > this.beatHistorySize) {
        this.beatHistory.shift();
      }

      // Adjust beat interval based on actual timing
      if (this.beatHistory.length >= 2) {
        const recentIntervals = [];
        for (let i = 1; i < this.beatHistory.length; i++) {
          recentIntervals.push(this.beatHistory[i] - this.beatHistory[i - 1]);
        }
        const avgInterval = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
        this.beatInterval = this.beatInterval * 0.9 + avgInterval * 0.1;
        this.currentBpm = 60 / this.beatInterval;
      }

      return {
        timestamp,
        beatNumber: this.beatCounter,
        confidence: this.confidence,
      };
    }

    // Missed beat - predict where it should have been
    if (timeSinceLastBeat > lateBeatTime) {
      const missedBeats = Math.floor(timeSinceLastBeat / this.beatInterval);
      this.lastBeatTime += missedBeats * this.beatInterval;
      this.beatCounter += missedBeats;
      
      // Lower confidence when we miss beats
      this.confidence *= 0.9;
    }

    return null;
  }

  /**
   * Get current tempo information
   */
  getTempoInfo(): TempoInfo {
    return {
      bpm: Math.round(this.currentBpm),
      confidence: this.confidence,
      beatInterval: this.beatInterval,
      lastBeatTime: this.lastBeatTime,
      nextBeatTime: this.lastBeatTime + this.beatInterval,
    };
  }

  /**
   * Manually set BPM (for testing or manual override)
   */
  setBpm(bpm: number): void {
    this.currentBpm = Math.max(this.minBpm, Math.min(this.maxBpm, bpm));
    this.beatInterval = 60 / this.currentBpm;
    this.confidence = 1.0;
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.onsetHistory = [];
    this.beatHistory = [];
    this.lastBeatTime = 0;
    this.beatCounter = 0;
    this.confidence = 0;
  }

  /**
   * Get current BPM
   */
  getBpm(): number {
    return Math.round(this.currentBpm);
  }

  /**
   * Check if on beat (within tolerance window)
   */
  isOnBeat(timestamp: number, tolerance = 0.05): boolean {
    if (this.lastBeatTime === 0) return false;
    
    const timeSinceLastBeat = timestamp - this.lastBeatTime;
    const phase = (timeSinceLastBeat % this.beatInterval) / this.beatInterval;
    
    // Check if within tolerance of beat (0) or offbeat (0.5)
    return phase < tolerance || phase > (1 - tolerance);
  }

  /**
   * Predict next beat time
   */
  predictNextBeat(): number {
    if (this.lastBeatTime === 0) return 0;
    return this.lastBeatTime + this.beatInterval;
  }

  /**
   * Get beat phase (0-1, where 0 is on beat)
   */
  getBeatPhase(timestamp: number): number {
    if (this.lastBeatTime === 0) return 0;
    
    const timeSinceLastBeat = timestamp - this.lastBeatTime;
    return (timeSinceLastBeat % this.beatInterval) / this.beatInterval;
  }
}
