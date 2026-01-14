const ABILS = ["STR","DEX","CON","INT","WIS","CHA"];

// 5e skill map (you can extend this later or load from ruleset)
const SKILLS = [
  ["Acrobatics", "acrobatics", "DEX"],
  ["Animal Handling", "animal_handling", "WIS"],
  ["Arcana", "arcana", "INT"],
  ["Athletics", "athletics", "STR"],
  ["Deception", "deception", "CHA"],
  ["History", "history", "INT"],
  ["Insight", "insight", "WIS"],
  ["Intimidation", "intimidation", "CHA"],
  ["Investigation", "investigation", "INT"],
  ["Medicine", "medicine", "WIS"],
  ["Nature", "nature", "INT"],
  ["Perception", "perception", "WIS"],
  ["Performance", "performance", "CHA"],
  ["Persuasion", "persuasion", "CHA"],
  ["Religion", "religion", "INT"],
  ["Sleight of Hand", "sleight_of_hand", "DEX"],
  ["Stealth", "stealth", "DEX"],
  ["Survival", "survival", "WIS"],
];

export class UI{
  constructor({ db, engine, onStatus }){
    this.db = db;
    this.engine = engine;
    this.onStatus = onStatus || (()=>{});
    this.app = document.getElementById("app");
    this._portraitUrl = null; // objectURL
    this._autosaveTimer = null;
  }

  async render(route){
    if(route.path === "/" || route.path === "") return this.renderHome();
    if(route.path === "/sheet"){
      const id = route.query.id;
      if(!id) return this.renderHome("Missing character id.");
      return this.renderSheet(id);
    }
    this.app.innerHTML = `<div class="card error"><h2>Not found</h2><p class="muted">Route <code>${esc(route.path)}</code> doesn’t exist.</p></div>`;
  }

  async makeBackupBlob(){
    const rulesets = await this.db.listRulesets();
    const characters = await this.db.listCharacters();
    const data = { exportedAt: new Date().toISOString(), rulesets, characters };
    return new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  }

  async renderHome(msg=null){
    const chars = await this.db.listCharacters();
    const rulesets = await this.db.listRulesets();

    this.app.innerHTML = `
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
    `;

    const renderChars = () => {
      const q = (byId("search").value || "").toLowerCase().trim();
      const sort = byId("sort").value;

      let list = chars.slice();
      if(q) list = list.filter(c => String(c.name||"").toLowerCase().includes(q));

      if(sort === "name") list.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
      else if(sort === "level") list.sort((a,b)=>(b.level||1)-(a.level||1));
      else list.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));

      byId("charList").innerHTML = list.length ? list.map(c => this._charRow(c)).join("") :
        `<div class="muted">No characters yet. Make one.</div>`;

      this.app.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => location.hash = `#/sheet?id=${encodeURIComponent(b.dataset.open)}`));
      this.app.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
        const id = b.dataset.del;
        if(!confirm("Delete this character? No undo.")) return;
        await this.db.deleteCharacter(id);
        await this.renderHome("Character deleted.");
      }));
    };

    const renderRules = () => {
      byId("rulesetList").innerHTML = rulesets.length ? rulesets.map(r => `
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

    byId("search").addEventListener("input", renderChars);
    byId("sort").addEventListener("change", renderChars);

    byId("btnNewChar").addEventListener("click", () => this._newCharModal(rulesets));
    byId("btnImportRules").addEventListener("click", () => this._importRulesModal());
  }

  _charRow(c){
    const lvl = c.level ?? 1;
    const rs = c.rulesetId ? `ruleset ${c.rulesetId}` : "no ruleset";
    const upd = (c.updatedAt||"").slice(0,19).replace("T"," ");
    return `
      <div class="item">
        <div>
          <div class="item-title">${esc(c.name||"Unnamed Character")}</div>
          <div class="item-meta">Level ${esc(String(lvl))} • ${esc(rs)} • updated ${esc(upd)}</div>
        </div>
        <div class="row" style="justify-content:flex-end">
          <button class="btn" data-open="${esc(c.id)}" type="button">Open</button>
          <button class="btn danger" data-del="${esc(c.id)}" type="button">Delete</button>
        </div>
      </div>
    `;
  }

  async renderSheet(id){
    if(this._portraitUrl){ try{ URL.revokeObjectURL(this._portraitUrl); }catch(_){} this._portraitUrl = null; }

    const raw = await this.db.getCharacter(id);
    if(!raw) return this.renderHome("Character not found.");
    const c = this.engine.validateCharacter(raw);

    const rulesets = await this.db.listRulesets();
    const ruleset = c.rulesetId ? await this.db.getRuleset(c.rulesetId) : null;

    let portraitUrl = null;
    if(c.portrait?.blobId){
      const blob = await this.db.getBlob(c.portrait.blobId);
      if(blob){
        portraitUrl = URL.createObjectURL(blob);
        this._portraitUrl = portraitUrl;
      }
    }

    const pb = this.engine.proficiencyBonus(c.level);

    this.app.innerHTML = `
      <div class="grid two">
        <div class="card">
          <div class="row between">
            <h2>${esc(c.name)}</h2>
            <div class="row">
              <span class="pill">PB <b>${esc(fmtMod(pb))}</b></span>
              <span class="pill">id <code>${esc(c.id)}</code></span>
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

            <div><label>Level</label></div>
            <div class="row" style="width:100%">
              <input id="level" class="input" type="number" min="1" max="20" value="${attr(String(c.level))}" style="max-width:120px"/>
              <button id="btnLevelUp" class="btn" type="button">Run level-up</button>
              <span class="small muted">${ruleset ? `Using ${esc(ruleset.name)}` : "No ruleset selected."}</span>
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
                  <div style="font-weight:900;font-size:22px">${esc(String(c.hp.current))} <span class="muted" style="font-size:14px">/ ${esc(String(c.hp.max))}</span></div>
                  <div class="small muted">Temp HP: ${esc(String(c.tempHp||0))}</div>
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
                  <div class="small muted" style="margin-top:6px">Stored as Blob in IndexedDB.</div>
                </div>
              </div>
            </div>
          </div>

          <div class="hr"></div>

          <div class="row between">
            <h3>Features & Choices</h3>
            <button id="btnAddFeature" class="btn" type="button">Add</button>
          </div>
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
            ${ABILS.map(a => this._abilBox(a, c.abilities[a])).join("")}
          </div>

          <div class="hr"></div>

          <div class="row between">
            <h2>Skills</h2>
            <span class="pill">toggle prof/expertise</span>
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
    `;

    byId("btnBack").addEventListener("click", ()=> location.hash = "#/");

    // Inventory
    const renderInv = () => {
      byId("invList").innerHTML = c.inventory.length ? c.inventory.map((it, idx) => `
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
    renderInv();

    // Features
    const renderFeatures = () => {
      const list = c.features || [];
      byId("featureList").innerHTML = list.length ? list.map(f => `
        <div class="item">
          <div>
            <div class="item-title">${esc(f.name || "Feature")}</div>
            <div class="item-meta">level ${esc(String(f.level ?? ""))}${f.tags?.length ? ` • ${esc(f.tags.join(", "))}` : ""}</div>
            ${f.text ? `<pre style="white-space:pre-wrap;margin:8px 0 0;color:#cfd6ee">${esc(f.text)}</pre>` : ""}
          </div>
          <div class="row" style="justify-content:flex-end">
            <button class="btn" data-feat-edit="${esc(f.id)}" type="button">Edit</button>
            <button class="btn danger" data-feat-del="${esc(f.id)}" type="button">Delete</button>
          </div>
        </div>
      `).join("") : `<div class="muted">Nothing here yet. Level-up results will appear here automatically.</div>`;

      this.app.querySelectorAll("[data-feat-del]").forEach(b => b.addEventListener("click", async () => {
        const fid = b.getAttribute("data-feat-del");
        c.features = (c.features||[]).filter(x => x.id !== fid);
        await this._autosave(c, id, true);
        renderFeatures();
      }));
      this.app.querySelectorAll("[data-feat-edit]").forEach(b => b.addEventListener("click", async () => {
        const fid = b.getAttribute("data-feat-edit");
        const f = (c.features||[]).find(x => x.id === fid);
        if(!f) return;
        const name = prompt("Feature name", f.name || "");
        if(name == null) return;
        const lvl = prompt("Level (number)", String(f.level ?? c.level));
        if(lvl == null) return;
        const text = prompt("Text (short). For longer edits, we can add a proper editor later.", f.text || "");
        if(text == null) return;
        f.name = name || "Feature";
        f.level = clampInt(lvl, 1, 20);
        f.text = text || "";
        await this._autosave(c, id, true);
        renderFeatures();
      }));
    };
    renderFeatures();

    byId("btnAddFeature").addEventListener("click", async () => {
      const name = prompt("Feature name?", "New Feature");
      if(!name) return;
      c.features.push({ id: crypto.randomUUID(), name, level: c.level, text:"", tags:["manual"] });
      await this._autosave(c, id, true);
      renderFeatures();
    });

    // Skills
    const renderSkills = () => {
      const pbNow = this.engine.proficiencyBonus(c.level);
      byId("skillList").innerHTML = SKILLS.map(([label, key, abil]) => {
        const score = c.abilities?.[abil] ?? 10;
        const am = this.engine.abilityMod(score);
        const prof = Number(c.skillProfs?.[key] ?? 0); // 0/1/2
        const total = am + (prof ? pbNow * prof : 0);
        return `
          <div class="item">
            <div>
              <div class="item-title">${esc(label)} <span class="pill">${esc(abil)}</span></div>
              <div class="item-meta">mod ${esc(fmtMod(total))} (ability ${esc(fmtMod(am))}${prof ? ` + PB ${esc(fmtMod(pbNow))}×${prof}` : ""})</div>
            </div>
            <div class="row" style="justify-content:flex-end">
              <select class="input" data-skill="${esc(key)}" style="max-width:180px">
                <option value="0" ${prof===0?"selected":""}>No prof</option>
                <option value="1" ${prof===1?"selected":""}>Proficient</option>
                <option value="2" ${prof===2?"selected":""}>Expertise</option>
              </select>
            </div>
          </div>
        `;
      }).join("");

      this.app.querySelectorAll("[data-skill]").forEach(sel => {
        sel.addEventListener("change", async () => {
          const k = sel.getAttribute("data-skill");
          const v = clampInt(sel.value, 0, 2);
          c.skillProfs ||= {};
          c.skillProfs[k] = v;
          await this._autosave(c, id, true);
          renderSkills();
        });
      });
    };
    renderSkills();

    // Autosave core fields
    const hookAutosave = (idOrEl) => byId(idOrEl).addEventListener("input", async () => {
      this._updateCharFromForm(c);
      await this._autosave(c, id);
      // skills depend on level + abilities, so re-render if those changed
      if(idOrEl === "level") renderSkills();
    });
    ["name","ruleset","level","ac","speed","hpCurrent","hpMax","tempHp","notes"].forEach(hookAutosave);

    // Abilities inputs
    this.app.querySelectorAll("[data-abil]").forEach(inp => {
      inp.addEventListener("input", async () => {
        const k = inp.getAttribute("data-abil");
        c.abilities[k] = clampInt(inp.value, 1, 30);
        const modEl = this.app.querySelector(`[data-mod="${k}"]`);
        if(modEl) modEl.textContent = fmtMod(this.engine.abilityMod(c.abilities[k]));
        await this._autosave(c, id, true);
        renderSkills();
      });
    });

    // HP buttons
    byId("btnHeal").addEventListener("click", async () => {
      const amt = prompt("Heal amount?", "1");
      if(amt==null) return;
      const a = clampInt(amt, 0, 9999);
      c.hp.current = clampInt(c.hp.current + a, 0, c.hp.max);
      await this._autosave(c, id, true);
      location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
    });
    byId("btnDmg").addEventListener("click", async () => {
      const amt = prompt("Damage amount?", "1");
      if(amt==null) return;
      const dmg = clampInt(amt, 0, 9999);
      const temp = clampInt(c.tempHp||0, 0, 9999);
      const useTemp = Math.min(temp, dmg);
      c.tempHp = temp - useTemp;
      const left = dmg - useTemp;
      c.hp.current = clampInt(c.hp.current - left, 0, c.hp.max);
      await this._autosave(c, id, true);
      location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
    });
    byId("btnTempClear").addEventListener("click", async () => {
      c.tempHp = 0;
      await this._autosave(c, id, true);
      location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
    });

    // Inventory
    byId("btnAddItem").addEventListener("click", async () => {
      const name = prompt("Item name?", "Rations");
      if(!name) return;
      const qty = prompt("Qty?", "1");
      const note = prompt("Note? (optional)", "");
      c.inventory.push({ name, qty: clampInt(qty, 1, 9999), note: note||"" });
      await this._autosave(c, id, true);
      renderInv();
    });

    // Portrait
    byId("portraitFile").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if(!f) return;
      if(c.portrait?.blobId){
        try{ await this.db.deleteBlob(c.portrait.blobId); }catch(_){}
      }
      const blobId = await this.db.putBlob(f);
      c.portrait = { blobId, mime: f.type || "image/*" };
      await this._autosave(c, id, true);
      location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
    });

    byId("btnPortraitClear").addEventListener("click", async () => {
      if(c.portrait?.blobId){
        try{ await this.db.deleteBlob(c.portrait.blobId); }catch(_){}
      }
      c.portrait = null;
      await this._autosave(c, id, true);
      location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
    });

    // Level-up flow: run for each level you gained
    byId("btnLevelUp").addEventListener("click", async () => {
      if(!c.rulesetId){
        alert("Select a ruleset first.");
        return;
      }
      const rs = await this.db.getRuleset(c.rulesetId);
      if(!rs){ alert("Ruleset missing. Re-import it."); return; }

      const targetLevel = clampInt(byId("level").value, 1, 20);
      const currentLevel = clampInt(c.level, 1, 20);

      if(targetLevel < currentLevel){
        alert("Lowering level doesn’t run a wizard. It just makes you sad.");
        c.level = targetLevel;
        await this._autosave(c, id, true);
        renderSkills();
        return;
      }

      for(let lvl = currentLevel + 1; lvl <= targetLevel; lvl++){
        const choices = this.engine.getLevelChoices(rs, lvl);
        if(!choices.length){
          // no prompts for this level, still advance
          c.level = lvl;
          continue;
        }
        const selections = await this._levelWizard(rs, lvl, choices);
        if(!selections){
          alert("Level-up cancelled.");
          break;
        }
        const updated = this.engine.applyLevelSelections(c, lvl, selections);
        Object.assign(c, updated);
        await this._autosave(c, id, true);
      }

      // final ensure level matches the input
      c.level = targetLevel;
      await this._autosave(c, id, true);
      location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
    });
  }

  _abilBox(a, score){
    const mod = fmtMod(this.engine.abilityMod(score));
    return `
      <div class="stat">
        <div class="k">${esc(a)}</div>
        <div class="v">
          <input class="input" data-abil="${esc(a)}" type="number" min="1" max="30" value="${attr(String(score))}" style="max-width:110px"/>
          <div class="mod" data-mod="${esc(a)}">${esc(mod)}</div>
        </div>
      </div>
    `;
  }

  _updateCharFromForm(c){
    c.name = byId("name").value || c.name;
    c.rulesetId = byId("ruleset").value || null;
    c.level = clampInt(byId("level").value, 1, 20);
    c.ac = clampInt(byId("ac").value, 0, 60);
    c.speed = clampInt(byId("speed").value, 0, 300);
    c.hp.current = clampInt(byId("hpCurrent").value, 0, 9999);
    c.hp.max = clampInt(byId("hpMax").value, 1, 9999);
    c.tempHp = clampInt(byId("tempHp").value, 0, 9999);
    c.notes = byId("notes").value || "";
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

    return new Promise((resolve,reject) => {
      this._autosaveTimer = setTimeout(() => {
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
    m.q("#m_create").addEventListener("click", async () => {
      const name = m.q("#m_name").value || "Unnamed Character";
      const rulesetId = m.q("#m_ruleset").value || null;
      const level = clampInt(m.q("#m_level").value, 1, 20);

      const c = this.engine.validateCharacter({ name, rulesetId, level });
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
      <textarea id="r_text" class="input" placeholder='{"id":"homebrew","name":"Homebrew","pools":{},"progression":{"2":{"choices":[...]}}}'></textarea>
      <div class="hr"></div>
      <div class="row" style="justify-content:flex-end">
        <button id="r_cancel" class="btn ghost" type="button">Cancel</button>
        <button id="r_import" class="btn primary" type="button">Import</button>
      </div>
    `);

    m.q("#r_file").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if(!f) return;
      m.q("#r_text").value = await f.text();
    });

    m.q("#r_cancel").addEventListener("click", ()=> m.close());
    m.q("#r_import").addEventListener("click", async () => {
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

  async _levelWizard(ruleset, level, choices){
    const blocks = choices.map((ch, idx) => {
      const key = ch.key || `choice_${idx}`;
      const label = ch.label || key;
      const type = ch.type || "pickOne";
      const opts = Array.isArray(ch.options) ? ch.options : (ch.pool ? this.engine.resolvePool(ruleset, ch.pool) : []);
      const optionHtml = opts.map(o => {
        const v = typeof o === "string" ? o : (o?.id || o?.name || JSON.stringify(o));
        const t = typeof o === "string" ? o : (o?.name || o?.label || o?.id || v);
        return `<option value="${attr(v)}">${esc(t)}</option>`;
      }).join("");

      if(type === "pickMany"){
        return `
          <div class="card" style="background:rgba(255,255,255,.02)">
            <div class="row between">
              <div>
                <div style="font-weight:900">${esc(label)}</div>
                <div class="small muted">key <code>${esc(key)}</code> • pick many</div>
              </div>
              <span class="pill">min ${esc(String(ch.min??0))} max ${esc(String(ch.max??999))}</span>
            </div>
            <div class="hr"></div>
            <select class="input" data-choice="${attr(key)}" multiple size="6">
              ${optionHtml}
            </select>
          </div>
        `;
      }

      if(type === "number"){
        return `
          <div class="card" style="background:rgba(255,255,255,.02)">
            <div style="font-weight:900">${esc(label)}</div>
            <div class="small muted">key <code>${esc(key)}</code> • number</div>
            <div class="hr"></div>
            <input class="input" data-choice="${attr(key)}" type="number" value="${attr(String(ch.default??0))}"/>
          </div>
        `;
      }

      if(type === "text"){
        return `
          <div class="card" style="background:rgba(255,255,255,.02)">
            <div style="font-weight:900">${esc(label)}</div>
            <div class="small muted">key <code>${esc(key)}</code> • text</div>
            <div class="hr"></div>
            <input class="input" data-choice="${attr(key)}" type="text" value="${attr(String(ch.default??""))}"/>
          </div>
        `;
      }

      return `
        <div class="card" style="background:rgba(255,255,255,.02)">
          <div style="font-weight:900">${esc(label)}</div>
          <div class="small muted">key <code>${esc(key)}</code> • pick one</div>
          <div class="hr"></div>
          <select class="input" data-choice="${attr(key)}">
            <option value="">(choose)</option>
            ${optionHtml}
          </select>
        </div>
      `;
    }).join("");

    const m = modal(`
      <h2>Level ${esc(String(level))} wizard</h2>
      <p class="muted">${esc(ruleset.name||"Ruleset")} • complete required choices</p>
      <div class="hr"></div>
      <div class="grid" style="gap:12px">${blocks}</div>
      <div class="hr"></div>
      <div class="row" style="justify-content:flex-end">
        <button id="lu_cancel" class="btn ghost" type="button">Cancel</button>
        <button id="lu_apply" class="btn primary" type="button">Apply</button>
      </div>
    `);

    return await new Promise((resolve) => {
      m.q("#lu_cancel").addEventListener("click", ()=> { m.close(); resolve(null); });

      m.q("#lu_apply").addEventListener("click", ()=> {
        const selections = {};
        const missing = [];

        choices.forEach((ch, idx) => {
          const key = ch.key || `choice_${idx}`;
          const type = ch.type || "pickOne";
          const el = m.el.querySelector(`[data-choice="${cssAttr(key)}"]`);
          if(!el) return;

          if(type === "pickMany"){
            const picked = Array.from(el.selectedOptions).map(o=>o.value).filter(Boolean);
            const min = Number(ch.min ?? 0);
            const max = Number(ch.max ?? 9999);
            if(picked.length < min || picked.length > max) missing.push(`${key} (${picked.length} picked)`);
            selections[key] = picked;
            return;
          }

          const v = String(el.value || "").trim();
          if((type === "pickOne") && !v) missing.push(key);
          selections[key] = v;
        });

        if(missing.length){
          alert("Missing/invalid selections: " + missing.join(", "));
          return;
        }
        m.close();
        resolve(selections);
      });
    });
  }
}

function byId(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c])); }
function attr(s){ return esc(s).replace(/"/g,"&quot;"); }
function clampInt(v,min,max){ const n = Number.parseInt(String(v),10); if(!Number.isFinite(n)) return min; return Math.max(min, Math.min(max,n)); }
function fmtMod(n){ return (Number(n)>=0?`+${n}`:`${n}`); }
function cssAttr(s){ return String(s).replace(/"/g,'\\"'); }

function modal(inner){
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<div class="modal">${inner}</div>`;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  const q = (sel) => wrap.querySelector(sel);

  wrap.addEventListener("click", (e)=> { if(e.target === wrap) close(); });
  const onKey = (e) => { if(e.key === "Escape"){ close(); window.removeEventListener("keydown", onKey); } };
  window.addEventListener("keydown", onKey);

  return { close, q, el: wrap };
}
