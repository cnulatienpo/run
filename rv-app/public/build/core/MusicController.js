/**
 * MusicController.ts
 * Standalone music controller for vanilla TypeScript pages
 * Provides simple UI controls for music playback and analysis
 */
import { AudioFileLoader, AudioDecoder, AudioPlaybackEngine, AudioAnalysisEngine, TempoDetector, MusicEventBridge, } from './music/index.js';
export class MusicController {
    constructor(containerElement) {
        this.isLoaded = false;
        this.fileName = '';
        this.container = containerElement;
        this.audioContext = new AudioContext();
        this.playbackEngine = new AudioPlaybackEngine(this.audioContext);
        this.analysisEngine = new AudioAnalysisEngine(this.audioContext);
        this.tempoDetector = new TempoDetector();
        // Connect audio graph
        const gainNode = this.playbackEngine.getGainNode();
        this.analysisEngine.connectSource(gainNode);
        this.analysisEngine.getOutputNode().connect(this.audioContext.destination);
        // Create bridge
        this.musicBridge = new MusicEventBridge(this.playbackEngine, this.analysisEngine, this.tempoDetector);
        // Set up renderer integration if available
        if (typeof window.setupMusicBridge === 'function') {
            window.setupMusicBridge(this.musicBridge);
        }
        // Playback ended
        this.playbackEngine.onEnded(() => {
            this.stop();
            this.updateUI();
        });
        this.render();
    }
    render() {
        this.container.innerHTML = `
      <div style="
        padding: 1rem;
        background: #1f2937;
        border-radius: 12px;
        color: #e5e7eb;
        font-family: system-ui, sans-serif;
      ">
        <div style="font-weight: 700; margin-bottom: 0.5rem; font-size: 1.1rem;">
          🎵 Music-Driven Animation
        </div>
        <div id="music-content">
          <p style="font-size: 0.9rem; margin: 0.5rem 0; color: #9ca3af;">
            Upload a music file to sync visual effects with real-time audio analysis.
          </p>
          <button id="music-select-btn" style="
            padding: 0.5rem 1rem;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            margin-top: 0.5rem;
          ">
            Choose Music File
          </button>
          <div style="font-size: 0.8rem; margin-top: 0.5rem; color: #6b7280;">
            Supports: MP3, WAV, OGG, M4A
          </div>
        </div>
      </div>
    `;
        const selectBtn = this.container.querySelector('#music-select-btn');
        if (selectBtn) {
            selectBtn.addEventListener('click', () => this.handleFileSelect());
        }
    }
    async handleFileSelect() {
        try {
            const file = await AudioFileLoader.selectFile();
            if (!file)
                return;
            const contentDiv = this.container.querySelector('#music-content');
            contentDiv.innerHTML = '<div style="text-align: center;">Loading...</div>';
            const loader = new AudioFileLoader();
            const { buffer, metadata } = await loader.loadFile(file);
            this.fileName = metadata.name;
            const decoder = new AudioDecoder(this.audioContext);
            const audioBuffer = await decoder.decode(buffer);
            this.playbackEngine.loadBuffer(audioBuffer);
            this.isLoaded = true;
            this.updateUI();
        }
        catch (error) {
            console.error('Failed to load music:', error);
            const contentDiv = this.container.querySelector('#music-content');
            contentDiv.innerHTML = `
        <div style="color: #ef4444; font-size: 0.9rem; margin: 0.5rem 0;">
          Error: ${error instanceof Error ? error.message : 'Failed to load file'}
        </div>
        <button id="music-select-btn" style="
          padding: 0.5rem 1rem;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9rem;
          margin-top: 0.5rem;
        ">
          Try Again
        </button>
      `;
            const retryBtn = this.container.querySelector('#music-select-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => this.handleFileSelect());
            }
        }
    }
    updateUI() {
        if (!this.isLoaded)
            return;
        const status = this.playbackEngine.getStatus();
        const tempoInfo = this.tempoDetector.getTempoInfo();
        const isPlaying = status.state === 'playing';
        const contentDiv = this.container.querySelector('#music-content');
        contentDiv.innerHTML = `
      <div style="
        padding: 0.5rem;
        background: #111827;
        border-radius: 6px;
        margin: 0.5rem 0;
        font-size: 0.85rem;
      ">
        <div style="font-weight: 600; margin-bottom: 0.25rem;">
          ${this.fileName}
        </div>
        <div style="color: #9ca3af;">
          ${this.formatTime(status.currentTime)} / ${this.formatTime(status.duration)}
        </div>
      </div>
      
      <input
        id="music-seek"
        type="range"
        min="0"
        max="${status.duration}"
        step="0.1"
        value="${status.currentTime}"
        style="width: 100%; margin: 0.5rem 0;"
      />
      
      <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
        <button id="music-play-btn" style="
          flex: 1;
          padding: 0.5rem;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9rem;
        ">
          ${isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        <button id="music-change-btn" style="
          flex: 1;
          padding: 0.5rem;
          background: #6b7280;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9rem;
        ">
          Change File
        </button>
      </div>
      
      ${tempoInfo.bpm > 0 ? `
        <div style="
          margin-top: 0.75rem;
          padding: 0.5rem;
          background: #111827;
          border-radius: 6px;
          font-size: 0.85rem;
          display: flex;
          justify-content: space-between;
        ">
          <span>BPM: <strong>${tempoInfo.bpm}</strong></span>
          <span>Confidence: <strong>${Math.round(tempoInfo.confidence * 100)}%</strong></span>
        </div>
      ` : ''}
      
      ${isPlaying ? `
        <div style="
          margin-top: 0.5rem;
          padding: 0.4rem 0.5rem;
          background: #065f46;
          color: #d1fae5;
          border-radius: 6px;
          font-size: 0.8rem;
        ">
          ✓ Music-driven mode active
        </div>
      ` : ''}
    `;
        // Attach event listeners
        const playBtn = contentDiv.querySelector('#music-play-btn');
        const changeBtn = contentDiv.querySelector('#music-change-btn');
        const seekInput = contentDiv.querySelector('#music-seek');
        if (playBtn)
            playBtn.addEventListener('click', () => this.togglePlayback());
        if (changeBtn)
            changeBtn.addEventListener('click', () => this.handleFileSelect());
        if (seekInput)
            seekInput.addEventListener('input', (e) => {
                const target = e.target;
                this.playbackEngine.seek(parseFloat(target.value));
            });
        // Update time display
        if (isPlaying) {
            setTimeout(() => this.updateUI(), 100);
        }
    }
    togglePlayback() {
        const status = this.playbackEngine.getStatus();
        if (status.state === 'playing') {
            this.stop();
        }
        else {
            this.play();
        }
        this.updateUI();
    }
    play() {
        this.playbackEngine.play();
        this.musicBridge.start();
        if (typeof window.setMusicActive === 'function') {
            window.setMusicActive(true);
        }
    }
    stop() {
        this.playbackEngine.pause();
        this.musicBridge.stop();
        if (typeof window.setMusicActive === 'function') {
            window.setMusicActive(false);
        }
    }
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    destroy() {
        this.stop();
        this.audioContext.close();
    }
}
