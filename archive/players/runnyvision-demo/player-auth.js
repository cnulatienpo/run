/**
 * RunnyVision Player - Atom-based video streaming
 * Uses authenticated B2 proxy to play video atoms
 */

export class RunnyVisionPlayer {
  constructor(videoAElement, videoBElement, options = {}) {
    this.videoA = videoAElement;
    this.videoB = videoBElement;
    this.active = this.videoA;
    this.standby = this.videoB;
    
    this.plan = [];
    this.index = 0;
    this.isPlaying = false;
    
    this.apiBase = options.apiBase || 'http://localhost:4000';
    this.onStatusChange = options.onStatusChange || (() => {});
  }
  
  async startRun(durationMinutes) {
    this.onStatusChange('Loading plan...');
    
    try {
      // Get the run plan from backend
      const response = await fetch(`${this.apiBase}/api/runnyvision/plan?duration=${durationMinutes}`);
      if (!response.ok) {
        throw new Error(`Failed to load plan: ${response.statusText}`);
      }
      
      const data = await response.json();
      this.plan = data.plan;
      this.index = 0;
      this.isPlaying = true;
      
      this.onStatusChange(`Playing ${durationMinutes}-minute run (${this.plan.length} atoms)`);
      
      // Start playing
      this.playNext();
    } catch (error) {
      console.error('Failed to start run:', error);
      this.onStatusChange(`Error: ${error.message}`);
    }
  }
  
  async playNext() {
    if (!this.isPlaying || this.index >= this.plan.length) {
      this.onStatusChange('Run complete');
      this.isPlaying = false;
      // Loop back to start
      this.index = 0;
      if (this.plan.length > 0) {
        setTimeout(() => this.playNext(), 1000);
      }
      return;
    }
    
    const atom = this.plan[this.index++];
    
    try {
      // Fetch atom metadata through proxy
      const response = await fetch(`${this.apiBase}${atom.url}`);
      if (!response.ok) {
        throw new Error(`Failed to load atom: ${response.statusText}`);
      }
      
      const meta = await response.json();
      
      // Build video URL with time range
      const videoUrl = this.buildVideoURL(meta);
      
      this.standby.src = videoUrl;
      this.standby.load();
      
      this.standby.oncanplaythrough = () => {
        this.standby.play().catch(e => console.warn('Play failed:', e));
        
        // Crossfade
        this.active.classList.remove('visible');
        this.standby.classList.add('visible');
        
        // Swap
        [this.active, this.standby] = [this.standby, this.active];
        
        // Schedule next atom (with 300ms overlap for smooth transition)
        const delay = (atom.duration * 1000) - 300;
        setTimeout(() => this.playNext(), delay);
        
        this.onStatusChange(`Playing atom ${this.index}/${this.plan.length}`);
      };
      
      this.standby.onerror = (e) => {
        console.error('Video error:', e);
        // Skip to next atom
        setTimeout(() => this.playNext(), 1000);
      };
      
    } catch (error) {
      console.error('Atom playback error:', error);
      // Skip to next
      setTimeout(() => this.playNext(), 1000);
    }
  }
  
  buildVideoURL(meta) {
    // Use the video URL from metadata
    if (meta.video_url || meta.signedUrl || meta.signed_url) {
      return meta.video_url || meta.signedUrl || meta.signed_url;
    }
    
    // Fallback: construct from video file and time range
    const videoFile = meta.video || meta.source_video || 'unknown.mp4';
    const startTime = meta.start_seconds || 0;
    const endTime = meta.end_seconds || startTime + 5;
    
    return `${this.apiBase}/b2-proxy/raw/${videoFile}#t=${startTime},${endTime}`;
  }
  
  stop() {
    this.isPlaying = false;
    this.active.pause();
    this.standby.pause();
    this.onStatusChange('Stopped');
  }
}
