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
  <label style="margin-right:6px;">Walking Tours:</label>
  <select id="yt-playlist">
    <option value="PLe4Eo7QChXDSjIgyi85VX5uVEngpw8gUB">City Walking Tours (4K)</option>
    <option value="PLSOO4vYXpMCe01uTOmj_3_G4C8-Kjy26X">Night City Run</option>
    <option value="PLbpi6ZahtOH6blw5yrbnIuDrPq3NbS1U2">Nature Trail Runs</option>
    <option value="PLLqiCLrQ5MTPjK2a3Kz7u9cYVrt2iIjtE">Treadmill Virtual Runs (30-45 min)</option>
    <option value="PLLqiCLrQ5MTN4Sqcx6BWuKvPl7x7EuG08">Treadmill Virtual Runs (50-60 min)</option>
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
    playerVars: {
      autoplay: 1,
      controls: 1, // Enable controls
      modestbranding: 1,
      rel: 0,
      mute: 1
    },
    events: {
      onReady: (event) => {
        console.log('YouTube player ready');
        // Load the first playlist by default
        const defaultPlaylistId = 'PLe4Eo7QChXDSjIgyi85VX5uVEngpw8gUB';
        player.loadPlaylist({
          list: defaultPlaylistId,
          index: 0
        });
        player.setVolume(50);
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
      const playlistId = document.getElementById('yt-playlist').value;
      if (player && player.loadPlaylist) {
        player.loadPlaylist({
          list: playlistId,
          index: 0
        });
        console.log('Loading playlist:', playlistId);
      }
    };
  }
  
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (player && player.previousVideo) {
        player.previousVideo();
        console.log('Previous video in playlist');
      }
    };
  }
  
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (player && player.nextVideo) {
        player.nextVideo();
        console.log('Next video in playlist');
      }
    };
  }
  if (shuffleBtn) {
    shuffleBtn.onclick = () => {
      if (player && player.setShuffle) {
        player.setShuffle(true);
        console.log('Playlist shuffle enabled');
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
