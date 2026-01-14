export class Router {
  constructor({ onRoute }) {
    this.onRoute = onRoute;
    this._handler = this._handler.bind(this);
  }

  start() {
    window.addEventListener("hashchange", this._handler);
    this._handler();
  }

  stop() {
    window.removeEventListener("hashchange", this._handler);
  }

  go(path) {
    const norm = path.startsWith("/") ? path : "/" + path;
    location.hash = "#" + norm;
  }

  _handler() {
    const raw = (location.hash || "#/").slice(1);
    const path = raw.startsWith("/") ? raw : "/" + raw;

    const [p, qs] = path.split("?");
    const query = Object.fromEntries(new URLSearchParams(qs || ""));
    const route = { path: p, query };

    Promise.resolve(this.onRoute(route));
  }
}
