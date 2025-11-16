class RVPrepStudio extends HTMLElement {
    constructor() {
        super(...arguments);
        this.uploadInput = document.createElement('input');
        this.interviewForm = document.createElement('form');
        this.previewSection = document.createElement('section');
        this.deckSelect = document.createElement('select');
    }
    connectedCallback() {
        this.classList.add('panel');
        this.render();
    }
    render() {
        this.innerHTML = '';
        this.uploadInput.type = 'file';
        this.uploadInput.accept = '.csv,.json';
        this.uploadInput.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file)
                this.controller.ingestFile(file);
        });
        const uploadCard = document.createElement('div');
        uploadCard.className = 'panel';
        uploadCard.innerHTML = `
      <h2>Upload</h2>
      <p>Drop CSV or JSON decks to begin. Fixtures live in /rv-app/fixtures.</p>
    `;
        uploadCard.appendChild(this.uploadInput);
        this.renderInterview();
        this.renderPreview();
        const prepareCard = document.createElement('div');
        prepareCard.className = 'panel';
        const runBtn = document.createElement('button');
        runBtn.textContent = 'Prepare 60 min Run';
        runBtn.className = 'large-btn';
        runBtn.addEventListener('click', () => this.controller.preparePlan('60min'));
        prepareCard.append('Prepare Run length defaults to 60 min.', document.createElement('br'), runBtn);
        this.append(uploadCard, this.interviewForm, this.previewSection, prepareCard);
        this.refreshDecks();
    }
    renderInterview() {
        this.interviewForm.className = 'panel grid';
        this.interviewForm.innerHTML = `
      <h2>Interview</h2>
      <label>Memory challenge
        <select name="challenge">
          <option value="names">Names</option>
          <option value="concepts">Concepts</option>
          <option value="lists">Lists</option>
        </select>
      </label>
      <label>Devices
        <select name="devices" multiple size="4">
          <option value="pun">Pun</option>
          <option value="metaphor">Metaphor</option>
          <option value="loci">Loci</option>
          <option value="PAO">PAO</option>
          <option value="acrostic">Acrostic</option>
        </select>
      </label>
      <label>Absurdity
        <select name="absurdity">
          <option value="mild">Mild</option>
          <option value="medium" selected>Medium</option>
          <option value="wild">Wild</option>
        </select>
      </label>
      <label>Audio mode
        <select name="audio">
          <option value="silent">Silent</option>
          <option value="earcons" selected>Earcons</option>
          <option value="whisper">Whisper</option>
          <option value="voiceover">Voiceover</option>
        </select>
      </label>
      <label>Talk-back window
        <select name="talkback">
          <option value="off">Off</option>
          <option value="short">Short</option>
          <option value="long">Long</option>
        </select>
      </label>
      <label>City anchor
        <select name="city">
          <option value="paris">Paris</option>
          <option value="london">London</option>
          <option value="mexico">Mexico City</option>
        </select>
      </label>
      <button class="large-btn" type="submit">Save Profile</button>
    `;
        this.interviewForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const data = new FormData(this.interviewForm);
            const devices = data.getAll('devices').map((value) => value);
            this.controller.saveProfile({
                challenge: data.get('challenge'),
                devices: devices.length ? devices : ['pun'],
                absurdity: data.get('absurdity'),
                audioMode: data.get('audio'),
                talkback: data.get('talkback'),
                city: data.get('city'),
            });
        });
    }
    refreshDecks() {
        this.deckSelect.innerHTML = '';
        this.controller.decks.forEach((deck) => {
            const option = document.createElement('option');
            option.value = deck.id;
            option.textContent = `${deck.name} (${deck.items.length})`;
            this.deckSelect.appendChild(option);
        });
    }
    renderPreview() {
        this.previewSection.className = 'panel';
        this.previewSection.innerHTML = '<h2>Preview & Confirm</h2>';
        const controls = document.createElement('div');
        controls.className = 'flex';
        const generate = document.createElement('button');
        generate.className = 'large-btn';
        generate.textContent = 'Generate Mnemonics';
        generate.addEventListener('click', () => {
            const deck = this.controller.decks.find((d) => d.id === this.deckSelect.value);
            if (deck)
                this.controller.generateMnemonics(deck);
        });
        controls.append(this.deckSelect, generate);
        this.previewSection.appendChild(controls);
        const grid = document.createElement('div');
        grid.className = 'grid';
        this.controller.addEventListener('update', () => this.populateMnemonics(grid));
        this.populateMnemonics(grid);
        this.previewSection.appendChild(grid);
    }
    populateMnemonics(container) {
        container.innerHTML = '';
        this.controller.mnemonics.slice(0, 12).forEach((mnemonic) => {
            const card = document.createElement('div');
            card.className = 'scene-card flex';
            card.innerHTML = `
        <div class="scene-thumb" style="background-image:url('${mnemonic.media.thumbUrl ?? ''}');background-size:cover;"></div>
        <div>
          <strong>${mnemonic.hookPhrase}</strong>
          <p>${mnemonic.sceneBrief.action}</p>
          <p style="color:var(--muted);font-size:0.9rem">${mnemonic.whisperText}</p>
        </div>
      `;
            container.appendChild(card);
        });
    }
}
customElements.define('rv-prep-studio', RVPrepStudio);
export {};
