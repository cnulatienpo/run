import { getCurrentMnemonic } from '../core/session.js';
import { MusicController } from '../core/MusicController.js';
class RVRunPage extends HTMLElement {
    constructor() {
        super(...arguments);
        this.video = document.createElement('video');
        this.sceneContainer = document.createElement('div');
        this.hud = document.createElement('div');
        this.musicContainer = document.createElement('div');
    }
    connectedCallback() {
        this.className = 'panel';
        this.render();
    }
    disconnectedCallback() {
        // Clean up music controller
        if (this.musicController) {
            this.musicController.destroy();
        }
    }
    render() {
        this.innerHTML = '';
        const heading = document.createElement('h2');
        heading.textContent = 'Now The Fun Starts';
        this.video.controls = true;
        this.video.style.width = '100%';
        this.video.style.maxHeight = '320px';
        this.video.style.borderRadius = '24px';
        this.video.innerHTML = '<source src="" type="video/mp4" />';
        this.sceneContainer.style.padding = '1rem';
        this.sceneContainer.style.marginTop = '1rem';
        this.sceneContainer.style.borderRadius = '24px';
        this.sceneContainer.style.background = '#0a1723';
        this.sceneContainer.style.minHeight = '200px';
        this.sceneContainer.style.display = 'flex';
        this.sceneContainer.style.flexDirection = 'column';
        this.sceneContainer.style.justifyContent = 'center';
        this.sceneContainer.style.alignItems = 'center';
        this.hud.className = 'flex';
        this.hud.style.flexWrap = 'wrap';
        this.hud.style.marginTop = '1rem';
        ['Start Run', 'Next', 'Mark Repeat', 'Quiet-10', 'Hush'].forEach((label) => {
            const button = document.createElement('button');
            button.className = 'large-btn';
            button.textContent = label;
            button.addEventListener('click', () => this.handleHUD(label));
            this.hud.appendChild(button);
        });
        // Set up music container
        this.musicContainer.style.marginTop = '1rem';
        this.append(heading, this.video, this.sceneContainer, this.hud, this.musicContainer);
        this.controller.addEventListener('session', () => this.updateScene());
        this.controller.audio.attachVideo(this.video);
        this.updateScene();
        // Initialize music controller
        try {
            this.musicController = new MusicController(this.musicContainer);
        }
        catch (error) {
            console.warn('Music controller initialization failed:', error);
        }
    }
    handleHUD(action) {
        switch (action) {
            case 'Start Run':
                this.controller.startRun();
                break;
            case 'Next':
                this.controller.logEvent('shown');
                this.updateScene();
                break;
            case 'Mark Repeat':
                this.controller.logEvent('repeat');
                break;
            case 'Quiet-10':
                this.video.volume = Math.max(0, this.video.volume - 0.3);
                break;
            case 'Hush':
                this.controller.audio.setHush(true);
                break;
        }
    }
    updateScene() {
        if (!this.controller.session) {
            this.sceneContainer.innerHTML = '<p>Prepare and start a run to see scenes.</p>';
            return;
        }
        const mnemonic = getCurrentMnemonic(this.controller.session);
        if (!mnemonic) {
            this.sceneContainer.innerHTML = '<p>All scenes delivered. Great work!</p>';
            return;
        }
        this.sceneContainer.innerHTML = `
      <div style="text-align:center">
        <div style="font-size:2rem;font-weight:700">${mnemonic.hookPhrase}</div>
        <p>${mnemonic.sceneBrief.action}</p>
        <p style="color:var(--muted)">${mnemonic.whisperText}</p>
      </div>
    `;
        this.controller.audio.playEarcon();
        this.controller.audio.playWhisper(mnemonic.whisperText, this.controller.profile);
    }
}
customElements.define('rv-run-page', RVRunPage);
