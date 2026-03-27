let audio = new Audio();
let playlist = [];
let currentIndex = -1;
const listeners = new Set();

function notify() {
  const state = getState();
  listeners.forEach((listener) => listener(state));
}

function setSourceFromIndex(index) {
  if (index < 0 || index >= playlist.length) {
    return false;
  }

  currentIndex = index;
  audio.src = URL.createObjectURL(playlist[index]);
  notify();
  return true;
}

export function loadFiles(files) {
  const fileArray = Array.from(files ?? []);

  playlist = fileArray;
  currentIndex = -1;

  if (!playlist.length) {
    audio.removeAttribute("src");
    notify();
    return;
  }

  setSourceFromIndex(0);
}

export function play() {
  if (!audio.src) {
    return;
  }

  audio.play();
}

export function pause() {
  audio.pause();
}

export function playIndex(index) {
  if (!setSourceFromIndex(index)) {
    return;
  }

  audio.play();
}

export function playRandom() {
  if (!playlist.length) {
    return;
  }

  if (playlist.length === 1) {
    playIndex(0);
    return;
  }

  let randomIndex = currentIndex;
  while (randomIndex === currentIndex) {
    randomIndex = Math.floor(Math.random() * playlist.length);
  }

  playIndex(randomIndex);
}

export function next() {
  if (!playlist.length) {
    return;
  }

  const nextIndex = (currentIndex + 1) % playlist.length;
  playIndex(nextIndex);
}

export function prev() {
  if (!playlist.length) {
    return;
  }

  const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
  playIndex(prevIndex);
}

export function getState() {
  return {
    playlist,
    currentIndex,
    isLoaded: playlist.length > 0,
    currentTrack: currentIndex >= 0 ? playlist[currentIndex] : null,
    isPlaying: !audio.paused,
  };
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(getState());

  return () => {
    listeners.delete(listener);
  };
}

audio.onplay = () => {
  if (typeof window !== "undefined" && typeof window.setMusicActive === "function") {
    window.setMusicActive(true);
  }
  notify();
};

audio.onpause = () => {
  if (typeof window !== "undefined" && typeof window.setMusicActive === "function") {
    window.setMusicActive(false);
  }
  notify();
};

audio.onended = () => {
  next();
};
