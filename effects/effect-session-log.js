const sessionLog = [];

function serializeData(data) {
  if (data === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (error) {
    if (data && typeof data === 'object') {
      return {
        __unserializable: true,
        keys: Object.keys(data),
        message: error?.message,
      };
    }
    return data;
  }
}

export function logEffectEvent(type, data = {}) {
  if (!type) {
    return null;
  }
  const entry = {
    time: Date.now(),
    type,
    payload: serializeData(data),
  };
  sessionLog.push(entry);
  return entry;
}

export function getEffectSessionLog() {
  return [...sessionLog];
}

export function clearEffectSessionLog() {
  sessionLog.length = 0;
}

export function exportEffectSessionLog() {
  if (sessionLog.length === 0) {
    console.warn('[effect-session-log] Nothing to export.');
    return null;
  }

  const payload = JSON.stringify(sessionLog, null, 2);

  try {
    const electronRequire = window?.require ?? (typeof require === 'function' ? require : null);
    if (electronRequire) {
      const fs = electronRequire('fs');
      const path = electronRequire('path');
      const fileName = `effect-session-${Date.now()}.json`;
      const filePath = path.join(process.cwd(), fileName);
      fs.writeFileSync(filePath, payload);
      console.log(`[effect-session-log] Saved to ${filePath}`);
      return filePath;
    }
  } catch (error) {
    console.warn('[effect-session-log] Failed to export via Node fs:', error);
  }

  if (typeof Blob === 'undefined' || typeof URL === 'undefined') {
    console.warn('[effect-session-log] Browser download APIs unavailable.');
    return null;
  }

  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `effect-session-${Date.now()}.json`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return null;
}
