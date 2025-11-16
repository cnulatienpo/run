import { RVController } from '../ui/controller.js';

class RVLibraryPage extends HTMLElement {
  controller!: RVController;

  connectedCallback() {
    this.className = 'panel';
    this.render();
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
    this.appendChild(gallery);
    const exportBtn = document.createElement('button');
    exportBtn.className = 'large-btn';
    exportBtn.textContent = 'Export .rvzip';
    exportBtn.addEventListener('click', () => this.controller.exportAll());
    this.appendChild(exportBtn);
  }
}

customElements.define('rv-library-page', RVLibraryPage);
