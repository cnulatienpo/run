const TAGS = ['Dreamcore', 'Urban', 'Nature', 'Ambient', 'Glide', 'Rare'];
const LOCAL_KEY = 'selectedTag';

export function createTagHUD(onTagChange, options = {}) {
  const hud = document.getElementById('hud');
  if (!hud) return null;

  const { defaultTag } = options;

  const tagWrap = document.createElement('div');
  tagWrap.id = 'tag-buttons';
  tagWrap.style.marginTop = '12px';

  const buttonsRow = document.createElement('div');
  buttonsRow.style.display = 'flex';
  buttonsRow.style.flexWrap = 'wrap';
  buttonsRow.style.gap = '8px';

  const tagStatus = document.createElement('div');
  tagStatus.id = 'tag-status';
  tagStatus.style.marginTop = '6px';
  tagStatus.style.fontSize = '14px';
  tagStatus.style.color = '#e5e7eb';

  tagWrap.appendChild(buttonsRow);
  tagWrap.appendChild(tagStatus);

  const storage = globalThis.localStorage;
  const storedTag = storage?.getItem(LOCAL_KEY) ?? null;
  const initialTag = resolveInitialTag(storedTag, defaultTag);

  TAGS.forEach((tag) => {
    const btn = document.createElement('button');
    btn.textContent = tag;
    btn.type = 'button';
    btn.style.marginRight = '8px';
    btn.style.padding = '6px 10px';
    btn.style.borderRadius = '6px';
    btn.style.border = 'none';
    btn.style.background = tag === initialTag ? '#4b5563' : '#1f2937';
    btn.style.color = '#fff';
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', () => {
      storage?.setItem(LOCAL_KEY, tag);
      updateTagUI(tag);
      if (typeof onTagChange === 'function') {
        onTagChange(tag);
      }
    });
    buttonsRow.appendChild(btn);
  });

  function updateTagUI(tag) {
    Array.from(buttonsRow.children).forEach((el) => {
      if (el.tagName === 'BUTTON') {
        el.style.background = el.textContent === tag ? '#4b5563' : '#1f2937';
      }
    });
    tagStatus.textContent = `Selected tag: ${tag}`;
  }

  if (initialTag) {
    updateTagUI(initialTag);
    if (storedTag !== initialTag) {
      storage?.setItem(LOCAL_KEY, initialTag);
    }
    if (typeof onTagChange === 'function') {
      onTagChange(initialTag);
    }
  }

  hud.appendChild(tagWrap);
  return { updateTagUI };
}

function resolveInitialTag(storedTag, defaultTag) {
  if (storedTag && TAGS.includes(storedTag)) {
    return storedTag;
  }
  if (defaultTag && TAGS.includes(defaultTag)) {
    return defaultTag;
  }
  return TAGS[0];
}
