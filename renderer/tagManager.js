const tagDisplay = document.getElementById('current-tag');
const buttons = document.querySelectorAll('button[data-tag]');

export function initTags(onChange) {
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      tagDisplay.textContent = tag;
      localStorage.setItem('selectedTag', tag);
      onChange(tag);
    });
  });

  const saved = localStorage.getItem('selectedTag');
  if (saved) {
    tagDisplay.textContent = saved;
    onChange(saved);
  } else if (buttons[0]) {
    const fallback = buttons[0].dataset.tag;
    tagDisplay.textContent = fallback;
    onChange(fallback);
  }
}
