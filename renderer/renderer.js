import { createTagHUD } from './tagManager.js';
import { setTag, start } from './spawnLoop.js';

function init() {
  createTagHUD((tag) => {
    setTag(tag);
  });
  start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
