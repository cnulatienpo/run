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
    this.appendChild(gallery);
    const exportBtn = document.createElement('button');
    exportBtn.className = 'large-btn';
    exportBtn.textContent = 'Export .rvzip';
    exportBtn.addEventListener('click', () => this.controller.exportAll());
    const exportWrapper = document.createElement('div');
    exportWrapper.className = 'panel';
    exportWrapper.appendChild(exportBtn);
    this.appendChild(exportWrapper);
  }

  private async loadServerClips() {
    const response = await fetch('/api/clips');
    let serverClips: any[] = [];
    if (response.ok) {
      serverClips = await response.json();
    }
    const serverSection = document.createElement('section');
    serverSection.className = 'panel';

    if (serverClips.length === 0) {
      serverSection.innerHTML =
        '<h2>Remote Clip Library</h2><p>No server clips found. Use the API to ingest clips via POST /api/clips.</p>';
    } else {
      serverSection.innerHTML = '<h2>Remote Clip Library</h2>';
      const serverGallery = document.createElement('div');
      serverGallery.className = 'grid';
      serverClips.forEach((clip) => {
        const card = document.createElement('div');
        card.className = 'scene-card';
        card.textContent = clip.title || clip.name || clip.url || JSON.stringify(clip);
        serverGallery.appendChild(card);
      });
      serverSection.appendChild(serverGallery);
    }

    const insertionPoint = this.gallery?.nextSibling;
    if (insertionPoint) {
      this.insertBefore(serverSection, insertionPoint);
    } else {
      this.appendChild(serverSection);
    }
  }
}

customElements.define('rv-library-page', RVLibraryPage);
