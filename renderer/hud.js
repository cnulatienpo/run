import effectMap from '../effects/effect-mapping.json' assert { type: 'json' };

const STATUS_CLASS_PREFIX = 'status--';

export const moodOptions = {
  dreamcore: {
    name: 'Dreamcore',
    playlistUrl: '/media/playlists/dreamcore.m3u',
  },
  ambient: {
    name: 'Ambient',
    playlistUrl: '/media/playlists/ambient.m3u',
  },
  hype: {
    name: 'Hype',
    playlistUrl: '/media/playlists/hype.m3u',
  },
  rare: {
    name: 'Rare',
    playlistUrl: '/media/playlists/rare.m3u',
  },
};

const bpmOptions = [60, 90, 120, 150];

const currentState = {
  mood: null,
  bpm: null,
  playlist: null,
  isPlaying: false,
  autoMute: true,
};

const selectedTags = new Map();
let lastActiveTag = null;
let infoHud;

function ensureFloatingHud() {
  if (infoHud) {
    return infoHud;
  }
  infoHud = document.createElement('div');
  infoHud.id = 'floating-info-hud';
  infoHud.style.position = 'fixed';
  infoHud.style.top = '16px';
  infoHud.style.right = '16px';
  infoHud.style.zIndex = '10000';
  infoHud.style.padding = '12px 16px';
  infoHud.style.borderRadius = '10px';
  infoHud.style.background = 'rgba(0, 0, 0, 0.6)';
  infoHud.style.color = '#f8fafc';
  infoHud.style.fontSize = '0.9rem';
  infoHud.style.fontFamily = "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  infoHud.style.pointerEvents = 'none';
  document.body.appendChild(infoHud);
  return infoHud;
}

function formatTagDisplay() {
  if (selectedTags.size === 0) {
    return 'None';
  }
  return Array.from(selectedTags.values()).join(', ');
}

function updateFloatingHUD() {
  const hudEl = ensureFloatingHud();
  const moodName = currentState.mood
    ? moodOptions[currentState.mood]?.name ?? effectMap.labels?.[currentState.mood] ?? currentState.mood
    : 'None';
  const musicSource = currentState.playlist ?? 'None';
  hudEl.textContent = `Tag: ${formatTagDisplay()} | Mood: ${moodName} | Music: ${musicSource}`;
}

function createOption(value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function getBackgroundVideo() {
  return document.getElementById('background-video');
}

export function initHUD({
  onMoodChange,
  onBpmChange,
  onTagToggle,
  onPlaylistToggle,
  onAutoMuteChange,
  onRequestOpen,
} = {}) {
  const hudRoot = document.getElementById('hud') ?? document.body;
  const statusEl = document.getElementById('hud-status');
  const stepsEl = document.getElementById('steps-value');
  const bpmEl = document.getElementById('bpm-value');
  const lastUpdateEl = document.getElementById('last-update');
  const playlistStatusEl = document.getElementById('playlist-status');
  const controlsContainer = document.getElementById('hud-controls') ?? hudRoot;

  const autoMuteToggle = document.createElement('input');
  autoMuteToggle.type = 'checkbox';
  autoMuteToggle.id = 'auto-mute-toggle';
  autoMuteToggle.checked = true;
  currentState.autoMute = true;

  const autoMuteLabel = document.createElement('label');
  autoMuteLabel.htmlFor = 'auto-mute-toggle';
  autoMuteLabel.textContent = ' Auto-mute Background Video';

  const autoMuteWrap = document.createElement('div');
  autoMuteWrap.className = 'control-row';
  autoMuteWrap.appendChild(autoMuteToggle);
  autoMuteWrap.appendChild(autoMuteLabel);

  const moodSelect = document.createElement('select');
  Object.entries(moodOptions).forEach(([key, meta]) => {
    moodSelect.appendChild(createOption(key, meta.name));
  });
  const defaultMood = effectMap.defaultMood && moodOptions[effectMap.defaultMood]
    ? effectMap.defaultMood
    : Object.keys(moodOptions)[0];
  moodSelect.value = defaultMood;
  currentState.mood = defaultMood;
  currentState.playlist = moodOptions[defaultMood]?.name ?? defaultMood;

  const bpmSelect = document.createElement('select');
  bpmOptions.forEach((value) => {
    bpmSelect.appendChild(createOption(String(value), `${value} BPM`));
  });
  bpmSelect.value = String(bpmOptions[0]);
  currentState.bpm = bpmSelect.value;

  const playlistToggleButton = document.createElement('button');
  playlistToggleButton.id = 'playlist-toggle';
  playlistToggleButton.type = 'button';
  playlistToggleButton.textContent = 'Start Session';

  const playlistSourceEl = document.getElementById('playlist-source') ?? document.createElement('span');
  playlistSourceEl.id = 'playlist-source';
  playlistSourceEl.textContent = currentState.playlist ?? 'None';

  const tagsRow = document.createElement('div');
  tagsRow.className = 'control-row tags-row';
  const tagsLabel = document.createElement('label');
  tagsLabel.textContent = 'Tags';
  tagsRow.appendChild(tagsLabel);

  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'tag-buttons';
  tagsRow.appendChild(tagsContainer);

  const availableTags = effectMap.labels ? Object.entries(effectMap.labels) : [];
  availableTags.forEach(([key, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.tag = key;
    button.textContent = label;
    button.addEventListener('click', () => {
      const isActive = selectedTags.has(key);
      if (isActive) {
        selectedTags.delete(key);
        button.classList.remove('is-active');
        if (lastActiveTag === key) {
          lastActiveTag = selectedTags.size ? Array.from(selectedTags.keys()).slice(-1)[0] : null;
        }
        onTagToggle?.(key, false, { label });
      } else {
        selectedTags.set(key, label);
        lastActiveTag = key;
        button.classList.add('is-active');
        onTagToggle?.(key, true, { label });
      }
      updateFloatingHUD();
    });
    tagsContainer.appendChild(button);
  });

  const moodRow = document.createElement('div');
  moodRow.className = 'control-row';
  const moodLabel = document.createElement('label');
  moodLabel.textContent = 'Mood';
  moodRow.appendChild(moodLabel);
  moodRow.appendChild(moodSelect);

  const bpmRow = document.createElement('div');
  bpmRow.className = 'control-row';
  const bpmLabel = document.createElement('label');
  bpmLabel.textContent = 'Target BPM';
  bpmRow.appendChild(bpmLabel);
  bpmRow.appendChild(bpmSelect);

  const playlistRow = document.createElement('div');
  playlistRow.className = 'control-row';
  const playlistLabel = document.createElement('label');
  playlistLabel.textContent = 'Music Source';
  playlistRow.appendChild(playlistLabel);
  playlistRow.appendChild(playlistSourceEl);

  controlsContainer.appendChild(moodRow);
  controlsContainer.appendChild(bpmRow);
  controlsContainer.appendChild(tagsRow);
  controlsContainer.appendChild(playlistRow);
  controlsContainer.appendChild(playlistToggleButton);
  controlsContainer.appendChild(autoMuteWrap);

  function updateVideoMute(isPlaying) {
    const bgVideoElement = getBackgroundVideo();
    if (!bgVideoElement) {
      return;
    }
    if (isPlaying && autoMuteToggle.checked) {
      bgVideoElement.muted = true;
    } else if (!isPlaying) {
      bgVideoElement.muted = false;
    } else if (isPlaying && !autoMuteToggle.checked) {
      bgVideoElement.muted = false;
    }
  }

  function openExternal(url) {
    if (!url) {
      return;
    }
    let opened = false;
    try {
      const electronShell = window?.electron?.shell ?? window?.electronAPI?.shell;
      if (electronShell && typeof electronShell.openExternal === 'function') {
        electronShell.openExternal(url);
        opened = true;
      }
    } catch (error) {
      console.warn('[hud] Failed to open playlist via Electron shell:', error);
    }
    if (!opened) {
      window.open(url, '_blank', 'noopener');
    }
  }

  moodSelect.addEventListener('change', () => {
    const newMood = moodSelect.value;
    currentState.mood = newMood;
    currentState.playlist = moodOptions[newMood]?.name ?? newMood;
    playlistSourceEl.textContent = currentState.playlist;
    updateFloatingHUD();
    onMoodChange?.(newMood, moodOptions[newMood]);
    if (onRequestOpen) {
      onRequestOpen(moodOptions[newMood]?.playlistUrl, { reason: 'mood-change', mood: newMood });
    } else if (moodOptions[newMood]?.playlistUrl) {
      openExternal(moodOptions[newMood]?.playlistUrl);
    }
  });

  bpmSelect.addEventListener('change', () => {
    currentState.bpm = bpmSelect.value;
    onBpmChange?.(Number(currentState.bpm));
    updateFloatingHUD();
  });

  playlistToggleButton.addEventListener('click', () => {
    const nextState = !currentState.isPlaying;
    currentState.isPlaying = nextState;
    playlistToggleButton.textContent = nextState ? 'Stop Session' : 'Start Session';
    if (playlistStatusEl) {
      playlistStatusEl.textContent = nextState ? 'Playing' : 'Stopped';
    }
    updateVideoMute(nextState);
    updateFloatingHUD();
    onPlaylistToggle?.(nextState, {
      mood: currentState.mood,
      playlist: currentState.playlist,
    });
  });

  autoMuteToggle.addEventListener('change', () => {
    currentState.autoMute = autoMuteToggle.checked;
    if (currentState.isPlaying) {
      updateVideoMute(true);
    }
    onAutoMuteChange?.(autoMuteToggle.checked);
  });

  updateFloatingHUD();

  return {
    setStatus(message, statusKey) {
      if (!statusEl) {
        return;
      }
      statusEl.textContent = message;
      statusEl.className = 'status';
      if (statusKey) {
        statusEl.classList.add(`${STATUS_CLASS_PREFIX}${statusKey}`);
      }
    },
    updateSteps(stepCount) {
      if (stepsEl) {
        stepsEl.textContent = Number.isFinite(stepCount) ? stepCount.toString() : '--';
      }
    },
    updateBpm(bpm) {
      if (bpmEl) {
        bpmEl.textContent = Number.isFinite(bpm) ? bpm.toString() : '--';
      }
    },
    updateLastUpdate(timestamp = Date.now()) {
      if (lastUpdateEl) {
        lastUpdateEl.textContent = new Date(timestamp).toLocaleTimeString();
      }
    },
    updateMusicSource(label) {
      currentState.playlist = label;
      playlistSourceEl.textContent = label ?? 'None';
      updateFloatingHUD();
    },
    setMusicPlaying(isPlaying, meta = {}) {
      currentState.isPlaying = Boolean(isPlaying);
      playlistToggleButton.textContent = isPlaying ? 'Stop Session' : 'Start Session';
      if (playlistStatusEl) {
        playlistStatusEl.textContent = isPlaying ? 'Playing' : 'Stopped';
      }
      if (meta.playlist) {
        currentState.playlist = meta.playlist;
        playlistSourceEl.textContent = meta.playlist;
      }
      updateVideoMute(currentState.isPlaying);
      updateFloatingHUD();
    },
    getCurrentMood() {
      return currentState.mood;
    },
    getPrimaryTag() {
      return lastActiveTag || currentState.mood;
    },
    getSelectedTags() {
      return new Set(selectedTags.keys());
    },
    isMusicPlaying() {
      return currentState.isPlaying;
    },
    updateFloatingHUD,
  };
}
