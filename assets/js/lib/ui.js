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
    renderFeatures();
    renderSaves();
    renderSkills();

    // autosave hooks
    const hookAutosave = (idOrEl) => $("#"+idOrEl).addEventListener("input", async () => {
      this._updateCharFromForm(c);
      await this._autosave(c, id);
      renderSaves();
      renderSkills();
    });

    ["name","ac","speed","hpCurrent","hpMax","tempHp","notes"].forEach(hookAutosave);
$("#ruleset").addEventListener("change", async () => {
      c.rulesetId = $("#ruleset").value || "";
      c.classId = "";
      await this._autosave(c, id, true);
      location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
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
      await this._autosave(c, id, true);
      location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
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
      await this._autosave(c, id, true);
      location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
    });

    $("#btnTempClear").addEventListener("click", async () => {
      c.tempHp = 0;
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
    });

    // level-up wizard
    $("#btnLevelUp").addEventListener("click", async () => {
      if(!c.rulesetId) return alert("Select a ruleset first.");
      const rs = await this.db.getRuleset(c.rulesetId);
      if(!rs) return alert("Ruleset missing. Re-import it.");
      if(!c.classId) return alert("Select a class.");
      const targetLevel = clampInt($("#level").value, 1, 20);
      const currentLevel = clampInt(c.level, 1, 20);

      if(targetLevel <= currentLevel){
        c.level = targetLevel;
        await this._autosave(c, id, true);
        renderSaves(); renderSkills();
        return;
      }

      for(let lvl=currentLevel; lvl<targetLevel; lvl++){
        const next = lvl + 1;
        const node = this.engine.getProgression(rs, c.classId, next);
        if (!node) {
          // Loud failure: tell us exactly what the ruleset contains
          const cls = this.engine.getClass ? this.engine.getClass(rs, c.classId) : (rs?.raw?.classes?.[c.classId] || null);
          const keys = cls && cls.progression ? Object.keys(cls.progression).sort((a,b)=>Number(a)-Number(b)) : [];
          alert(
            `No progression found for class "${c.classId}" at level ${next}.\n` +
            `Ruleset: ${rs.name || rs.id}\n` +
            `Progression levels available: ${keys.length ? keys.join(", ") : "(none)"}`
          );
          return;
        }
        const choices = Array.isArray(node?.choices) ? node.choices : [];
        const selections = {};

        for(const ch of choices){
          const opts = this.engine.getChoiceOptions(rs, c.classId, ch, next);
          const picked = await this._choiceWizard(ch, opts, next);
          if(picked == null) { alert("Level-up cancelled."); return; }
          selections[ch.id] = picked;
        }

        const updated = this.engine.applyProgressionNodeToCharacter(c, rs, c.classId, next, selections);
        Object.assign(c, updated);
        await this._autosave(c, id, true);
      }

      c.level = targetLevel;
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
