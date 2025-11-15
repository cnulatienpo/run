const MAX_HISTORY = 20;
const tagHistory = [];

function normalizeTag(tag) {
  if (typeof tag !== 'string') {
    return null;
  }
  const trimmed = tag.trim();
  return trimmed ? trimmed : null;
}

export function recordTag(tag) {
  const normalized = normalizeTag(tag);
  if (!normalized) {
    return;
  }

  tagHistory.push(normalized);
  if (tagHistory.length > MAX_HISTORY) {
    tagHistory.splice(0, tagHistory.length - MAX_HISTORY);
  }
}

export function recordTags(tags) {
  if (!Array.isArray(tags)) {
    return;
  }
  tags.forEach((tag) => recordTag(tag));
}

export function getRecentTags(limit = MAX_HISTORY) {
  const bounded = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : MAX_HISTORY;
  return tagHistory.slice(-bounded);
}

export function clearTagHistory() {
  tagHistory.length = 0;
}

export function getTagHistorySize() {
  return tagHistory.length;
}
