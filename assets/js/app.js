import { Router } from "./lib/router.js";
import { UI } from "./lib/ui.js";
import { DB } from "./lib/db.js";
import { Engine } from "./lib/engine.js";

export const BUILD_ID = "DEV-" + new Date().toISOString(); // change proves deploy/caches

const state = {
  db: null,
  router: null,
  ui: null,
  engine: null,
};

function setStatus(msg) {
  const el = document.getElementById("statusLine");
  if (el) el.textContent = msg;
}

function fatal(err) {
  console.error(err);
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="card error">
      <h2>App crashed (sorry)</h2>
      <p class="muted">At least it didn’t pretend everything was fine.</p>
      <pre style="white-space:pre-wrap; margin:0; color:#ffd1d1">${escapeHtml(String(err?.stack || err))}</pre>
      <div class="hr"></div>
      <button id="btnReload" class="btn primary" type="button">Reload</button>
      <button id="btnWipe" class="btn danger" type="button">Wipe local DB + Reload</button>
    </div>
  `;
  document.getElementById("btnReload")?.addEventListener("click", () => location.reload());
  document.getElementById("btnWipe")?.addEventListener("click", async () => {
    try {
      await DB.nuke();
    } catch (_) {}
    location.reload();
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  })[c]);
}

async function boot() {
  document.getElementById("buildBadge").textContent = `build: ${BUILD_ID}`;

  // Hard guard: ensure module files exist by actually importing them already (this file).
  // If GitHub Pages served a 404 HTML for a module, you'd already be dead here. Congrats.

  setStatus("Opening local DB…");
  state.db = await DB.open({ onStatus: setStatus });

  state.engine = new Engine({ db: state.db });
  state.ui = new UI({
    db: state.db,
    engine: state.engine,
    onStatus: setStatus,
  });

  state.router = new Router({
    onRoute: async (route) => {
      try {
        await state.ui.render(route);
      } catch (e) {
        fatal(e);
      }
    }
  });

  document.getElementById("btnHome")?.addEventListener("click", () => state.router.go("/"));
  window.addEventListener("unhandledrejection", (e) => fatal(e.reason || e));
  window.addEventListener("error", (e) => fatal(e.error || e.message || e));

  setStatus("Ready.");
  state.router.start();
}

boot().catch(fatal);
