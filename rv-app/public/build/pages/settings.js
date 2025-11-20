class RVSettingsPage extends HTMLElement {
    connectedCallback() {
        this.className = 'panel';
        this.render();
    }
    async render() {
        this.innerHTML = '<h2>Fuse Box</h2>';
        const usage = await this.controller.usage();
        const persisted = await this.controller.persistenceStatus();
        this.innerHTML += `
      <p>Usage: ${(usage.usage / 1024).toFixed(1)} KB / ${(usage.quota / 1024).toFixed(1)} KB</p>
      <p>Persistent storage: ${persisted.persisted ? 'granted' : 'requested'}</p>
    `;
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.flexDirection = 'column';
        buttonContainer.style.gap = '1rem';
        buttonContainer.style.marginTop = '1rem';
        const clearMedia = document.createElement('button');
        clearMedia.className = 'large-btn';
        clearMedia.textContent = 'Clear Media Cache';
        clearMedia.addEventListener('click', () => this.controller.clearData());
        const exportBtn = document.createElement('button');
        exportBtn.className = 'large-btn';
        exportBtn.textContent = 'Export .rvzip';
        exportBtn.addEventListener('click', () => this.controller.exportAll());
        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = '.rvzip';
        importInput.addEventListener('change', () => {
            const file = importInput.files?.[0];
            if (file)
                this.controller.importAll(file);
        });
        buttonContainer.append(clearMedia, exportBtn, importInput);
        this.append(buttonContainer);
    }
}
customElements.define('rv-settings-page', RVSettingsPage);
export {};
