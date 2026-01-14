export class UI{
  constructor({ db, engine, onStatus }){
    this.db = db;
    this.engine = engine;
    this.onStatus = onStatus || (()=>{});
    this.app = document.getElementById("app");
    this._portraitUrl = null;
    this._autosaveTimer = null;
  }

  async render(route){
    if(route.path === "/" || route.path === "") return this.renderHome();
    if(route.path === "/sheet"){
      const id = route.query.id;
      if(!id) return this.renderHome("Missing character id.");
      return this.renderSheet(id);
    }
    this._setHTML(`<div class="card error"><h2>Not found</h2><p class="muted">Route doesn’t exist.</p></div>`);
  }

  async makeBackupBlob(){
    const rulesets = await this.db.listRulesets();
    const characters = await this.db.listCharacters();
    const data = { exportedAt: new Date().toISOString(), rulesets, characters };
    return new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  }

  // -------- HOME (HARDENED) --------
  async renderHome(msg=null){
    try{
      const chars = await this.db.listCharacters();
      const rulesets = await this.db.listRulesets();

      this._setHTML(`
        ${msg ? `<div class="card"><div class="row between"><div>${esc(msg)}</div><span class="pill">local only</span></div></div>` : ""}

        <div class="grid two">
          <div class="card">
            <div class="row between">
              <h2>Characters</h2>
              <button id="btnNewChar" class="btn primary" type="button">New character</button>
            </div>

            <div class="row" style="margin-top:10px">
              <input id="search" class="input" placeholder="Search characters…" />
              <select id="sort" class="input" style="max-width:220px">
                <option value="updated">Sort: last updated</option>
                <option value="name">Sort: name</option>
                <option value="level">Sort: level</option>
              </select>
            </div>

            <div class="hr"></div>
            <div id="charList" class="list"></div>
          </div>

          <div class="card">
            <div class="row between">
              <h2>Rulesets</h2>
              <button id="btnImportRules" class="btn" type="button">Import JSON</button>
            </div>
            <p class="muted">Rulesets drive level-up prompts.</p>
            <div class="hr"></div>
            <div id="rulesetList" class="list"></div>
          </div>
        </div>
      `);

      // Query *inside* app so we don’t get null from weird page states.
      const $ = (sel) => this.app?.querySelector(sel);
      const searchEl = $("#search");
      const sortEl = $("#sort");
      const charListEl = $("#charList");
      const rulesetListEl = $("#rulesetList");
      const btnNew = $("#btnNewChar");
      const btnImport = $("#btnImportRules");

      // If any of these are missing, don’t throw. Render an error card with details.
      if(!this.app || !searchEl || !sortEl || !charListEl || !rulesetListEl || !btnNew || !btnImport){
        const missing = [
          !this.app ? "#app" : null,
          !searchEl ? "#search" : null,
          !sortEl ? "#sort" : null,
          !charListEl ? "#charList" : null,
          !rulesetListEl ? "#rulesetList" : null,
          !btnNew ? "#btnNewChar" : null,
          !btnImport ? "#btnImportRules" : null,
        ].filter(Boolean).join(", ");
        this._setHTML(`
          <div class="card error">
            <h2>UI render failed</h2>
            <p class="muted">Missing DOM nodes: <code>${esc(missing)}</code></p>
            <p class="muted">This usually means cached/partial HTML or a broken render cycle.</p>
          </div>
        `);
        return;
      }

      const renderChars = () => {
        const q = (searchEl.value || "").toLowerCase().trim();
        const sort = sortEl.value;

        let list = chars.slice();
        if(q) list = list.filter(c => String(c.name||"").toLowerCase().includes(q));

        if(sort === "name") list.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
        else if(sort === "level") list.sort((a,b)=>(b.level||1)-(a.level||1));
        else list.sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));

        charListEl.innerHTML = list.length ? list.map(c => this._charRow(c)).join("") :
          `<div class="muted">No characters yet. Make one.</div>`;

        this.app.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
          location.hash = `#/sheet?id=${encodeURIComponent(b.dataset.open)}`;
        }));
        this.app.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
          const id = b.dataset.del;
          if(!confirm("Delete this character? No undo.")) return;
          await this.db.deleteCharacter(id);
          await this.renderHome("Character deleted.");
        }));
      };

      const renderRules = () => {
        rulesetListEl.innerHTML = rulesets.length ? rulesets.map(r => `
          <div class="item">
            <div>
              <div class="item-title">${esc(r.name||"Unnamed Ruleset")}</div>
              <div class="item-meta">id <code>${esc(r.id)}</code> • v${esc(String(r.version||""))}</div>
            </div>
            <div class="row" style="justify-content:flex-end">
              <button class="btn danger" data-del-rules="${esc(r.id)}" type="button">Delete</button>
            </div>
          </div>
        `).join("") : `<div class="muted">No rulesets imported.</div>`;

        this.app.querySelectorAll("[data-del-rules]").forEach(b => b.addEventListener("click", async () => {
          if(!confirm("Delete ruleset?")) return;
          await this.db.deleteRuleset(b.getAttribute("data-del-rules"));
          await this.renderHome("Ruleset deleted.");
        }));
      };

      renderChars();
      renderRules();

      searchEl.addEventListener("input", renderChars);
      sortEl.addEventListener("change", renderChars);

      btnNew.addEventListener("click", () => this._newCharModal(rulesets));
      btnImport.addEventListener("click", () => this._importRulesModal());
    }catch(err){
      console.error(err);
      this._setHTML(`
        <div class="card error">
          <h2>renderHome crashed</h2>
          <pre style="white-space:pre-wrap;margin:0">${esc(String(err?.stack || err))}</pre>
        </div>
      `);
    }
  }

  _charRow(c){
    const lvl = c.level ?? 1;
    const rs = c.rulesetId ? `ruleset ${c.rulesetId}` : "no ruleset";
    const upd = (c.updatedAt||"").slice?.(0,19)?.replace?.("T"," ") || "";
    return `
      <div class="item">
        <div>
          <div class="item-title">${esc(c.name||"Unnamed Character")}</div>
          <div class="item-meta">Level ${esc(String(lvl))} • ${esc(rs)} ${upd ? `• updated ${esc(upd)}` : ""}</div>
        </div>
        <div class="row" style="justify-content:flex-end">
          <button class="btn" data-open="${esc(c.id)}" type="button">Open</button>
          <button class="btn danger" data-del="${esc(c.id)}" type="button">Delete</button>
        </div>
      </div>
    `;
  }

  // ------- PLACEHOLDERS -------
  // If your repo already has these methods, keep them below or merge.
  // For now they throw a friendly message instead of hard-crashing.
  async renderSheet(){ this._setHTML(`<div class="card error"><h2>renderSheet missing</h2></div>`); }
  async _newCharModal(){ alert("New character modal not wired in this patch. (We can re-add from your current version.)"); }
  async _importRulesModal(){ alert("Import modal not wired in this patch. (We can re-add from your current version.)"); }

  _setHTML(html){
    if(!this.app) throw new Error("Missing #app element");
    this.app.innerHTML = html;
  }
}

function esc(s){ return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c])); }
