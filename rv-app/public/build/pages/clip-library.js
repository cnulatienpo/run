"use strict";
class RVClipLibrary extends HTMLElement {
    async connectedCallback() {
        this.innerHTML = '<h2>Server Clip Library</h2>';
        const res = await fetch('/api/clips');
        const data = await res.ok ? await res.json() : [];
        const grid = document.createElement('div');
        grid.className = 'grid';
        data.forEach((clip) => {
            const card = document.createElement('div');
            card.className = 'scene-card';
            card.innerHTML = `
        <strong>${clip.title || '(untitled)'}</strong>
        <p>${clip.description || ''}</p>
        <small>${clip.tags?.join(', ')}</small>
      `;
            grid.appendChild(card);
        });
        this.appendChild(grid);
    }
}
customElements.define('rv-clip-library', RVClipLibrary);
