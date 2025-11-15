const MAX_HISTORY = 100;
const tagQueue = [];
const tagFrequency = new Map();

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

  tagQueue.push(normalized);
  tagFrequency.set(normalized, (tagFrequency.get(normalized) || 0) + 1);

  if (tagQueue.length > MAX_HISTORY) {
    const removed = tagQueue.shift();
    const current = tagFrequency.get(removed);
    if (typeof current === 'number') {
      if (current > 1) {
        tagFrequency.set(removed, current - 1);
      } else {
        tagFrequency.delete(removed);
      }
    }
  }
}

export function recordTags(tags) {
  if (!Array.isArray(tags)) {
    return;
  }
  tags.forEach((tag) => recordTag(tag));
}

export function getRecentTags(limit = 5) {
  const bounded = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
  return Array.from(tagFrequency.entries())
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, bounded)
    .map(([tag]) => tag);
}

export function clearTagHistory() {
  tagQueue.length = 0;
  tagFrequency.clear();
}

export function getTagHistorySize() {
  return tagQueue.length;
}
