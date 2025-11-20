/**
 * UI GAP (A9 FAIL):
 * Clip library backend exists,
 * but UI does NOT fetch /api/clips.
 * Library shows ONLY mnemonics from IndexedDB.
 * Backend clip metadata is completely unused.
 */

/**
 * ------------------------------------------------------------
 *  WIRING ASSERTION A9 – FAIL
 * ------------------------------------------------------------
 *  While clip library backend endpoints exist (/api/clips),
 *  THIS UI does NOT fetch or display backend clip metadata.
 *
 *  Current Behavior:
 *    • Library page only shows mnemonics stored in IndexedDB.
 *    • No calls to:
 *         GET /api/clips
 *         POST /api/clips/ingest
 *         POST /api/clips/enrich
 *         POST /api/clips/select
 *
 *  Result:
 *    • Clip Library subsystem is fully implemented on backend,
 *      but NOT surfaced in any reachable UI.
 *
 *  This matches audit result: FAIL.
 * ------------------------------------------------------------
 */
import { RVController } from '../ui/controller.js';

class RVLibraryPage extends HTMLElement {
  controller!: RVController;
  private gallery?: HTMLDivElement;

  connectedCallback() {
    this.className = 'panel';
    this.render();
    this.loadServerClips();
  }

  private render() {
    this.innerHTML = '<h2>Library & Review</h2>';
    const localSection = document.createElement('section');
    localSection.className = 'panel';

    const localHeading = document.createElement('h2');
    localHeading.textContent = 'Local Mnemonics';
    localSection.appendChild(localHeading);

    const gallery = document.createElement('div');
    gallery.className = 'grid';
    this.controller.mnemonics.forEach((mnemonic) => {
      const card = document.createElement('div');
      card.className = 'scene-card';
      card.innerHTML = `
        <strong>${mnemonic.hookPhrase}</strong>
        <p>${mnemonic.sceneBrief.action}</p>
        <small>${mnemonic.whisperText}</small>
      `;
      gallery.appendChild(card);
    });
    this.gallery = gallery;
    localSection.appendChild(gallery);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'large-btn';
    exportBtn.textContent = 'Export .rvzip';
    exportBtn.addEventListener('click', () => this.controller.exportAll());
    const exportWrapper = document.createElement('div');
    exportWrapper.className = 'panel';
    exportWrapper.appendChild(exportBtn);
    localSection.appendChild(exportWrapper);

    this.appendChild(localSection);
  }

  private async loadServerClips() {
    const serverClips = await this.fetchServerClips();
    const serverSection = document.createElement('section');
    serverSection.className = 'panel';

    const serverHeading = document.createElement('h2');
    serverHeading.textContent = 'Server Clips';
    serverSection.appendChild(serverHeading);

    if (serverClips.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.textContent = 'No server clips found. Try ingesting clips via /api/clips.';
      serverSection.appendChild(emptyState);
    } else {
      const serverGallery = document.createElement('div');
      serverGallery.className = 'grid';
      serverClips.forEach((clip) => {
        const card = document.createElement('div');
        card.className = 'scene-card';
        card.innerHTML = `
            <strong>${clip.title ?? '(untitled)'}</strong>
            <p>${clip.description ?? ''}</p>
            <small>${clip.tags?.join(', ')}</small>
        `;
        serverGallery.appendChild(card);
      });
      serverSection.appendChild(serverGallery);
    }

    this.appendChild(serverSection);
  }

  private async fetchServerClips() {
    try {
      const res = await fetch('/api/clips');
      const clips = res.ok ? await res.json() : [];
      return Array.isArray(clips) ? clips : [];
    } catch (err) {
      console.error('Failed to fetch server clips', err);
      return [];
    }
  }
}

customElements.define('rv-library-page', RVLibraryPage);
