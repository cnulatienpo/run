/**
 * ------------------------------------------------------------
 * RVAppShell is NEVER loaded by the HUD.
 *
 * Instead:
 *   - The HUD launches rv-app as a SEPARATE application.
 *   - rv-app provides its own nav system:
 *         Prep Studio, Run, Library, Settings
 *   - rv-app lives at /rv (served by src/server.ts)
 *
 * This prevents the HUD from mixing its UI with rv-app.
 * ------------------------------------------------------------
 */
import { Router, Route } from '../router.js';
import '../pages/prep-studio.js';
import '../pages/run.js';
import '../pages/hallucination.js';
import '../pages/library.js';
import '../pages/clip-library.js';
import '../pages/settings.js';
import { RVController } from './controller.js';

export class RVAppShell extends HTMLElement {
  private router = new Router();
  private controller = new RVController();
  private main = document.createElement('main');
  private nav = document.createElement('nav');

  constructor() {
    super();
    this.classList.add('rv-shell');
  }

  connectedCallback() {
    this.renderChrome();
    this.router.addEventListener('route', (event) => {
      this.renderRoute((event as CustomEvent<Route>).detail);
    });
    this.renderRoute(this.router.getRoute());
  }

  private renderChrome() {
    this.innerHTML = '';
    const header = document.createElement('header');
    header.innerHTML = `
      <div style="padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:1.8rem;font-weight:800">default</div>
          <div style="font-size:0.9rem;color:var(--muted)">Productivity Upgrade Machine</div>
        </div>
        <button class="large-btn" id="prep-seed">Load Fixtures</button>
      </div>
    `;
    header.querySelector('#prep-seed')?.addEventListener('click', () => this.controller.seedFixtures());
    this.nav.classList.add('flex');
    ['Give Me Your Files', 'Now The Fun Starts', 'Hallucinations', 'Brain Toys', 'Videos Warehouse', 'Fuse Box'].forEach(
      (label, index) => {
        const routes: Route[] = ['prep', 'run', 'hallucination', 'library', 'clips', 'settings'];
        const button = document.createElement('button');
        button.textContent = label;
        button.addEventListener('click', () => this.router.navigate(routes[index]));
        this.nav.appendChild(button);
      },
    );
    this.main.style.padding = '1rem';
    this.append(header, this.nav, this.main);
  }

  private renderRoute(route: Route) {
    Array.from(this.nav.children).forEach((button, index) => {
      button.classList.toggle('active', ['prep', 'run', 'hallucination', 'library', 'clips', 'settings'][index] === route);
    });
    const pageTag = {
      prep: 'rv-prep-studio',
      run: 'rv-run-page',
      hallucination: 'rv-hallucination-controls',
      library: 'rv-library-page',
      clips: 'rv-clip-library',
      settings: 'rv-settings-page',
    }[route];
    const page = document.createElement(pageTag);
    (page as any).controller = this.controller;
    this.main.innerHTML = '';
    this.main.appendChild(page);
  }
}

customElements.define('rv-app', RVAppShell);
