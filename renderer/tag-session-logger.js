const FALLBACK_ID_PREFIX = 'session';

function generateFallbackId() {
  return `${FALLBACK_ID_PREFIX}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function ensureWindow() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window;
}

const fallbackSession = {
  sessionId: generateFallbackId(),
  startTime: Date.now(),
  tagSelections: [],
  events: [],
};

function ensureSessionLogStructure(target) {
  const sessionLog = target.sessionLog;
  const now = Date.now();
  if (!sessionLog || typeof sessionLog !== 'object') {
    target.sessionLog = {
      sessionId:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : generateFallbackId(),
      startTime: now,
      tagSelections: [],
      events: [],
    };
    return target.sessionLog;
  }

  if (!sessionLog.sessionId) {
    sessionLog.sessionId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : generateFallbackId();
  }
  if (!sessionLog.startTime) {
    sessionLog.startTime = now;
  }
  if (!Array.isArray(sessionLog.tagSelections)) {
    sessionLog.tagSelections = [];
  }
  if (!Array.isArray(sessionLog.events)) {
    sessionLog.events = [];
  }
  return sessionLog;
}

export function initialiseSessionLog() {
  const target = ensureWindow();
  if (!target) {
    return fallbackSession;
  }
  return ensureSessionLogStructure(target);
}

export function getSessionLog() {
  const target = ensureWindow();
  if (!target) {
    return fallbackSession;
  }
  return ensureSessionLogStructure(target);
}

export function logTagSelection(tagName, source = 'HUD', metadata = {}) {
  if (!tagName) {
    return;
  }
  const session = getSessionLog();
  const entry = {
    tag: tagName,
    source,
    timestamp: Date.now(),
  };
  if (metadata && typeof metadata === 'object') {
    Object.assign(entry, metadata);
  }
  session.tagSelections.push(entry);
  const action = metadata?.action ? metadata.action : 'selected';
  console.log(`[TAG] ${action === 'deselected' ? 'Deselected' : 'Selected'}: ${tagName} from ${source}`);
  return entry;
}

export function exportSessionLog(fileName) {
  const target = ensureWindow();
  if (!target) {
    return;
  }
  const session = ensureSessionLogStructure(target);
  const downloadName =
    fileName || `session-${session.sessionId || generateFallbackId()}.json`;
  const blob = new Blob([JSON.stringify(session, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = downloadName;
  anchor.click();
  URL.revokeObjectURL(url);
}
