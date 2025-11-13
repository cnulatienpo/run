// Mock YouTube Player for headless environments
class MockYouTubePlayer {
  constructor(elementId, config) {
    this.elementId = elementId;
    this.config = config;
    this.currentPlaylist = null;
    this.currentIndex = 0;
    this.volume = 50;
    this.isPlaying = false;
    
    console.log(`[MockYT] Player created for ${elementId}`);
    
    // Simulate player ready
    setTimeout(() => {
      if (config.events && config.events.onReady) {
        config.events.onReady({ target: this });
      }
    }, 100);
  }
  
  loadPlaylist(options) {
    this.currentPlaylist = options.list;
    this.currentIndex = options.index || 0;
    console.log(`[MockYT] Loaded playlist: ${options.list}, starting at index: ${this.currentIndex}`);
  }
  
  previousVideo() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      console.log(`[MockYT] Previous video - index: ${this.currentIndex}`);
    }
  }
  
  nextVideo() {
    this.currentIndex++;
    console.log(`[MockYT] Next video - index: ${this.currentIndex}`);
  }
  
  setShuffle(shuffle) {
    console.log(`[MockYT] Shuffle set to: ${shuffle}`);
  }
  
  setVolume(volume) {
    this.volume = volume;
    console.log(`[MockYT] Volume set to: ${volume}%`);
  }
  
  playVideo() {
    this.isPlaying = true;
    console.log(`[MockYT] Playing video`);
  }
  
  pauseVideo() {
    this.isPlaying = false;
    console.log(`[MockYT] Paused video`);
  }
}

// Mock the global YT object for headless environments
if (typeof window !== 'undefined' && !window.YT) {
  window.YT = {
    Player: MockYouTubePlayer
  };
  
  // Simulate API ready
  setTimeout(() => {
    if (typeof window.onYouTubeIframeAPIReady === 'function') {
      window.onYouTubeIframeAPIReady();
    }
  }, 200);
}