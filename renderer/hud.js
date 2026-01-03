import effectMap from '../effects/effect-mapping.json' assert { type: 'json' };
import { createHandDrawnButton, drawHandRect } from './hand-drawn-rect.js';

const STATUS_CLASS_PREFIX = 'status--';

// Create SVG button with procedurally drawn hand-drawn rectangle frame
// Uses the new drawing system where rectangles are procedures, not assets
function createSVGButton(text, options = {}) {
  const { width = 120, height = 32 } = options;
  
  // Generate unique seed based on text content for consistent but varied appearance
  const seed = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  return createHandDrawnButton(text, {
    width,
    height,
    seed,
    frameColor: '#8b0000',
    textColor: '#e63946',
    padding: 4,
  });
}

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
  
  // Create container with hand-drawn border
  const container = document.createElement('div');
  container.id = 'floating-info-hud-container';
  container.style.position = 'fixed';
  container.style.top = '16px';
  container.style.right = '16px';
  container.style.zIndex = '10000';
  container.style.pointerEvents = 'none';
  
  // Create SVG for hand-drawn border
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.pointerEvents = 'none';
  svg.setAttribute('width', '280');
  svg.setAttribute('height', '50');
  svg.setAttribute('viewBox', '0 0 280 50');
  
  // Draw background rectangle (for fill)
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', 0);
  bgRect.setAttribute('y', 0);
  bgRect.setAttribute('width', 280);
  bgRect.setAttribute('height', 50);
  bgRect.setAttribute('fill', 'rgba(0, 0, 0, 0.7)');
  bgRect.setAttribute('rx', 4);
  svg.appendChild(bgRect);
  
  // Draw hand-drawn border
  drawHandRect(svg, 2, 2, 276, 46, {
    seed: 42424, // Fixed seed for consistent look
    strokeColor: '#e63946',
    strokeWidth: 2,
    wobble: 2.5,
    segments: 14,
    overshoot: 3.5,
  });
  
  container.appendChild(svg);
  
  // Create text element
  infoHud = document.createElement('div');
  infoHud.id = 'floating-info-hud';
  infoHud.style.position = 'relative';
  infoHud.style.padding = '12px 16px';
  infoHud.style.color = '#f8fafc';
  infoHud.style.fontSize = '0.9rem';
  infoHud.style.fontFamily = "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  infoHud.style.pointerEvents = 'none';
  infoHud.style.width = '280px';
  infoHud.style.boxSizing = 'border-box';
  infoHud.style.textAlign = 'center';
  
  container.appendChild(infoHud);
  document.body.appendChild(container);
  
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

  const playlistToggleButton = createSVGButton('Start Session', { width: 110, height: 32 });
  playlistToggleButton.id = 'playlist-toggle';

  const playlistSourceEl = document.getElementById('playlist-source') ?? document.createElement('span');
  playlistSourceEl.id = 'playlist-source';
  playlistSourceEl.textContent = currentState.playlist ?? 'None';

  const tagsRow = document.createElement('div');
  tagsRow.className = 'control-row tags-row';
  const tagsLabel = document.createElement('label');
  tagsLabel.textContent = 'Tags (visual weighting only)';
  tagsRow.appendChild(tagsLabel);

  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'tag-buttons';
  tagsRow.appendChild(tagsContainer);

  const tagsStatus = document.createElement('div');
  tagsStatus.className = 'tag-status';
  tagsStatus.textContent = 'Tags steer hallucination visuals only (no playlist changes).';
  tagsRow.appendChild(tagsStatus);

  const availableTags = effectMap.labels ? Object.entries(effectMap.labels) : [];
  availableTags.forEach(([key, label]) => {
    const button = createSVGButton(label, { width: 100, height: 28 });
    button.dataset.tag = key;
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
      if (tagsStatus) {
        tagsStatus.textContent = selectedTags.size
          ? `Visuals weighted by: ${formatTagDisplay()}`
          : 'Tags steer hallucination visuals only (no playlist changes).';
      }
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
    const textEl = playlistToggleButton.querySelector('text');
    if (textEl) textEl.textContent = nextState ? 'Stop Session' : 'Start Session';
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
      const textEl = playlistToggleButton.querySelector('text');
      if (textEl) textEl.textContent = isPlaying ? 'Stop Session' : 'Start Session';
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
