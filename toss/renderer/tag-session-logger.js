const SESSION_ID_PREFIX = 'session';

let sessionState;
let sessionLog = [];

function generateSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${SESSION_ID_PREFIX}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function ensureSessionState() {
  if (!sessionState) {
    initialiseSessionLog();
  }
  if (!Array.isArray(sessionState.events)) {
    sessionState.events = sessionLog;
  }
  if (!Array.isArray(sessionState.tagSelections)) {
    sessionState.tagSelections = [];
  }
  if (!sessionState.music || typeof sessionState.music !== 'object') {
    sessionState.music = {};
  }
  return sessionState;
}

export function initialiseSessionLog() {
  const now = Date.now();
  sessionLog = [];
  sessionState = {
    sessionId: generateSessionId(),
    startTime: now,
    startedAt: now,
    device: 'fake_stepper',
    events: sessionLog,
    tagSelections: [],
    music: {},
  };
  return sessionState;
}

export function getSessionLog() {
  ensureSessionState();
  return sessionLog;
}

export function logSessionEvent(type, data = {}) {
  if (!type) {
    return null;
  }
  const state = ensureSessionState();
  const entry = {
    type,
    timestamp: Date.now(),
    ...data,
  };
  state.events.push(entry);
  return entry;
}

export function logStepUpdate(stepCount) {
  return logSessionEvent('step-update', { steps: stepCount });
}

export function logBpmUpdate(bpm) {
  return logSessionEvent('bpm-update', { bpm });
}

export function logBpmChange(bpm, source = 'hud') {
  return logSessionEvent('bpm-change', { bpm, source });
}

export function logMoodChange(mood, source = 'hud') {
  return logSessionEvent('mood-change', { mood, source });
}

export function logTagToggle(tag, action) {
  const suffix = action === 'deselected' ? 'deselected' : 'selected';
  return logSessionEvent(`tag-${suffix}`, { tag });
}

export function logPlaylistState(action, data = {}) {
  const suffix = typeof action === 'string' ? action : 'update';
  return logSessionEvent(`playlist-${suffix}`, data);
}

export function logEffectTriggered(effectName, mood, zone) {
  return logSessionEvent('effect-triggered', {
    effect: effectName,
    mood,
    zone,
  });
}

export function logTagSelection(tagName, source = 'HUD', metadata = {}) {
  if (!tagName) {
    return null;
  }
  const state = ensureSessionState();
  const entry = {
    tag: tagName,
    source,
    timestamp: Date.now(),
    ...metadata,
  };
  state.tagSelections.push(entry);
  const action = metadata?.action === 'deselected' ? 'deselected' : 'selected';
  logTagToggle(tagName, action);
  console.log(`[TAG] ${action === 'deselected' ? 'Deselected' : 'Selected'}: ${tagName} from ${source}`);
  return entry;
}

function serialiseSessionState() {
  const state = ensureSessionState();
  return {
    ...state,
    events: [...state.events],
    tagSelections: [...state.tagSelections],
  };
}

export function exportSessionLog() {
  const state = ensureSessionState();
  if (!state.events.length && !state.tagSelections.length) {
    console.warn('No session data to export.');
    return;
  }

  const payload = serialiseSessionState();
  const json = JSON.stringify(payload, null, 2);
  const fileName = `session-log-${Date.now()}.json`;

  try {
    const electronRequire = window?.require ?? (typeof require === 'function' ? require : null);
    if (electronRequire) {
      const fs = electronRequire('fs');
      const path = electronRequire('path');
      const filePath = path.join(process.cwd(), fileName);
      fs.writeFileSync(filePath, json);
      console.log(`[session-log] Saved to ${filePath}`);
      return filePath;
    }
  } catch (error) {
    console.warn('[session-log] Unable to write file via Node fs:', error);
  }

  const dataUrl = `data:text/json;charset=utf-8,${encodeURIComponent(json)}`;
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  console.log('[session-log] Exported via browser download');
  return null;
}
