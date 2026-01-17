/*
UI.js
- Safe renderHome (no null DOM crashes)
- Full sheet with:
  - Abilities + modifiers
  - Saving throws (toggle proficient)
  - Skills (none/prof/expertise)
  - HP + Temp HP
  - Inventory
  - Portrait upload (IDB blob store)
  - Features & Choices space
  - Ruleset import (supports meta.name/meta.id)
  - Class select (ruleset.raw.classes)
  - Level up wizard (ruleset.raw.classes[classId].progression[level].choices)
*/

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
    this._setHTML(`<div class="card error"><h2>Not found</h2><p class="muted">Route <code>${esc(route.path)}</code> doesn’t exist.</p></div>`);
  }

  async makeBackupBlob(){
    const rulesets = await this.db.listRulesets();
    const characters = await this.db.listCharacters();
    const data = { exportedAt: new Date().toISOString(), rulesets, characters };
    return new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  }

  // ---------------- HOME (SAFE) ----------------
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
            <p class="muted">Rulesets drive level-up prompts. Imported rulesets are local-only.</p>
            <div class="hr"></div>
            <div id="rulesetList" class="list"></div>
          </div>
        </div>
      `);

      const $ = (sel) => this.app?.querySelector(sel);
      const searchEl = $("#search");
      const sortEl = $("#sort");
      const charListEl = $("#charList");
      const rulesetListEl = $("#rulesetList");
      const btnNew = $("#btnNewChar");
      const btnImport = $("#btnImportRules");

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
            <p class="muted">This usually means cached/partial HTML or broken deployment.</p>
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
        else list.sort((a,b)=>(String(b.updatedAt||"")).localeCompare(String(a.updatedAt||"")));

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
          <div class="item-meta">Level ${esc(String(lvl))} • ${esc(rs)} ${upd?`• updated ${esc(upd)}`:""}</div>
        </div>
        <div class="row" style="justify-content:flex-end">
          <button class="btn" data-open="${esc(c.id)}" type="button">Open</button>
          <button class="btn danger" data-del="${esc(c.id)}" type="button">Delete</button>
        </div>
      </div>
    `;
  }

  // ---------------- SHEET ----------------
  async renderSheet(id){
    if(this._portraitUrl){ try{ URL.revokeObjectURL(this._portraitUrl); }catch{} this._portraitUrl = null; }

    const raw = await this.db.getCharacter(id);
    if(!raw) return this.renderHome("Character not found.");
    const c = this.engine.validateCharacter(raw);

    const rulesets = await this.db.listRulesets();
    const ruleset = c.rulesetId ? await this.db.getRuleset(c.rulesetId) : null;
    const classes = ruleset ? this.engine.listClasses(ruleset) : [];

    // portrait
    let portraitUrl = null;
    if(c.portrait?.blobId){
      const blob = await this.db.getBlob(c.portrait.blobId);
      if(blob){
        portraitUrl = URL.createObjectURL(blob);
        this._portraitUrl = portraitUrl;
      }
    }

    const dd = this.engine.derived(c);

    this._setHTML(`
      <div class="grid two">
        <div class="card">
          <div class="row between">
            <h2>${esc(c.name)}</h2>
            <div class="row">
              <span class="pill">PB <b>${esc(fmtMod(dd.pb))}</b></span>
              <span class="pill">Passive Perception <b>${esc(String(dd.passivePerception))}</b></span>
              <button id="btnBack" class="btn ghost" type="button">Back</button>
            </div>
          </div>

          <div class="hr"></div>

          <div class="kv">
            <div><label>Name</label></div>
            <div><input id="name" class="input" value="${attr(c.name)}" /></div>

            <div><label>Ruleset</label></div>
            <div>
              <select id="ruleset" class="input">
                <option value="">(none)</option>
                ${rulesets.map(r => `<option value="${attr(r.id)}" ${r.id===c.rulesetId?"selected":""}>${esc(r.name||r.id)}</option>`).join("")}
              </select>
            </div>

            <div><label>Class</label></div>
            <div>
              <select id="classId" class="input" ${ruleset ? "" : "disabled"}>
                <option value="">(none)</option>
                ${classes.map(cl => `<option value="${attr(cl.id)}" ${cl.id===c.classId?"selected":""}>${esc(cl.name)}</option>`).join("")}
              </select>
            </div>

            <div><label>Level</label></div>
            <div class="row" style="width:100%">
              <input id="level" class="input" type="number" min="1" max="20" value="${attr(String(c.level))}" style="max-width:120px"/>
              <label class="small muted" style="display:inline-flex;align-items:center;gap:6px;margin-left:8px"><input id="forceLevelUp" type="checkbox"/> Force rerun</label>
              <button id="btnLevelUp" class="btn" type="button">Run level-up</button>
            </div>

            <div><label>AC</label></div>
            <div><input id="ac" class="input" type="number" value="${attr(String(c.ac))}"/></div>

            <div><label>Speed</label></div>
            <div><input id="speed" class="input" type="number" value="${attr(String(c.speed))}"/></div>
          </div>

          <div class="hr"></div>

          <div class="split">
            <div class="stat">
              <div class="k">HP</div>
              <div class="v">
                <div>
                  <div style="font-weight:900;font-size:22px"><span id="hpSumCur">${esc(String(c.hp.current))}</span> <span class="muted" style="font-size:14px">/ <span id="hpSumMax">${esc(String(c.hp.max))}</span></span></div>
                  <div class="small muted">Temp HP: <span id="hpSumTemp">${esc(String(c.tempHp||0))}</span></div>
                </div>
                <div class="row" style="justify-content:flex-end">
                  <button id="btnHeal" class="btn good" type="button">+ Heal</button>
                  <button id="btnDmg" class="btn danger" type="button">- Damage</button>
                </div>
              </div>
              <div class="hr"></div>
              <div class="row">
                <div style="flex:1">
                  <label>Current</label>
                  <input id="hpCurrent" class="input" type="number" value="${attr(String(c.hp.current))}"/>
                </div>
                <div style="flex:1">
                  <label>Max</label>
                  <input id="hpMax" class="input" type="number" value="${attr(String(c.hp.max))}"/>
                </div>
              </div>
              <div class="row" style="margin-top:10px">
                <div style="flex:1">
                  <label>Temp HP</label>
                  <input id="tempHp" class="input" type="number" value="${attr(String(c.tempHp||0))}"/>
                </div>
                <button id="btnTempClear" class="btn" type="button">Clear</button>
              </div>
            </div>

            <div class="stat">
              <div class="k">Portrait</div>
              <div class="row" style="margin-top:8px">
                <div class="portrait">
                  ${portraitUrl ? `<img alt="portrait" src="${attr(portraitUrl)}"/>` : `<span class="muted">No image</span>`}
                </div>
                <div style="flex:1; min-width:220px">
                  <label>Upload</label>
                  <input id="portraitFile" class="input" type="file" accept="image/*"/>
                  <div class="row" style="margin-top:10px">
                    <button id="btnPortraitClear" class="btn danger" type="button">Remove</button>
                  </div>
                  <div class="small muted" style="margin-top:6px">Stored locally in IndexedDB.</div>
                </div>
              </div>
            </div>
          </div>

          <div class="hr"></div>

          <div class="row between">
            <h3>Features & Choices</h3>
            <button id="btnAddFeature" class="btn" type="button">Add</button>
          </div>
          <div id="inspirationBox" class="list" style="margin-top:10px"></div>
          <div id="spellSlots" class="list" style="margin-top:10px"></div>
          <div class="row between" style="margin-top:10px">
            <h3 style="margin:0">Spells</h3>
            <button id="btnAddSpell" class="btn" type="button">Add spell</button>
          </div>
          <div id="spellList" class="list" style="margin-top:10px"></div>
          <div id="featureList" class="list" style="margin-top:10px"></div>

          <div class="hr"></div>

          <h3>Notes</h3>
          <textarea id="notes" class="input" placeholder="Anything important…">${esc(c.notes||"")}</textarea>
        </div>

        <div class="card">
          <div class="row between">
            <h2>Abilities</h2>
            <span class="pill">mods auto</span>
          </div>

          <div class="statgrid" style="margin-top:10px">
            ${this.engine.ABILS.map(a => this._abilBox(a, c.abilities[a], dd.mods[a])).join("")}
          </div>

          <div class="hr"></div>

          <div class="row between">
            <h2>Saving Throws</h2>
            <span class="pill">toggle prof</span>
          </div>
          <div id="saveList" class="list" style="margin-top:10px"></div>

          <div class="hr"></div>

          <div class="row between">
            <h2>Skills</h2>
            <span class="pill">none / prof / expertise</span>
          </div>
          <div id="skillList" class="list" style="margin-top:10px"></div>

          <div class="hr"></div>

          <div class="row between">
            <h2>Inventory</h2>
            <button id="btnAddItem" class="btn" type="button">Add item</button>
          </div>
          <div id="invList" class="list" style="margin-top:10px"></div>
        </div>
      </div>
    `);

    const $ = (sel) => this.app.querySelector(sel);

    const syncHpSummary = () => {
      const cur = $("#hpCurrent")?.value ?? String(c.hp.current);
      const max = $("#hpMax")?.value ?? String(c.hp.max);
      const temp = $("#tempHp")?.value ?? String(c.tempHp || 0);
      const a = $("#hpSumCur"); if (a) a.textContent = String(cur);
      const b = $("#hpSumMax"); if (b) b.textContent = String(max);
      const t = $("#hpSumTemp"); if (t) t.textContent = String(temp);
    };


    $("#btnBack").addEventListener("click", ()=> location.hash = "#/");

    // inventory render
    const renderInv = () => {
      $("#invList").innerHTML = c.inventory.length ? c.inventory.map((it, idx) => `
        <div class="item">
          <div>
            <div class="item-title">${esc(it.name||"Item")}</div>
            <div class="item-meta">qty ${esc(String(it.qty??1))}${it.note?` • ${esc(it.note)}`:""}</div>
          </div>
          <div class="row" style="justify-content:flex-end">
            <button class="btn danger" data-inv-del="${idx}" type="button">Remove</button>
          </div>
        </div>
      `).join("") : `<div class="muted">No items.</div>`;

      this.app.querySelectorAll("[data-inv-del]").forEach(b => b.addEventListener("click", async () => {
        const i = Number(b.getAttribute("data-inv-del"));
        c.inventory.splice(i,1);
        await this._autosave(c, id, true);
        renderInv();
      }));
    };

    // features render
    const renderSpellSlots = async () => {
      const slotEl = $("#spellSlots");
      if(!slotEl) return;

      let ruleset = null;
      if(c.rulesetId){
        try{ ruleset = await this.db.getRuleset(c.rulesetId); }catch{}
      }

      // Allow manual override of slot totals + renaming the tracker
      c.spellSlots ||= { expended: {} };
      c.spellSlots.expended ||= {};
      const label = String(c.spellSlots.label || "Spell Slots");
      const manualSlots = c.spellSlots.manual && typeof c.spellSlots.manual === 'object' ? c.spellSlots.manual.slots : null;

      const info = this.engine.getSpellSlots(c, ruleset);
      const slots = (manualSlots && typeof manualSlots === 'object') ? manualSlots : (info?.slots || {});
      const usingManual = (manualSlots && typeof manualSlots === 'object');
      const tiers = Object.keys(slots).map(n=>Number(n)).filter(n=>Number.isFinite(n) && Number(slots[n])>0).sort((a,b)=>a-b);
      if(!tiers.length){
        slotEl.innerHTML = ``;
        return;
      }

      slotEl.innerHTML = `
        <div class="item">
          <div>
            <div class="item-title">${esc(label)}</div>
            <div class="item-meta">${usingManual ? "manual totals" : (esc(info.casterType)+" caster • caster level "+esc(String(info.casterLevel)))}</div>
            <div style="margin-top:8px; display:grid; gap:10px">
              ${tiers.map(lvl => {
                const total = Number(slots[lvl]||0);
                const exp = clampInt(c.spellSlots.expended[String(lvl)] ?? 0, 0, total);
                const boxes = Array.from({length: total}).map((_,i)=>{
                  const checked = i < exp;
                  return `<label style="display:inline-flex;align-items:center;margin-right:6px">
                    <input type="checkbox" data-slot-lvl="${lvl}" data-slot-i="${i}" ${checked?"checked":""}/>
                  </label>`;
                }).join("");
                return `
                  <div>
                    <div class="small muted" style="margin-bottom:4px">Level ${esc(String(lvl))} (${esc(String(total))})</div>
                    <div>${boxes}</div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
          <div class="row" style="justify-content:flex-end;gap:8px">
            <button class="btn" id="btnSlotsEdit" type="button">Edit</button>
            <button class="btn" id="btnSlotsMode" type="button">${usingManual?"Use auto":"Use manual"}</button>
            <button class="btn" id="btnSlotsReset" type="button">Long rest reset</button>
          </div>
        </div>
      `;

      // handlers
      slotEl.querySelectorAll("input[data-slot-lvl]").forEach(cb => cb.addEventListener("change", async () => {
        const lvl = cb.getAttribute("data-slot-lvl");
        const i = Number(cb.getAttribute("data-slot-i"));
        const total = Number(slots[Number(lvl)]||0);
        const exp = clampInt(c.spellSlots.expended[String(lvl)] ?? 0, 0, total);

        // Make expended equal to highest checked index+1.
        // If unchecked a box below expended, reduce expended to that index.
        let newExp = exp;
        if(cb.checked){
          newExp = Math.max(exp, i+1);
        }else{
          newExp = Math.min(exp, i);
        }
        c.spellSlots.expended[String(lvl)] = clampInt(newExp, 0, total);
        await this._autosave(c, id, true);
        renderSpellSlots();
      }));

      const resetBtn = slotEl.querySelector("#btnSlotsReset");
      if(resetBtn) resetBtn.addEventListener("click", async () => {
        if(!confirm("Reset all spell slots (long rest)?")) return;
        c.spellSlots.expended = {};
        await this._autosave(c, id, true);
        renderSpellSlots();
      });

      const editBtn = slotEl.querySelector("#btnSlotsEdit");
      if(editBtn) editBtn.addEventListener("click", async () => {
        const newLabel = prompt("Rename this tracker (optional)", label);
        if(newLabel != null) c.spellSlots.label = String(newLabel).trim() || "Spell Slots";

        const cur = tiers.map(l=>`${l}=${Number(slots[l]||0)}`).join(", ");
        const s = prompt(
          "Manual slot totals. Leave blank to keep current.\nFormat: 1=4,2=3,3=2",
          usingManual ? cur : ""
        );
        if(s == null) return;
        const t = String(s).trim();
        if(t){
          const out = {};
          for (const part of t.split(/[,;\n]/)){
            const m = String(part).trim().match(/^(\d+)\s*[=:]\s*(\d+)$/);
            if(!m) continue;
            const lvl = clampInt(m[1], 0, 99);
            const tot = clampInt(m[2], 0, 99);
            if(lvl>=1 && lvl<=9 && tot>=0 && tot<=20) out[String(lvl)] = tot;
          }
          c.spellSlots.manual ||= {};
          c.spellSlots.manual.slots = out;
        }

        // Optional: manual edit of expended slots (helps when you fat-finger checkboxes).
        // Format: 1=1,2=0,3=2 (meaning: 1st level expended 1, 2nd expended 0, etc.)
        const expCur = tiers.map(l=>`${l}=${clampInt(c.spellSlots.expended[String(l)] ?? 0, 0, Number(slots[l]||0))}`).join(", ");
        const expS = prompt(
          "Edit expended counts (optional). Leave blank to keep current.\nFormat: 1=1,2=0,3=2",
          expCur
        );
        if(expS == null) return;
        const expT = String(expS).trim();
        if(expT){
          for (const part of expT.split(/[,;\n]/)){
            const m = String(part).trim().match(/^(\d+)\s*[=:]\s*(\d+)$/);
            if(!m) continue;
            const lvl = clampInt(m[1], 0, 99);
            const tot = Number(slots[Number(lvl)]||0);
            const exp = clampInt(m[2], 0, 99);
            if(lvl>=1 && lvl<=9) c.spellSlots.expended[String(lvl)] = clampInt(exp, 0, tot);
          }
        }
        await this._autosave(c, id, true);
        renderSpellSlots();
      });

      const modeBtn = slotEl.querySelector("#btnSlotsMode");
      if(modeBtn) modeBtn.addEventListener("click", async () => {
        if(usingManual){
          if(!confirm("Switch back to automatic slot calculation?")) return;
          delete c.spellSlots.manual;
          await this._autosave(c, id, true);
          renderSpellSlots();
          return;
        }
        const s = prompt("Enter manual slot totals\nFormat: 1=4,2=3,3=2", "1=2");
        if(s==null) return;
        const out = {};
        for (const part of String(s).split(/[,;\n]/)){
          const m = String(part).trim().match(/^(\d+)\s*[=:]\s*(\d+)$/);
          if(!m) continue;
          const lvl = clampInt(m[1], 0, 99);
          const tot = clampInt(m[2], 0, 99);
          if(lvl>=1 && lvl<=9 && tot>=0 && tot<=20) out[String(lvl)] = tot;
        }
        c.spellSlots.manual ||= {};
        c.spellSlots.manual.slots = out;
        await this._autosave(c, id, true);
        renderSpellSlots();
      });
    };



    const renderInspiration = () => {
      const inspEl = $("#inspirationBox");
      if(!inspEl) return;
      c.inspiration = !!c.inspiration;
      inspEl.innerHTML = `
        <div class="item">
          <div>
            <div class="item-title">Inspiration</div>
            <div class="item-meta">One checkbox. One fragile shred of hope.</div>
          </div>
          <div class="row" style="justify-content:flex-end">
            <label style="display:inline-flex;align-items:center;gap:8px">
              <input id="inspirationToggle" type="checkbox" ${c.inspiration?"checked":""}/>
              <span class="small muted">Have inspiration</span>
            </label>
          </div>
        </div>
      `;
      const t = inspEl.querySelector("#inspirationToggle");
      if(t) t.addEventListener("change", async () => {
        c.inspiration = !!t.checked;
        await this._autosave(c, id, true);
      });
    };

    const inferRollText = (spell) => {
      const meta = spell?.meta || spell?.details || {};
      const sum = String(spell?.summary || "");
      const full = (String(spell?.description || "") + " " + sum).toLowerCase();
      // If the ruleset gives explicit roll/save info, use it.
      if(meta.save) return `Save: ${meta.save}`;
      if(meta.attack) return `Attack: ${meta.attack}`;

      // Heuristics (because we live in a society that stores spells without mechanics)
      const mSave = full.match(/(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+saving\s+throw/);
      if(mSave) return `Save: ${mSave[1][0].toUpperCase()+mSave[1].slice(1)} save`;
      if(full.includes("spell attack") || full.includes("attack roll")) return "Spell attack roll";
      return "Roll: (not specified in ruleset)";
    };

    const renderSpells = async () => {
      const listEl = $("#spellList");
      if(!listEl) return;

      let ruleset = null;
      if(c.rulesetId){
        try{ ruleset = await this.db.getRuleset(c.rulesetId); }catch{}
      }
      const raw = ruleset?.raw || {};
      const all = Array.isArray(raw.spells) ? raw.spells : [];
      const byId = new Map(all.map(s => [s.id, s]));

      c.spells ||= { cantrips: [], known: [] };
      c.spells.cantrips = Array.isArray(c.spells.cantrips) ? c.spells.cantrips : [];
      c.spells.known = Array.isArray(c.spells.known) ? c.spells.known : [];

      const cantrips = [...new Set(c.spells.cantrips)].map(id => byId.get(id) || {id, name:id, level:0});
      const known = [...new Set(c.spells.known)].map(id => byId.get(id) || {id, name:id, level:"?"});

      const spellRow = (sp) => {
        const meta = sp?.meta || sp?.details || {};
        const lvl = sp?.level;
        const roll = inferRollText(sp);
        const header = `${sp?.name || sp?.id} ${lvl===0?"(Cantrip)":(Number.isFinite(Number(lvl))?`(Level ${lvl})`:"(Level ?)")}`;
        return `
          <div class="item">
            <div style="flex:1">
              <details>
                <summary style="cursor:pointer">
                  <span class="item-title">${esc(header)}</span>
                  <div class="item-meta">${esc(roll)}</div>
                </summary>
                <div style="margin-top:8px" class="small">
                  <div class="muted">School: ${esc(meta.school||"?")} • Casting: ${esc(meta.castingTime||"?")} • Range: ${esc(meta.range||"?")}</div>
                  <div class="muted">Components: ${esc(meta.components||"?")} • Duration: ${esc(meta.duration||"?")}</div>
                  ${sp?.summary ? `<div style="margin-top:8px">${esc(sp.summary)}</div>` : `<div style="margin-top:8px" class="muted">No summary in ruleset.</div>`}
                </div>
              </details>
            </div>
            <div class="row" style="justify-content:flex-end">
              <button class="btn danger" data-spell-del="${attr(sp.id)}" type="button">Remove</button>
            </div>
          </div>
        `;
      };

      listEl.innerHTML = `
        ${cantrips.length ? `<div class="small muted" style="margin:8px 0">Cantrips</div>${cantrips.sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(spellRow).join("")}` : `<div class="muted">No cantrips tracked.</div>`}
        <div class="hr"></div>
        ${known.length ? `<div class="small muted" style="margin:8px 0">Spells</div>${known.sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(spellRow).join("")}` : `<div class="muted">No spells tracked.</div>`}
      `;

      listEl.querySelectorAll("[data-spell-del]").forEach(b => b.addEventListener("click", async () => {
        const sid = b.getAttribute("data-spell-del");
        c.spells.cantrips = (c.spells.cantrips||[]).filter(x => x !== sid);
        c.spells.known = (c.spells.known||[]).filter(x => x !== sid);
        await this._autosave(c, id, true);
        renderSpells();
      }));
    };
    const renderFeatures = () => {
      const list = c.features || [];
      $("#featureList").innerHTML = list.length ? list.map(f => `
        <div class="item">
          <div>
            <div class="item-title">${esc(f.name || "Feature")}</div>
            <div class="item-meta">level ${esc(String(f.level ?? ""))}${f.tags?.length ? ` • ${esc(f.tags.join(", "))}` : ""}</div>
            ${f.text ? `<pre style="white-space:pre-wrap;margin:8px 0 0;color:#cfd6ee">${esc(f.text)}</pre>` : ""}
          </div>
          <div class="row" style="justify-content:flex-end">
            <button class="btn danger" data-feat-del="${esc(f.id)}" type="button">Delete</button>
          </div>
        </div>
      `).join("") : `<div class="muted">Level-up grants/choices will appear here.</div>`;

      this.app.querySelectorAll("[data-feat-del]").forEach(b => b.addEventListener("click", async () => {
        const fid = b.getAttribute("data-feat-del");
        c.features = (c.features||[]).filter(x => x.id !== fid);
        await this._autosave(c, id, true);
        renderFeatures();
      }));
    };

    // saves render
    const renderSaves = () => {
      const dd2 = this.engine.derived(c);
      $("#saveList").innerHTML = this.engine.SAVES.map(s => {
        const prof = !!c.saveProfs?.[s.key];
        const total = dd2.saves[s.key];
        const base = dd2.mods[s.key];
        return `
          <div class="item">
            <div>
              <div class="item-title">${esc(s.name)}</div>
              <div class="item-meta">total ${esc(fmtMod(total))} (base ${esc(fmtMod(base))}${prof?` + PB ${esc(fmtMod(dd2.pb))}`:""})</div>
            </div>
            <div class="row" style="justify-content:flex-end">
              <button class="btn ${prof?"good":""}" data-save="${esc(s.key)}" type="button">${prof?"Proficient":"Not proficient"}</button>
            </div>
          </div>
        `;
      }).join("");

      this.app.querySelectorAll("[data-save]").forEach(btn => btn.addEventListener("click", async () => {
        const k = btn.getAttribute("data-save");
        c.saveProfs ||= {};
        c.saveProfs[k] = !c.saveProfs[k];
        await this._autosave(c, id, true);
        renderSaves();
      }));
    };

    // skills render
    const renderSkills = () => {
      const dd2 = this.engine.derived(c);
      $("#skillList").innerHTML = this.engine.SKILLS.map(sk => {
        const rank = Number(c.skillProfs?.[sk.key] ?? 0);
        const total = dd2.skills[sk.key];
        const base = dd2.mods[sk.abil];
        const add = rank===1 ? dd2.pb : (rank===2 ? dd2.pb*2 : 0);
        return `
          <div class="item">
            <div>
              <div class="item-title">${esc(sk.name)} <span class="pill">${esc(sk.abil.toUpperCase())}</span></div>
              <div class="item-meta">total ${esc(fmtMod(total))} (base ${esc(fmtMod(base))}${add?` + ${esc(fmtMod(add))}`:""})</div>
            </div>
            <div class="row" style="justify-content:flex-end">
              <select class="input" data-skill="${esc(sk.key)}" style="max-width:190px">
                <option value="0" ${rank===0?"selected":""}>No prof</option>
                <option value="1" ${rank===1?"selected":""}>Proficient</option>
                <option value="2" ${rank===2?"selected":""}>Expertise</option>
              </select>
            </div>
          </div>
        `;
      }).join("");

      this.app.querySelectorAll("[data-skill]").forEach(sel => sel.addEventListener("change", async () => {
        const k = sel.getAttribute("data-skill");
        const v = clampInt(sel.value, 0, 2);
        c.skillProfs ||= {};
        c.skillProfs[k] = v;
        await this._autosave(c, id, true);
        renderSkills();
      }));
    };

    renderInv();
    renderInspiration();
    await renderSpellSlots();
    await renderSpells();
    renderFeatures();
    renderSaves();
    renderSkills();

    // autosave hooks
    const hookAutosave = (idOrEl) => $("#"+idOrEl).addEventListener("input", async () => {
      this._updateCharFromForm(c);
      await this._autosave(c, id);
      renderSaves();
      renderSkills();
      renderSpellSlots();
      renderSpells();
    });

    ["name","ac","speed","hpCurrent","hpMax","tempHp","notes"].forEach(hookAutosave);
$("#ruleset").addEventListener("change", async () => {
      c.rulesetId = $("#ruleset").value || "";
      c.classId = "";
      await this._autosave(c, id, true);
      syncHpSummary();
    });

    $("#classId").addEventListener("change", async () => {
      c.classId = $("#classId").value || "";
      await this._autosave(c, id, true);
    });

    this.app.querySelectorAll("[data-abil]").forEach(inp => {
      inp.addEventListener("input", async () => {
        const k = inp.getAttribute("data-abil");
        c.abilities[k] = clampInt(inp.value, 1, 30);
        await this._autosave(c, id, true);

        // Update the ability modifier display under the input box
        const ddNow = this.engine.derived(c);
        const box = inp.closest(".stat");
        const modEl = box ? box.querySelector(".mod") : null;
        if (modEl) modEl.textContent = fmtMod(ddNow.mods[k]);

        renderSaves();
        renderSkills();
      });
    });

    // hp buttons
    $("#btnHeal").addEventListener("click", async () => {
      const amt = prompt("Heal amount?", "1");
      if(amt==null) return;
      const a = clampInt(amt, 0, 9999);
      c.hp.current = clampInt(c.hp.current + a, 0, c.hp.max);
      // Sync form fields so _autosave() doesn't overwrite HP/temp changes
      const hpCurEl = this.app.querySelector("#hpCurrent");
      const hpMaxEl = this.app.querySelector("#hpMax");
      const tempEl  = this.app.querySelector("#tempHp");
      if (hpCurEl) hpCurEl.value = String(c.hp.current);
      if (hpMaxEl) hpMaxEl.value = String(c.hp.max);
      if (tempEl)  tempEl.value  = String(c.tempHp || 0);

      await this._autosave(c, id, true);
      syncHpSummary();
    });

    $("#btnDmg").addEventListener("click", async () => {
      const amt = prompt("Damage amount?", "1");
      if(amt==null) return;
      const dmg = clampInt(amt, 0, 9999);
      const temp = clampInt(c.tempHp||0, 0, 9999);
      const useTemp = Math.min(temp, dmg);
      c.tempHp = temp - useTemp;
      const left = dmg - useTemp;
      c.hp.current = clampInt(c.hp.current - left, 0, c.hp.max);
      // Sync form fields so _autosave() doesn't overwrite HP/temp changes
      const hpCurEl = this.app.querySelector("#hpCurrent");
      const hpMaxEl = this.app.querySelector("#hpMax");
      const tempEl  = this.app.querySelector("#tempHp");
      if (hpCurEl) hpCurEl.value = String(c.hp.current);
      if (hpMaxEl) hpMaxEl.value = String(c.hp.max);
      if (tempEl)  tempEl.value  = String(c.tempHp || 0);

      await this._autosave(c, id, true);
      syncHpSummary();
    });

    $("#btnTempClear").addEventListener("click", async () => {
      c.tempHp = 0;
      // Sync form fields so _autosave() doesn't overwrite HP/temp changes
      const hpCurEl = this.app.querySelector("#hpCurrent");
      const hpMaxEl = this.app.querySelector("#hpMax");
      const tempEl  = this.app.querySelector("#tempHp");
      if (hpCurEl) hpCurEl.value = String(c.hp.current);
      if (hpMaxEl) hpMaxEl.value = String(c.hp.max);
      if (tempEl)  tempEl.value  = String(c.tempHp || 0);

      await this._autosave(c, id, true);
      location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
    });

    // inventory add
    $("#btnAddItem").addEventListener("click", async () => {
      const name = prompt("Item name?", "Rations");
      if(!name) return;
      const qty = prompt("Qty?", "1");
      const note = prompt("Note? (optional)", "");
      c.inventory.push({ name, qty: clampInt(qty,1,9999), note: note||"" });
      await this._autosave(c, id, true);
      renderInv();
    });

    // portrait upload
    $("#portraitFile").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if(!f) return;
      if(c.portrait?.blobId){ try{ await this.db.deleteBlob(c.portrait.blobId); }catch{} }
      const blobId = await this.db.putBlob(f);
      c.portrait = { blobId, mime: f.type || "image/*" };
      await this._autosave(c, id, true);
      location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
    });

    $("#btnPortraitClear").addEventListener("click", async () => {
      if(c.portrait?.blobId){ try{ await this.db.deleteBlob(c.portrait.blobId); }catch{} }
      c.portrait = null;
      await this._autosave(c, id, true);
      location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
    });

    // feature add
    $("#btnAddFeature").addEventListener("click", async () => {
      const name = prompt("Feature name?", "New Feature");
      if(!name) return;
      c.features.push({ id: crypto.randomUUID(), name, level: c.level, text:"", tags:["manual"] });
      await this._autosave(c, id, true);
      renderFeatures();


    // spell add
    $("#btnAddSpell").addEventListener("click", async () => {
      if(!c.rulesetId) return alert("Select a ruleset first.");
      const rs = await this.db.getRuleset(c.rulesetId);
      const raw = rs?.raw || {};
      const all = Array.isArray(raw.spells) ? raw.spells : [];
      if(!all.length) return alert("This ruleset has no spells.");

      const q = prompt("Search spell name (optional)", "");
      if(q==null) return;
      const query = String(q).toLowerCase().trim();
      const matches = all.filter(s => !query || String(s.name||"").toLowerCase().includes(query)).slice(0,30);
      if(!matches.length) return alert("No matches.");

      const menu = matches.map((s,i)=>`${i+1}. ${s.name} (L${s.level})`).join("\n");
      const pick = prompt(`Pick a spell by number:

${menu}`, "1");
      if(pick==null) return;
      const idx = Number(pick)-1;
      if(!Number.isFinite(idx) || idx<0 || idx>=matches.length) return alert("Invalid pick.");
      const sp = matches[idx];

      c.spells ||= { cantrips: [], known: [] };
      if(Number(sp.level) === 0){
        if(!c.spells.cantrips.includes(sp.id)) c.spells.cantrips.push(sp.id);
      }else{
        if(!c.spells.known.includes(sp.id)) c.spells.known.push(sp.id);
      }
      await this._autosave(c, id, true);
      renderSpells();
    });
    });

    // level-up wizard
    $("#btnLevelUp").addEventListener("click", async () => {
      if(!c.rulesetId) return alert("Select a ruleset first.");
      const rs = await this.db.getRuleset(c.rulesetId);
      if(!rs) return alert("Ruleset missing. Re-import it.");
      if(!c.classId) return alert("Select a class.");
      const targetLevel = clampInt($("#level").value, 1, 20);
      const currentLevel = clampInt(c.level, 1, 20);
      const force = !!(this.app.querySelector("#forceLevelUp")?.checked);

      // Build list of levels to process.
      // - Normal mode: only process levels above current.
      // - Force mode: allow rerunning a specific level (even below current).
      const levels = [];
      if(force){
        levels.push(targetLevel);
      }else if (targetLevel === currentLevel) {
        levels.push(currentLevel);
      } else {
        for (let L = currentLevel + 1; L <= targetLevel; L++) levels.push(L);
      }

      // Ensure advancement structure exists
      c.advancement ||= {};

      for (const level of levels) {
        // Skip if this level already has recorded advancement (prevents repeats), unless forced
        if (!force && c.advancement[String(level)] && Object.keys(c.advancement[String(level)]).length) continue;

        if (force && c.advancement[String(level)] && Object.keys(c.advancement[String(level)]).length) {
          // Roll back prior auto-added stuff for this level so reruns can actually change choices.
          const prev = c.advancement[String(level)] || {};

          // Remove previous choice feature summaries + grant rows for this level.
          c.features = (c.features || []).filter(f => {
            if(Number(f.level) !== Number(level)) return true;
            const tags = f.tags || [];
            // Keep manual features
            if(tags.includes("manual")) return true;
            // Remove grant/choice rows
            if(tags.includes("grant") || tags.includes("choice")) return false;
            return true;
          });

          // Attempt to remove prior picks from spell/infusion stores
          c.spells ||= { cantrips: [], known: [] };
          c.infusions ||= { learned: [], active: {} };
          for (const [choiceId, picks] of Object.entries(prev)) {
            if(choiceId === "_applied") continue;
            const arr = Array.isArray(picks) ? picks : [picks];
            if(choiceId.includes("cantrip") || choiceId.includes("spell")) {
              c.spells.cantrips = (c.spells.cantrips||[]).filter(x => !arr.includes(x));
              c.spells.known = (c.spells.known||[]).filter(x => !arr.includes(x));
            }
            if(choiceId.includes("infusion")) {
              c.infusions.learned = (c.infusions.learned||[]).filter(x => !arr.includes(x));
            }
          }

          // Clear recorded advancement for this level to allow re-apply
          delete c.advancement[String(level)];
        }

        const node = this.engine.getProgression(rs, c.classId, level);
        if (!node) {
          alert(`No progression found for class "${c.classId}" at level ${level}.`);
          return;
        }

        // ---- HP progression (class hit die + CON mod) ----
        // Determine hit die: prefer ruleset class.hitDie, otherwise guess Artificer = d8
        const cls = (this.engine.getClass ? this.engine.getClass(rs, c.classId) : (rs?.raw?.classes?.[c.classId] || null));
        const hitDie = Number(cls?.hitDie || (String(c.classId).toLowerCase().includes("artificer") ? 8 : 8));
        const conMod = this.engine.abilityMod ? this.engine.abilityMod(c.abilities.con) : (this.engine.derived(c).mods.con);

        // Only apply HP for levels we are actually processing (and only once per level)
        c.advancement ||= {};
        c.advancement[String(level)] ||= {};
        const advLevel = c.advancement[String(level)];

        if (!advLevel.hpGain) {
          if (level === 1) {
            // Starting HP: hit die + CON mod (min 1)
            const startHp = Math.max(1, hitDie + conMod);
            // Only auto-set if character still looks "default-ish"
            if ((c.hp?.max ?? 0) <= 10 && (c.hp?.current ?? 0) <= 10) {
              c.hp.max = startHp;
              c.hp.current = startHp;
              advLevel.hpGain = startHp; // store as "starting"
            
              // Sync form fields so _autosave() does not overwrite HP
              const hpMaxEl = this.app.querySelector("#hpMax");
              const hpCurEl = this.app.querySelector("#hpCurrent");
              if (hpMaxEl) hpMaxEl.value = String(c.hp.max);
              if (hpCurEl) hpCurEl.value = String(c.hp.current);
}
          } else {
            // Level-up HP: default to average + CON mod, min 1
            const avg = Math.floor(hitDie / 2) + 1; // e.g. d8 => 5
            const defGain = Math.max(1, avg + conMod);
            const ans = prompt(`HP gain for level ${level}?\\nHit Die d${hitDie}, CON mod ${conMod >= 0 ? "+"+conMod : conMod}.\\nDefault: ${defGain}`, String(defGain));
            if (ans === null) { alert("Level-up cancelled."); return; }
            const gain = Math.max(1, clampInt(ans, 1, 999));
            c.hp.max = clampInt((c.hp.max ?? 0) + gain, 1, 9999);
            c.hp.current = clampInt((c.hp.current ?? 0) + gain, 0, c.hp.max);
            advLevel.hpGain = gain;
          
            // Sync form fields so _autosave() does not overwrite HP
            const hpMaxEl = this.app.querySelector("#hpMax");
            const hpCurEl = this.app.querySelector("#hpCurrent");
            if (hpMaxEl) hpMaxEl.value = String(c.hp.max);
            if (hpCurEl) hpCurEl.value = String(c.hp.current);
}
        }

const choices = Array.isArray(node?.choices) ? node.choices : [];
        const selections = {};

        for (const ch of choices) {
          const opts = this.engine.getChoiceOptions(rs, c.classId, ch, level);
          const picked = await this._choiceWizard(ch, opts, level);
          if (picked == null) { alert("Level-up cancelled."); return; }
          selections[ch.id] = picked;
        }

        const updated = this.engine.applyProgressionNodeToCharacter(c, rs, c.classId, level, selections);
        Object.assign(c, updated);
        await this._autosave(c, id, true);
      }

      // After processing, set the character's actual level to target (if higher)
      if (targetLevel > c.level) c.level = targetLevel;

      await this._autosave(c, id, true);
      location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
    });
  }

  _abilBox(key, score, mod){
    return `
      <div class="stat">
        <div class="k">${esc(key.toUpperCase())}</div>
        <div class="v">
          <input class="input" data-abil="${esc(key)}" type="number" min="1" max="30" value="${attr(String(score))}" style="max-width:110px"/>
          <div class="mod">${esc(fmtMod(mod))}</div>
        </div>
      </div>
    `;
  }

  _updateCharFromForm(c){
    c.name = (this.app.querySelector("#name")?.value) || c.name;    c.ac = clampInt(this.app.querySelector("#ac")?.value, 0, 60);
    c.speed = clampInt(this.app.querySelector("#speed")?.value, 0, 300);
    c.hp.current = clampInt(this.app.querySelector("#hpCurrent")?.value, 0, 9999);
    c.hp.max = clampInt(this.app.querySelector("#hpMax")?.value, 1, 9999);
    c.tempHp = clampInt(this.app.querySelector("#tempHp")?.value, 0, 9999);
    c.notes = this.app.querySelector("#notes")?.value || "";
    c.updatedAt = new Date().toISOString();
  }

  async _autosave(c, id, immediate=false){
    this._updateCharFromForm(c);
    if(this._autosaveTimer) clearTimeout(this._autosaveTimer);

    const doSave = async () => {
      this.onStatus("Saving…");
      await this.db.putCharacter(c);
      this.onStatus("Saved.");
    };

    if(immediate) return doSave();

    return new Promise((resolve,reject)=>{
      this._autosaveTimer = setTimeout(()=>{
        doSave().then(resolve).catch(reject);
      }, 250);
    });
  }

  async _newCharModal(rulesets){
    const m = modal(`
      <h2>New character</h2>
      <div class="hr"></div>
      <div class="kv">
        <div><label>Name</label></div>
        <div><input id="m_name" class="input" value="New Character"/></div>

        <div><label>Ruleset</label></div>
        <div>
          <select id="m_ruleset" class="input">
            <option value="">(none)</option>
            ${rulesets.map(r=>`<option value="${attr(r.id)}">${esc(r.name||r.id)}</option>`).join("")}
          </select>
        </div>

        <div><label>Level</label></div>
        <div><input id="m_level" class="input" type="number" min="1" max="20" value="1"/></div>
      </div>
      <div class="hr"></div>
      <div class="row" style="justify-content:flex-end">
        <button id="m_cancel" class="btn ghost" type="button">Cancel</button>
        <button id="m_create" class="btn primary" type="button">Create</button>
      </div>
    `);

    m.q("#m_cancel").addEventListener("click", ()=> m.close());
    m.q("#m_create").addEventListener("click", async ()=>{
      const name = m.q("#m_name").value || "Unnamed Character";
      const rulesetId = m.q("#m_ruleset").value || "";
      const level = clampInt(m.q("#m_level").value, 1, 20);

      const c = this.engine.newCharacter ? this.engine.newCharacter() : this.engine.validateCharacter({ name, rulesetId, level });
      c.name = name;
      c.rulesetId = rulesetId;
      c.level = level;

      await this.db.putCharacter(c);
      m.close();
      location.hash = `#/sheet?id=${encodeURIComponent(c.id)}`;
    });
  }

  async _importRulesModal(){
    const m = modal(`
      <h2>Import ruleset</h2>
      <p class="muted">Paste JSON or upload a file. Stored only on this device.</p>
      <div class="hr"></div>
      <label>Upload JSON</label>
      <input id="r_file" class="input" type="file" accept="application/json,.json"/>
      <div class="hr"></div>
      <label>Or paste JSON</label>
      <textarea id="r_text" class="input" placeholder='{"meta":{"id":"...","name":"...","version":"..."},"classes":{...}}'></textarea>
      <div class="hr"></div>
      <div class="row" style="justify-content:flex-end">
        <button id="r_cancel" class="btn ghost" type="button">Cancel</button>
        <button id="r_import" class="btn primary" type="button">Import</button>
      </div>
    `);

    m.q("#r_file").addEventListener("change", async (e)=>{
      const f = e.target.files?.[0];
      if(!f) return;
      m.q("#r_text").value = await f.text();
    });

    m.q("#r_cancel").addEventListener("click", ()=> m.close());
    m.q("#r_import").addEventListener("click", async ()=>{
      try{
        const text = m.q("#r_text").value.trim();
        if(!text) throw new Error("No JSON provided.");
        await this.engine.importRulesetFromJsonText(text);
        m.close();
        await this.renderHome("Ruleset imported.");
      }catch(e){
        alert(e.message || String(e));
      }
    });
  }

  async _choiceWizard(choice, options, level){
    const count = clampInt(choice?.count ?? 1, 1, 99);
    const title = choice?.title || choice?.id || "Choice";
    const help = choice?.help || "";

    const optsHtml = options.map(o => `<option value="${attr(o.id)}">${esc(o.name||o.id)}</option>`).join("");

    const m = modal(`
      <h2>Level ${esc(String(level))}: ${esc(title)}</h2>
      ${help ? `<p class="muted">${esc(help)}</p>` : `<p class="muted">Pick ${esc(String(count))}.</p>`}
      <div class="hr"></div>
      <select id="c_sel" class="input" multiple size="10">
        ${optsHtml}
      </select>
      <div class="hr"></div>
      <div class="row" style="justify-content:flex-end">
        <button id="c_cancel" class="btn ghost" type="button">Cancel</button>
        <button id="c_ok" class="btn primary" type="button">Apply</button>
      </div>
    `);

    return await new Promise((resolve)=>{
      m.q("#c_cancel").addEventListener("click", ()=>{ m.close(); resolve(null); });
      m.q("#c_ok").addEventListener("click", ()=>{
        const picked = Array.from(m.q("#c_sel").selectedOptions).map(o=>o.value).filter(Boolean);
        if(picked.length !== count){
          alert(`Pick exactly ${count}. You picked ${picked.length}.`);
          return;
        }
        m.close();
        resolve(picked);
      });
    });
  }

  _setHTML(html){
    if(!this.app) throw new Error("Missing #app element");
    this.app.innerHTML = html;
  }
}

// helpers
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c])); }
function attr(s){ return esc(s).replace(/"/g,"&quot;"); }
function clampInt(v,min,max){ const n = Number.parseInt(String(v),10); if(!Number.isFinite(n)) return min; return Math.max(min, Math.min(max,n)); }
function fmtMod(n){ const x = Number(n)||0; return x>=0 ? `+${x}` : `${x}`; }

function modal(inner){
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<div class="modal">${inner}</div>`;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  const q = (sel) => wrap.querySelector(sel);

  wrap.addEventListener("click", (e)=>{ if(e.target === wrap) close(); });
  const onKey = (e)=>{ if(e.key === "Escape"){ close(); window.removeEventListener("keydown", onKey); } };
  window.addEventListener("keydown", onKey);

  return { close, q, el: wrap };
}
