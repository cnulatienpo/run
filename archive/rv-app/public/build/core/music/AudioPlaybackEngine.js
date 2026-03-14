/**
 * AudioPlaybackEngine.ts
 * Manages audio playback using Web Audio API
 * Handles play/pause/seek/stop and gain control
 */
export class AudioPlaybackEngine {
    constructor(audioContext) {
        this.source = null;
        this.buffer = null;
        this.state = 'stopped';
        this.startTime = 0;
        this.pauseTime = 0;
        this.onEndedCallback = null;
        this.audioContext = audioContext;
        this.gainNode = audioContext.createGain();
        this.gainNode.connect(audioContext.destination);
        this.gainNode.gain.value = 0.7;
    }
    /**
     * Load an audio buffer for playback
     */
    loadBuffer(audioBuffer) {
        this.stop();
        this.buffer = audioBuffer;
        this.state = 'stopped';
        this.startTime = 0;
        this.pauseTime = 0;
    }
    /**
     * Start or resume playback
     */
    play() {
        if (!this.buffer) {
            throw new Error('No audio buffer loaded');
        }
        if (this.state === 'playing') {
            return; // Already playing
        }
        // Create new source node
        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.connect(this.gainNode);
        // Set up ended callback
        this.source.onended = () => {
            if (this.state !== 'stopped') {
                this.state = 'stopped';
                this.pauseTime = 0;
                this.startTime = 0;
                if (this.onEndedCallback) {
                    this.onEndedCallback();
                }
            }
        };
        // Calculate offset for resume
        const offset = this.state === 'paused' ? this.pauseTime : 0;
        // Start playback
        this.source.start(0, offset);
        this.startTime = this.audioContext.currentTime - offset;
        this.state = 'playing';
    }
    /**
     * Pause playback
     */
    pause() {
        if (this.state !== 'playing') {
            return;
        }
        this.pauseTime = this.getCurrentTime();
        this.stop();
        this.state = 'paused';
    }
    /**
     * Stop playback completely
     */
    stop() {
        if (this.source) {
            try {
                this.source.stop();
            }
            catch (e) {
                // Source may already be stopped
            }
            this.source.disconnect();
            this.source = null;
        }
        this.state = 'stopped';
        this.startTime = 0;
        this.pauseTime = 0;
    }
    /**
     * Seek to a specific time
     */
    seek(time) {
        if (!this.buffer) {
            throw new Error('No audio buffer loaded');
        }
        const wasPlaying = this.state === 'playing';
        this.stop();
        this.pauseTime = Math.max(0, Math.min(time, this.buffer.duration));
        this.state = 'paused';
        if (wasPlaying) {
            this.play();
        }
    }
    /**
     * Get current playback time in seconds
     */
    getCurrentTime() {
        if (this.state === 'playing' && this.buffer) {
            const elapsed = this.audioContext.currentTime - this.startTime;
            return Math.min(elapsed, this.buffer.duration);
        }
        else if (this.state === 'paused') {
            return this.pauseTime;
        }
        return 0;
    }
    /**
     * Get total duration
     */
    getDuration() {
        return this.buffer?.duration || 0;
    }
    /**
     * Set volume (0.0 to 1.0)
     */
    setVolume(volume) {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        this.gainNode.gain.value = clampedVolume;
    }
    /**
     * Get current volume
     */
    getVolume() {
        return this.gainNode.gain.value;
    }
    /**
     * Get playback state
     */
    getState() {
        return this.state;
    }
    /**
     * Get full playback status
     */
    getStatus() {
        return {
            state: this.state,
            currentTime: this.getCurrentTime(),
            duration: this.getDuration(),
            volume: this.getVolume(),
        };
    }
    /**
     * Set callback for when playback ends
     */
    onEnded(callback) {
        this.onEndedCallback = callback;
    }
    /**
     * Get the gain node for connecting analysis nodes
     */
    getGainNode() {
        return this.gainNode;
    }
    /**
     * Check if audio is loaded
     */
    isLoaded() {
        return this.buffer !== null;
    }
}
