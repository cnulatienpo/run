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
      controls: 1,
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
        reportPlayerError(`YouTube error: ${event.data}`);
        playerReady = false;
        if (!playerReinitTimer) {
          playerReinitTimer = setTimeout(() => {
            playerReinitTimer = undefined;
            if (player && typeof player.destroy === 'function') {
              try {
                player.destroy();
              } catch (destroyErr) {
                console.warn('Failed to destroy YouTube player cleanly:', destroyErr);
              }
            }
            player = undefined;
            initYouTubePlayer();
          }, 4000);
        }
      },
    },
  });
}

function setupPlaylistHud() {
  let playlistHud = document.getElementById('playlist-hud');
  if (!playlistHud) {
    playlistHud = document.createElement('div');
    playlistHud.id = 'playlist-hud';
    document.body.appendChild(playlistHud);
  }

  Object.assign(playlistHud.style, {
    position: 'fixed',
    top: '10px',
    left: '10px',
    background: 'rgba(17, 17, 17, 0.85)',
    color: '#fff',
    padding: '10px',
    borderRadius: '8px',
    zIndex: '10000',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(6px)',
  });

  playlistHud.innerHTML = `
    <label style="margin-right:6px; font-weight:600;">Music:</label>
    <select id="yt-playlist" style="padding:2px 6px; border-radius:4px;">
      ${PLAYLIST.map((item) => `<option value="${item.id}">${item.label}</option>`).join('')}
    </select>
    <button id="yt-load-btn" type="button">Load</button>
    <button id="yt-prev-btn" type="button">⏮️</button>
    <button id="yt-next-btn" type="button">⏭️</button>
    <button id="yt-shuffle-btn" type="button">🔀</button>
    <input id="yt-volume" type="range" min="0" max="100" step="1" value="${desiredVolume}" style="vertical-align:middle; margin-left:8px;">
  `;

  const playlistSelect = document.getElementById('yt-playlist');
  const loadBtn = document.getElementById('yt-load-btn');
  const prevBtn = document.getElementById('yt-prev-btn');
  const nextBtn = document.getElementById('yt-next-btn');
  const shuffleBtn = document.getElementById('yt-shuffle-btn');
  const volumeSlider = document.getElementById('yt-volume');

  if (playlistSelect) {
    playlistSelect.value = PLAYLIST[currentVideoIndex]?.id ?? playlistSelect.value;
    playlistSelect.addEventListener('change', () => {
      const videoId = playlistSelect.value;
      const index = findVideoIndex(videoId);
      if (index >= 0) {
        currentVideoIndex = index;
      }
      loadVideo(videoId);
    });
  }

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
    });
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
      loadVideo(videoId);
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (event) => {
      const value = Number(event.target.value);
      if (Number.isFinite(value)) {
        desiredVolume = value;
        if (playerReady && player && typeof player.setVolume === 'function') {
          player.setVolume(value);
        }
      }
    });
  }
}

function loadVideo(videoId) {
  if (!videoId) {
    return;
  }
  pendingVideoId = videoId;
  const playlistSelect = document.getElementById('yt-playlist');
  if (playlistSelect) {
    playlistSelect.value = videoId;
  }
  const index = findVideoIndex(videoId);
  if (index >= 0) {
    currentVideoIndex = index;
  }
  if (playerReady && player && typeof player.loadVideoById === 'function') {
    player.loadVideoById(videoId);
  }
}

function loadVideoByOffset(offset) {
  if (!PLAYLIST.length) {
    return;
  }
  currentVideoIndex = (currentVideoIndex + offset + PLAYLIST.length) % PLAYLIST.length;
  const videoId = PLAYLIST[currentVideoIndex]?.id;
  loadVideo(videoId);
}

function findVideoIndex(videoId) {
  return PLAYLIST.findIndex((item) => item.id === videoId);
}

function createHudToggle() {
  const hud = document.getElementById('hud');
  if (!hud || document.getElementById('hud-toggle-container')) {
    return;
  }

  hudOriginalDisplay = window.getComputedStyle(hud).display;
  if (!hudOriginalDisplay || hudOriginalDisplay === 'none') {
    hudOriginalDisplay = 'block';
  }

  const toggleContainer = document.createElement('div');
  toggleContainer.id = 'hud-toggle-container';
  Object.assign(toggleContainer.style, {
    position: 'fixed',
    top: '10px',
    right: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    zIndex: '10001',
  });

  const hideBtn = document.createElement('button');
  hideBtn.id = 'hud-hide-btn';
  hideBtn.type = 'button';
  hideBtn.textContent = '🛠 Hide HUD';
  styleToggleButton(hideBtn);

  const showBtn = document.createElement('button');
  showBtn.id = 'hud-show-btn';
  showBtn.type = 'button';
  showBtn.textContent = 'Show HUD';
  styleToggleButton(showBtn);
  showBtn.style.display = 'none';

  hideBtn.addEventListener('click', () => {
    hud.style.display = 'none';
    hideBtn.style.display = 'none';
    showBtn.style.display = 'block';
  });

  showBtn.addEventListener('click', () => {
    hud.style.display = hudOriginalDisplay;
    hideBtn.style.display = 'block';
    showBtn.style.display = 'none';
  });

  toggleContainer.appendChild(hideBtn);
  toggleContainer.appendChild(showBtn);
  document.body.appendChild(toggleContainer);
}

function styleToggleButton(button) {
  Object.assign(button.style, {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    background: 'rgba(0, 0, 0, 0.6)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
  });
}

function createDebugPanel() {
  if (debugPanel) {
    return;
  }
  debugPanel = document.createElement('div');
  debugPanel.id = 'hud-debug-panel';
  Object.assign(debugPanel.style, {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    background: 'rgba(17, 17, 17, 0.85)',
    color: '#fff',
    padding: '10px 12px',
    borderRadius: '8px',
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: '1.4',
    zIndex: '10001',
    pointerEvents: 'none',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
  });

  debugStatusLine = document.createElement('div');
  debugCadenceLine = document.createElement('div');
  debugPlaybackLine = document.createElement('div');
  debugErrorLine = document.createElement('div');
  debugErrorLine.style.marginTop = '4px';
  debugErrorLine.style.color = '#ff6b6b';

  debugPanel.appendChild(debugStatusLine);
  debugPanel.appendChild(debugCadenceLine);
  debugPanel.appendChild(debugPlaybackLine);
  debugPanel.appendChild(debugErrorLine);

  document.body.appendChild(debugPanel);
  updateDebugPanel();
}

function updateDebugPanel() {
  if (!debugPanel) {
    return;
  }
  const cadenceText = latestCadence == null ? '--' : `${Math.round(latestCadence)} spm`;
  debugStatusLine.textContent = `WS: ${latestStatusText}`;
  debugStatusLine.style.color = latestStatusColor;
  debugCadenceLine.textContent = `Cadence: ${cadenceText}`;
  debugPlaybackLine.textContent = `Playback: ${currentPlaybackRate.toFixed(2)}x`;

  if (latestPlayerError) {
    debugErrorLine.textContent = latestPlayerError;
    debugErrorLine.style.display = 'block';
  } else {
    debugErrorLine.textContent = '';
    debugErrorLine.style.display = 'none';
  }
}

function reportPlayerError(message) {
  latestPlayerError = message || '';
  updateDebugPanel();
}

function handleStepUpdate(stepCount) {
  if (typeof stepCount === 'number' && Number.isFinite(stepCount)) {
    latestSteps = Math.round(stepCount);
  } else {
    latestSteps = null;
  }
  const displayValue = latestSteps ?? '—';
  if (stepCountElement) {
    stepCountElement.textContent = displayValue;
  }
  if (hudStepsElement) {
    hudStepsElement.textContent = displayValue;
  }
}

function handleStatusChange(statusText, color) {
  latestStatusText = statusText;
  latestStatusColor = color;
  if (wsStatusElement) {
    wsStatusElement.textContent = statusText;
    wsStatusElement.style.color = color;
  }
  if (hudOfflineBadge) {
    hudOfflineBadge.hidden = statusText === 'Connected';
  }
  updateDebugPanel();
}

function handleHeartRateUpdate(bpm) {
  let displayValue = '—';
  if (typeof bpm === 'number' && Number.isFinite(bpm)) {
    displayValue = Math.round(bpm).toString();
  }
  if (heartRateElement) {
    heartRateElement.textContent = displayValue;
  }
  if (hudBpmElement) {
    hudBpmElement.textContent = displayValue;
  }
}

function handleCadenceUpdate(cadence) {
  if (typeof cadence === 'number' && Number.isFinite(cadence)) {
    latestCadence = cadence;
  } else {
    latestCadence = null;
  }
  applyCadenceToPlayer(latestCadence);
  updateDebugPanel();
}

function applyCadenceToPlayer(cadence) {
  const targetRate = cadenceToPlaybackRate(cadence);
  if (Math.abs(targetRate - currentPlaybackRate) < 0.01) {
    currentPlaybackRate = targetRate;
    updateDebugPanel();
    return;
  }
  currentPlaybackRate = targetRate;
  if (playerReady && player && typeof player.setPlaybackRate === 'function') {
    player.setPlaybackRate(targetRate);
  }
  updateDebugPanel();
}

function cadenceToPlaybackRate(cadence) {
  if (typeof cadence !== 'number' || !Number.isFinite(cadence)) {
    return 1;
  }
  const baseCadence = 90;
  let rate;
  if (cadence >= baseCadence) {
    rate = 1 + (cadence - baseCadence) / 200;
  } else {
    rate = 1 + (cadence - baseCadence) / 130;
  }
  rate = Math.max(0.5, Math.min(2, rate));
  return Number(rate.toFixed(2));
}
