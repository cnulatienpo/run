/**
 * MusicEventBridge.ts
 * Bridges real-time music analysis events to hallucinationEngine
 * Coordinates AudioPlaybackEngine, AudioAnalysisEngine, and TempoDetector
 */
export class MusicEventBridge {
    constructor(playbackEngine, analysisEngine, tempoDetector) {
        this.callbacks = {};
        this.isActive = false;
        this.bpmUpdateInterval = null;
        this.playbackEngine = playbackEngine;
        this.analysisEngine = analysisEngine;
        this.tempoDetector = tempoDetector;
        this.setupEventListeners();
    }
    /**
     * Set up event listeners for analysis events
     */
    setupEventListeners() {
        // Listen for onset events
        this.analysisEngine.on('onset', (event) => {
            const onsetEvent = event;
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
                this.callbacks.onEnergyRise(event);
            }
        });
        // Listen for energy drop events
        this.analysisEngine.on('energyDrop', (event) => {
            if (this.callbacks.onEnergyDrop) {
                this.callbacks.onEnergyDrop(event);
            }
        });
        // Listen for features (optional, for debugging/viz)
        this.analysisEngine.on('features', (event) => {
            if (this.callbacks.onFeatures) {
                this.callbacks.onFeatures(event);
            }
        });
    }
    /**
     * Register callbacks for music events
     */
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }
    /**
     * Start the bridge (begins analysis and tempo detection)
     */
    start() {
        if (this.isActive)
            return;
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
    stop() {
        if (!this.isActive)
            return;
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
    getCurrentBpm() {
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
    isRunning() {
        return this.isActive;
    }
    /**
     * Manually set BPM (for override or testing)
     */
    setBpm(bpm) {
        this.tempoDetector.setBpm(bpm);
        if (this.callbacks.onBpmUpdate) {
            this.callbacks.onBpmUpdate(bpm, 1.0);
        }
    }
}
