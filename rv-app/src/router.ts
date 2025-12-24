export type Route = 'prep' | 'run' | 'hallucination' | 'library' | 'clips' | 'settings';

export class Router extends EventTarget {
  private current: Route = 'prep';

  constructor() {
    super();
    window.addEventListener('hashchange', () => this.sync());
    this.sync();
  }

  sync() {
    const hash = window.location.hash.replace('#', '') as Route;
    const validRoutes: Route[] = ['prep', 'run', 'hallucination', 'library', 'clips', 'settings'];
    
    if (hash && validRoutes.includes(hash)) {
      if (hash !== this.current) {
        this.current = hash;
        this.dispatchEvent(new CustomEvent('route', { detail: this.current }));
      }
    } else if (!hash) {
      this.current = 'prep';
      window.location.hash = this.current;
    }
  }

  navigate(route: Route) {
    this.current = route;
    window.location.hash = route;
    this.dispatchEvent(new CustomEvent('route', { detail: route }));
  }

  getRoute() {
    return this.current;
  }
}
