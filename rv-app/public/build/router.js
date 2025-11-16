export class Router extends EventTarget {
    constructor() {
        super();
        this.current = 'prep';
        window.addEventListener('hashchange', () => this.sync());
        this.sync();
    }
    sync() {
        const hash = window.location.hash.replace('#', '');
        if (hash && hash !== this.current) {
            this.current = hash;
            this.dispatchEvent(new CustomEvent('route', { detail: this.current }));
        }
        else if (!hash) {
            window.location.hash = this.current;
        }
    }
    navigate(route) {
        this.current = route;
        window.location.hash = route;
        this.dispatchEvent(new CustomEvent('route', { detail: route }));
    }
    getRoute() {
        return this.current;
    }
}
