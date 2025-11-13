// --- Load YouTube IFrame API ---
const ytScript = document.createElement('script');
ytScript.src = "https://www.youtube.com/iframe_api";
document.body.appendChild(ytScript);

// --- Playlist Map ---
const PLAYLISTS = {
  "Night City Run": "PLSOO4vYXpMCe01uTOmj_3_G4C8-Kjy26X",
  "Lofi Study": "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI"
};

let currentPlaylist = PLAYLISTS["Night City Run"];
let ytPlayer = null;
let jumpTimer = null;

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
        startRandomJump();
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
function startRandomJump() {
  clearInterval(jumpTimer);
  jumpTimer = setInterval(() => {
    const duration = ytPlayer.getDuration();
    if (duration > 10) {
      const seekTime = Math.floor(Math.random() * (duration - 10));
      ytPlayer.seekTo(seekTime, true);
    }
  }, 10000);
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
