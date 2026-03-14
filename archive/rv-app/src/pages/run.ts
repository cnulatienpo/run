import { RVController } from '../ui/controller.js';
import { getCurrentMnemonic } from '../core/session.js';
import { MusicController } from '../core/MusicController.js';
import { createHandDrawnRectSVG } from '../ui/hand-drawn-rect';

class RVRunPage extends HTMLElement {
  controller!: RVController;
  private video = document.createElement('video');
  private sceneContainer = document.createElement('div');
  private hud = document.createElement('div');
  private musicContainer = document.createElement('div');
  private musicController?: MusicController;

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

  private render() {
    this.innerHTML = '';
    const heading = document.createElement('h2');
    heading.textContent = 'Now The Fun Starts';

    // Create SVG frame
    const frameWidth = 480;
    const frameHeight = 320;
    const frameSVG = createHandDrawnRectSVG(frameWidth, frameHeight);

    // Style and position video inside frame
    const videoInset = 16; // px of margin between video and frame
    this.video.controls = true;
    this.video.style.width = `${frameWidth - videoInset * 2}px`;
    this.video.style.height = `${frameHeight - videoInset * 2}px`;
    this.video.style.position = 'absolute';
    this.video.style.left = `${videoInset}px`;
    this.video.style.top = `${videoInset}px`;
    this.video.style.background = '#0a1723';
    this.video.style.border = 'none';
    this.video.innerHTML = '<source src="" type="video/mp4" />';

    // Container for frame and video
    const frameContainer = document.createElement('div');
    frameContainer.style.position = 'relative';
    frameContainer.style.width = `${frameWidth}px`;
    frameContainer.style.height = `${frameHeight}px`;
    frameContainer.appendChild(frameSVG);
    frameContainer.appendChild(this.video);

    frameSVG.style.position = 'absolute';
    frameSVG.style.left = '0';
    frameSVG.style.top = '0';
    frameSVG.style.pointerEvents = 'none';
    frameSVG.style.zIndex = '2';
    this.video.style.zIndex = '1';

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
    
    this.append(heading, frameContainer, this.sceneContainer, this.hud, this.musicContainer);
    this.controller.addEventListener('session', () => this.updateScene());
    this.controller.audio.attachVideo(this.video);
    this.updateScene();
    
    // Initialize music controller
    try {
      this.musicController = new MusicController(this.musicContainer);
    } catch (error) {
      console.warn('Music controller initialization failed:', error);
    }
  }

  private handleHUD(action: string) {
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

  private updateScene() {
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
    this.controller.audio.playWhisper(mnemonic.whisperText, this.controller.profile!);
  }
}

customElements.define('rv-run-page', RVRunPage);
