import { start } from './spawnLoop.js';
import { startTimer } from './timer.js';
import { initTags } from './tagManager.js';
import { setTag } from './spawnLoop.js';
import { connectToStepServer } from './ws-client.js';

initTags(setTag);
startTimer();
start();

// Connect to WebSocket step server
const stepCountElement = document.getElementById('step-count');
const wsStatusElement = document.getElementById('ws-status');
const heartRateElement = document.getElementById('heart-rate');

// 1. Load the YouTube IFrame API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

// 2. Create player placeholder
const playerContainer = document.createElement('div');
playerContainer.id = 'player';
playerContainer.style.width = '100%';
playerContainer.style.height = '360px';
document.body.appendChild(playerContainer);

// 3. Playlist selector HUD
const playlistHud = document.createElement('div');
playlistHud.id = 'playlist-hud';
playlistHud.style = "position:fixed; top:10px; left:10px; background:#111; color:#fff; padding:10px; z-index:10000; border-radius:8px;";
playlistHud.innerHTML = `
  <label style="margin-right:6px;">Music:</label>
  <select id="yt-playlist">
    <option value="jfKfPfyJRdk">Lo-Fi Hip Hop Radio</option>
    <option value="5qap5aO4i9A">Lofi Study Music</option>
    <option value="DWcJFNfaw9c">Peaceful Piano</option>
    <option value="n61ULEU7CO0">Deep Focus Music</option>
  </select>
  <button id="load-btn">Load</button>
  <button id="prev-btn">⏮️</button>
  <button id="next-btn">⏭️</button>
  <button id="shuffle-btn">🔀</button>
  <input id="volume" type="range" min="0" max="100" step="1" value="50" style="vertical-align:middle; margin-left:8px;">
`;
document.body.appendChild(playlistHud);

// 4. YouTube Player setup
let player;
window.onYouTubeIframeAPIReady = function() {
  player = new YT.Player('player', {
    height: '360',
    width: '640',
    videoId: 'jfKfPfyJRdk', // Default video
    playerVars: {
      autoplay: 1,
      controls: 1, // Enable controls
      modestbranding: 1,
      rel: 0,
      mute: 1,
      loop: 1
    },
    events: {
      onReady: (event) => {
        console.log('YouTube player ready');
        player.setVolume(50);
        event.target.playVideo();
      },
      onError: (event) => {
        console.error('YouTube player error:', event.data);
      }
    }
  });
};

// 5. HUD Controls
document.addEventListener('DOMContentLoaded', () => {
  const loadBtn = document.getElementById('load-btn');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const shuffleBtn = document.getElementById('shuffle-btn');
  const volumeSlider = document.getElementById('volume');
  
  if (loadBtn) {
    loadBtn.onclick = () => {
      const videoId = document.getElementById('yt-playlist').value;
      if (player && player.loadVideoById) {
        player.loadVideoById(videoId);
        console.log('Loading video:', videoId);
      }
    };
  }
  
  const videos = ['jfKfPfyJRdk', '5qap5aO4i9A', 'DWcJFNfaw9c', 'n61ULEU7CO0'];
  let currentVideoIndex = 0;
  
  if (prevBtn) {
    prevBtn.onclick = () => {
      currentVideoIndex = (currentVideoIndex - 1 + videos.length) % videos.length;
      const videoId = videos[currentVideoIndex];
      if (player && player.loadVideoById) {
        player.loadVideoById(videoId);
        document.getElementById('yt-playlist').value = videoId;
        console.log('Previous video:', videoId);
      }
    };
  }
  
  if (nextBtn) {
    nextBtn.onclick = () => {
      currentVideoIndex = (currentVideoIndex + 1) % videos.length;
      const videoId = videos[currentVideoIndex];
      if (player && player.loadVideoById) {
        player.loadVideoById(videoId);
        document.getElementById('yt-playlist').value = videoId;
        console.log('Next video:', videoId);
      }
    };
  }
  if (shuffleBtn) {
    shuffleBtn.onclick = () => {
      currentVideoIndex = Math.floor(Math.random() * videos.length);
      const videoId = videos[currentVideoIndex];
      if (player && player.loadVideoById) {
        player.loadVideoById(videoId);
        document.getElementById('yt-playlist').value = videoId;
        console.log('Shuffled to video:', videoId);
      }
    };
  }
  if (volumeSlider) {
    volumeSlider.oninput = (e) => player && player.setVolume && player.setVolume(parseInt(e.target.value));
  }
});


connectToStepServer(
  (stepCount) => {
    if (stepCountElement) {
      if (typeof stepCount === 'number' && Number.isFinite(stepCount)) {
        stepCountElement.textContent = stepCount;
      } else {
        stepCountElement.textContent = '—';
      }
    }
  },
  (statusText, color) => {
    if (wsStatusElement) {
      wsStatusElement.textContent = statusText;
      wsStatusElement.style.color = color;
    }
  },
  (bpm) => {
    if (heartRateElement) {
      if (typeof bpm === 'number' && Number.isFinite(bpm)) {
        heartRateElement.textContent = Math.round(bpm);
      } else {
        heartRateElement.textContent = '—';
      }
    }
  }
);
