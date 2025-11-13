// --- Load YouTube IFrame API ---
const ytScript = document.createElement('script');
ytScript.src = "https://www.youtube.com/iframe_api";
document.body.appendChild(ytScript);

// --- Playlist Map ---
const PLAYLISTS = {
  "Night City Run": "PLSOO4vYXpMCe01uTOmj_3_G4C8-Kjy26X",
  "Lofi Study": "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
  "Walking Tours": "PLJ-dF835PSwkh5zCGlPPfgHnZu7nrqgkZ",
  "California Walks": "PL_uLYGDZi5I6qrv6PwsFSPsGH2Dk3Ybgy",
  "Virtual Run (360)": "PLWlKQlGXPzlUwIezr79HXSEowfjseY7Yr",
  "Treadmill Runs": "PLu6XgYDxOz6lxcFq4iB-PefGW0chfdxaW"
};

let currentPlaylist = PLAYLISTS["Night City Run"];
let ytPlayer = null;
let jumpTimer = null;
let currentJumpInterval = 10000;

// --- Create and mount player container ---
const playerWrap = document.createElement('div');
playerWrap.id = 'yt-runner-player';
Object.assign(playerWrap.style, {
  position: 'fixed',
  top: '0',
  left: '0',
  width: '100vw',
  height: '100vh',
  zIndex: '-1',
});
document.body.appendChild(playerWrap);

// --- Hook into API once loaded ---
window.onYouTubeIframeAPIReady = () => {
  ytPlayer = new YT.Player('yt-runner-player', {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 1,
      mute: 1,
      controls: 0,
      modestbranding: 1,
      loop: 1,
      rel: 0,
      listType: 'playlist',
      list: currentPlaylist,
    },
    events: {
      onReady: (event) => {
        event.target.mute();
        event.target.playVideo();
        startRandomJump(currentJumpInterval);
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.ENDED) {
          ytPlayer.playVideo(); // Loop
        }
      }
    }
  });
};

// --- Randomize video position every 10s ---
function startRandomJump(intervalMs = 10000) {
  clearInterval(jumpTimer);

  if (!intervalMs || intervalMs <= 0) {
    jumpTimer = null;
    return;
  }

  jumpTimer = setInterval(() => {
    const duration = ytPlayer.getDuration();
    if (duration > 10) {
      const seekTime = Math.floor(Math.random() * (duration - 10));
      ytPlayer.seekTo(seekTime, true);
    }
  }, intervalMs);
}

// --- HUD: Playlist Dropdown ---
let hud = document.getElementById('hud');
if (!hud) {
  hud = document.createElement('div');
  hud.id = 'hud';
  hud.style.position = 'fixed';
  hud.style.top = '12px';
  hud.style.left = '12px';
  hud.style.background = 'rgba(0,0,0,0.6)';
  hud.style.color = 'white';
  hud.style.padding = '6px 12px';
  hud.style.borderRadius = '6px';
  hud.style.zIndex = '9999';
  document.body.appendChild(hud);
}

const playlistLabel = document.createElement('label');
playlistLabel.textContent = 'Video Theme: ';
playlistLabel.style.marginRight = '6px';
playlistLabel.style.fontSize = '14px';
playlistLabel.style.verticalAlign = 'middle';

const playlistSelect = document.createElement('select');
playlistSelect.style.fontSize = '14px';
playlistSelect.style.padding = '2px 6px';
playlistSelect.style.borderRadius = '4px';
playlistSelect.style.marginRight = '10px';

Object.entries(PLAYLISTS).forEach(([label, id]) => {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = label;
  playlistSelect.appendChild(option);
});

playlistSelect.value = currentPlaylist;

playlistSelect.addEventListener('change', (e) => {
  const newId = e.target.value;
  currentPlaylist = newId;
  if (ytPlayer?.loadPlaylist) {
    ytPlayer.loadPlaylist({ list: currentPlaylist });
  }
});

const playlistWrap = document.createElement('div');
playlistWrap.style.display = 'inline-block';
playlistWrap.appendChild(playlistLabel);
playlistWrap.appendChild(playlistSelect);

hud.appendChild(playlistWrap);

// --- HUD: Interval Selector ---
const intervalLabel = document.createElement('label');
intervalLabel.textContent = 'Change Interval: ';
intervalLabel.style.marginRight = '6px';
intervalLabel.style.fontSize = '14px';
intervalLabel.style.verticalAlign = 'middle';

const intervalSelect = document.createElement('select');
intervalSelect.style.fontSize = '14px';
intervalSelect.style.padding = '2px 6px';
intervalSelect.style.borderRadius = '4px';

const INTERVAL_OPTIONS = {
  Off: 0,
  '5s': 5000,
  '10s': 10000,
  '30s': 30000,
  '60s': 60000
};

Object.entries(INTERVAL_OPTIONS).forEach(([label, ms]) => {
  const option = document.createElement('option');
  option.value = ms;
  option.textContent = label;
  intervalSelect.appendChild(option);
});

intervalSelect.value = currentJumpInterval;

intervalSelect.addEventListener('change', (e) => {
  const newInterval = Number(e.target.value);
  currentJumpInterval = newInterval;
  startRandomJump(currentJumpInterval);
});

const intervalWrap = document.createElement('div');
intervalWrap.style.display = 'inline-block';
intervalWrap.style.marginLeft = '10px';
intervalWrap.appendChild(intervalLabel);
intervalWrap.appendChild(intervalSelect);

hud.appendChild(intervalWrap);
