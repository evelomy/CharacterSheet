import { Router } from "./lib/router.js";
import { UI } from "./lib/ui.js";
import { DB } from "./lib/db.js";
import { Engine } from "./lib/engine.js";

// build id
const BUILD_ID = "20260117-2318-4de8746";
window.BUILD_ID = BUILD_ID;

// IMPORTANT: this gets overwritten by the one-liner below
const state = { db:null, router:null, ui:null, engine:null };

function setStatus(msg){
  const el = document.getElementById("statusLine");
  if (el) el.textContent = msg;
}

function esc(s){
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}

function fatal(err){
  console.error(err);
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="card error">
      <div class="row between">
        <h2>App crashed</h2>
      </div>
      <pre style="white-space:pre-wrap;margin:0;color:#ffd1d1">${esc(String(err?.stack || err))}</pre>
      <div class="hr"></div>
      <div class="row">
        <button id="btnReload" class="btn primary" type="button">Reload</button>
        <button id="btnWipe" class="btn danger" type="button">Wipe local DB + Reload</button>
      </div>
    </div>
  `;
  document.getElementById("btnReload")?.addEventListener("click", () => location.reload());
  document.getElementById("btnWipe")?.addEventListener("click", async () => {
    try{ await DB.nuke(); }catch(_){}
    location.reload();
  });
}

async function boot(){
  const badge = document.getElementById("buildBadge");
  if (badge) badge.textContent = ;
  setStatus("Opening IndexedDB…");
  state.db = await DB.open({ onStatus:setStatus });

  state.engine = new Engine({ db: state.db });
  state.ui = new UI({ db: state.db, engine: state.engine, onStatus:setStatus });

  state.router = new Router({ onRoute: (route) => state.ui.render(route).catch(fatal) });

  document.getElementById("btnHome")?.addEventListener("click", () => state.router.go("/"));
  document.getElementById("btnBackup")?.addEventListener("click", async () => {
    try{
      const blob = await state.ui.makeBackupBlob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
      setStatus("Backup exported.");
    }catch(e){ fatal(e); }
  });

  window.addEventListener("unhandledrejection", (e) => fatal(e.reason || e));
  window.addEventListener("error", (e) => fatal(e.error || e.message || e));

  setStatus("Ready.");
  state.router.start();
}

boot().catch(fatal);
