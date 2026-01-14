export class UI {
  constructor({ db, engine, onStatus }) {
    this.db = db;
    this.engine = engine;
    this.onStatus = onStatus || (() => {});
    this.app = document.getElementById("app");
  }

  async render(route) {
    if (route.path === "/" || route.path === "") {
      return this.renderHome();
    }

    if (route.path === "/sheet") {
      const id = route.query.id;
      if (!id) return this.renderHome("Missing character id.");
      return this.renderSheet(id);
    }

    this.app.innerHTML = `
      <div class="card error">
        <h2>Not found</h2>
        <p class="muted">Route <code>${escapeHtml(route.path)}</code> doesn’t exist. Like my faith in browsers.</p>
      </div>
    `;
  }

  async renderHome(msg = null) {
    const chars = await this.db.listCharacters();
    const rulesets = await this.db.listRulesets();

    this.app.innerHTML = `
      ${msg ? `<div class="card error"><p>${escapeHtml(msg)}</p></div>` : ""}

      <div class="grid two">
        <div class="card">
          <div class="row between">
            <h2>Characters</h2>
            <button id="btnNewChar" class="btn primary" type="button">New</button>
          </div>

          <div class="hr"></div>

          <div id="charList" class="grid" style="gap:10px">
            ${chars.length ? chars.map(c => this._charRowHtml(c)).join("") : `
              <div class="muted">No characters yet. Go on, create one. Live a little.</div>
            `}
          </div>
        </div>

        <div class="card">
          <div class="row between">
            <h2>Rulesets</h2>
            <button id="btnImportRules" class="btn" type="button">Import JSON</button>
          </div>
          <p class="muted">Stored on this device only (IndexedDB). No sync. No cloud. No nonsense.</p>

          <div class="hr"></div>

          <div id="rulesetList" class="grid" style="gap:10px">
            ${rulesets.length ? rulesets.map(r => `
              <div class="char-item">
                <div>
                  <div class="char-name">${escapeHtml(r.name || "Unnamed Ruleset")}</div>
                  <div class="small">id: <code>${escapeHtml(r.id)}</code> • v${escapeHtml(String(r.version || ""))}</div>
                </div>
                <div class="row" style="justify-content:flex-end">
                  <button class="btn danger" data-del-rules="${escapeHtml(r.id)}" type="button">Delete</button>
                </div>
              </div>
            `).join("") : `<div class="muted">No rulesets imported. Default flow still works, but level-up prompts will be empty.</div>`}
          </div>
        </div>
      </div>
    `;

    // Character row actions
    this.app.querySelectorAll("[data-open]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-open");
        location.hash = `#/sheet?id=${encodeURIComponent(id)}`;
      });
    });

    this.app.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del");
        await this.db.deleteCharacter(id);
        await this.renderHome("Deleted.");
      });
    });

    // Ruleset delete
    this.app.querySelectorAll("[data-del-rules]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del-rules");
        await this.db.deleteRuleset(id);
        await this.renderHome("Ruleset deleted.");
      });
    });

    // Create character
    document.getElementById("btnNewChar").addEventListener("click", () => this._openNewCharModal(rulesets));
    document.getElementById("btnImportRules").addEventListener("click", () => this._openImportRulesModal());
  }

  _charRowHtml(c) {
    const lvl = c.level ?? 1;
    const rs = c.rulesetId ? `ruleset: ${c.rulesetId}` : "no ruleset";
    return `
      <div class="char-item">
        <div>
          <div class="char-name">${escapeHtml(c.name || "Unnamed Character")}</div>
          <div class="small">Level ${escapeHtml(String(lvl))} • ${escapeHtml(rs)} • updated ${escapeHtml((c.updatedAt || "").slice(0,19).replace("T"," "))}</div>
        </div>
        <div class="row" style="justify-content:flex-end">
          <button class="btn" data-open="${escapeHtml(c.id)}" type="button">Open</button>
          <button class="btn danger" data-del="${escapeHtml(c.id)}" type="button">Delete</button>
        </div>
      </div>
    `;
  }

  async renderSheet(id) {
    const raw = await this.db.getCharacter(id);
    if (!raw) return this.renderHome("Character not found.");

    const c = this.engine.validateCharacter(raw);
    const rulesets = await this.db.listRulesets();
    const ruleset = c.rulesetId ? await this.db.getRuleset(c.rulesetId) : null;

    const portraitUrl = c.portrait?.dataUrl || null;

    this.app.innerHTML = `
      <div class="grid two">
        <div class="card">
          <div class="row between">
            <h2>Sheet</h2>
            <div class="row">
              <span class="pill">id: <code>${escapeHtml(c.id)}</code></span>
              <button id="btnSave" class="btn primary" type="button">Save</button>
            </div>
          </div>

          <div class="hr"></div>

          <div class="kv">
            <div><label>Name</label></div>
            <div><input id="name" class="input" value="${escapeAttr(c.name)}" /></div>

            <div><label>Ruleset</label></div>
            <div>
              <select id="ruleset" class="input">
                <option value="">(none)</option>
                ${rulesets.map(r => `
                  <option value="${escapeAttr(r.id)}" ${r.id === c.rulesetId ? "selected" : ""}>
                    ${escapeHtml(r.name || r.id)}
                  </option>
                `).join("")}
              </select>
            </div>

            <div><label>Level</label></div>
            <div class="row" style="width:100%">
              <input id="level" class="input" type="number" min="1" value="${escapeAttr(String(c.level || 1))}" style="max-width:120px" />
              <button id="btnLevelUp" class="btn" type="button">Run level-up</button>
              <span class="small muted">${ruleset ? `Using: ${escapeHtml(ruleset.name)}` : "No ruleset selected."}</span>
            </div>

            <div><label>AC</label></div>
            <div><input id="ac" class="input" type="number" value="${escapeAttr(String(c.ac ?? 10))}" /></div>

            <div><label>Speed</label></div>
            <div><input id="speed" class="input" type="number" value="${escapeAttr(String(c.speed ?? 30))}" /></div>
          </div>

          <div class="hr"></div>

          <h3>HP</h3>
          <div class="row">
            <div class="row" style="flex:1; min-width:240px">
              <span class="pill">Current</span>
              <input id="hpCurrent" class="input" type="number" value="${escapeAttr(String(c.hp.current ?? 10))}" style="max-width:120px" />
              <span class="pill">Max</span>
              <input id="hpMax" class="input" type="number" value="${escapeAttr(String(c.hp.max ?? 10))}" style="max-width:120px" />
            </div>
            <button id="btnHeal" class="btn" type="button">+ Heal</button>
            <button id="btnDmg" class="btn danger" type="button">- Damage</button>
          </div>

          <div class="hr"></div>

          <h3>Temp HP</h3>
          <div class="row">
            <input id="tempHp" class="input" type="number" value="${escapeAttr(String(c.tempHp ?? 0))}" style="max-width:140px" />
            <button id="btnTempClear" class="btn" type="button">Clear</button>
          </div>

          <div class="hr"></div>

          <h3>Portrait</h3>
          <div class="row">
            <div class="portrait">
              ${portraitUrl ? `<img alt="portrait" src="${escapeAttr(portraitUrl)}" />` : `<span class="muted">No image</span>`}
            </div>
            <div style="flex:1; min-width:240px">
              <label>Upload image</label>
              <input id="portraitFile" class="input" type="file" accept="image/*" />
              <div class="small muted" style="margin-top:8px">Stored locally (IndexedDB via data URL). Works on iPad.</div>
              <div class="row" style="margin-top:10px">
                <button id="btnPortraitClear" class="btn danger" type="button">Remove portrait</button>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <h2>Abilities</h2>
          <div class="grid three">
            ${["STR","DEX","CON","INT","WIS","CHA"].map(a => `
              <div>
                <label>${a}</label>
                <input class="input ability" data-ability="${a}" type="number" value="${escapeAttr(String(c.abilities?.[a] ?? 10))}" />
              </div>
            `).join("")}
          </div>

          <div class="hr"></div>

          <div class="row between">
            <h2>Inventory</h2>
            <button id="btnAddItem" class="btn" type="button">Add</button>
          </div>
          <div id="invList" class="grid" style="gap:10px">
            ${c.inventory.length ? c.inventory.map((it, idx) => `
              <div class="char-item">
                <div>
                  <div class="char-name">${escapeHtml(it.name || "Item")}</div>
                  <div class="small">qty: ${escapeHtml(String(it.qty ?? 1))}</div>
                </div>
                <div class="row" style="justify-content:flex-end">
                  <button class="btn danger" data-inv-del="${idx}" type="button">Remove</button>
                </div>
              </div>
            `).join("") : `<div class="muted">No items. Your character is extremely prepared for modern life.</div>`}
          </div>

          <div class="hr"></div>

          <h2>Notes</h2>
          <textarea id="notes" class="input">${escapeHtml(c.notes || "")}</textarea>
        </div>
      </div>
    `;

    // Wire actions
    const readCharFromForm = () => {
      const copy = this.engine.validateCharacter(c);
      copy.name = val("name");
      copy.rulesetId = val("ruleset") || null;
      copy.level = num("level", 1);
      copy.ac = num("ac", 10);
      copy.speed = num("speed", 30);

      copy.hp = { current: num("hpCurrent", 10), max: num("hpMax", 10) };
      copy.tempHp = num("tempHp", 0);

      copy.abilities = { ...copy.abilities };
      document.querySelectorAll(".ability").forEach(inp => {
        const k = inp.getAttribute("data-ability");
        copy.abilities[k] = toInt(inp.value, 10);
      });

      copy.notes = document.getElementById("notes").value || "";

      copy.updatedAt = new Date().toISOString();
      return copy;
    };

    const save = async (newChar) => {
      this.onStatus("Saving…");
      await this.db.putCharacter(newChar);
      this.onStatus("Saved.");
    };

    document.getElementById("btnSave").addEventListener("click", async () => {
      const updated = readCharFromForm();
      await save(updated);
    });

    document.getElementById("btnHeal").addEventListener("click", async () => {
      const amt = prompt("Heal amount?", "1");
      if (amt == null) return;
      const updated = readCharFromForm();
      updated.hp.current = clamp(updated.hp.current + toInt(amt, 0), 0, updated.hp.max);
      await save(updated);
      await this.renderSheet(id);
    });

    document.getElementById("btnDmg").addEventListener("click", async () => {
      const amt = prompt("Damage amount?", "1");
      if (amt == null) return;
      const updated = readCharFromForm();
      const dmg = toInt(amt, 0);

      // Temp HP absorbs first
      const temp = Math.max(0, updated.tempHp || 0);
      const useTemp = Math.min(temp, dmg);
      updated.tempHp = temp - useTemp;
      const remaining = dmg - useTemp;

      updated.hp.current = clamp(updated.hp.current - remaining, 0, updated.hp.max);
      await save(updated);
      await this.renderSheet(id);
    });

    document.getElementById("btnTempClear").addEventListener("click", async () => {
      const updated = readCharFromForm();
      updated.tempHp = 0;
      await save(updated);
      await this.renderSheet(id);
    });

    document.getElementById("btnAddItem").addEventListener("click", async () => {
      const name = prompt("Item name?", "Rations");
      if (!name) return;
      const qty = prompt("Qty?", "1");
      const updated = readCharFromForm();
      updated.inventory.push({ name, qty: toInt(qty, 1) });
      await save(updated);
      await this.renderSheet(id);
    });

    this.app.querySelectorAll("[data-inv-del]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.getAttribute("data-inv-del"));
        const updated = readCharFromForm();
        updated.inventory.splice(idx, 1);
        await save(updated);
        await this.renderSheet(id);
      });
    });

    document.getElementById("portraitFile").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const updated = readCharFromForm();
      updated.portrait = { mime: f.type || "image/*", dataUrl: await fileToDataUrl(f) };
      await save(updated);
      await this.renderSheet(id);
    });

    document.getElementById("btnPortraitClear").addEventListener("click", async () => {
      const updated = readCharFromForm();
      updated.portrait = null;
      await save(updated);
      await this.renderSheet(id);
    });

    document.getElementById("btnLevelUp").addEventListener("click", async () => {
      const updated = readCharFromForm();
      const rulesetId = updated.rulesetId;
      if (!rulesetId) {
        alert("No ruleset selected. Import one and select it first.");
        return;
      }
      const rs = await this.db.getRuleset(rulesetId);
      if (!rs) {
        alert("Ruleset missing. Re-import it.");
        return;
      }

      const lvl = Number(updated.level || 1);
      const choices = this.engine.getLevelChoices(rs, lvl);

      if (!choices.length) {
        alert(`No level-up choices defined for level ${lvl} in this ruleset.`);
        return;
      }

      const selections = await this._runLevelUpModal(rs, lvl, choices);
      if (!selections) return; // cancelled
      const next = this.engine.applyLevelUp(updated, lvl, selections);
      await save(next);
      await this.renderSheet(id);
    });

    function val(id) { return document.getElementById(id).value; }
    function num(id, d) { return toInt(val(id), d); }
  }

  async _openNewCharModal(rulesets) {
    const modal = this._modal(`
      <h2>New Character</h2>
      <div class="hr"></div>
      <div class="kv">
        <div><label>Name</label></div>
        <div><input id="m_name" class="input" value="New Character" /></div>

        <div><label>Ruleset</label></div>
        <div>
          <select id="m_ruleset" class="input">
            <option value="">(none)</option>
            ${rulesets.map(r => `<option value="${escapeAttr(r.id)}">${escapeHtml(r.name || r.id)}</option>`).join("")}
          </select>
        </div>

        <div><label>Level</label></div>
        <div><input id="m_level" class="input" type="number" min="1" value="1" /></div>
      </div>

      <div class="hr"></div>
      <div class="row" style="justify-content:flex-end">
        <button id="m_cancel" class="btn ghost" type="button">Cancel</button>
        <button id="m_create" class="btn primary" type="button">Create</button>
      </div>
    `);

    modal.querySelector("#m_cancel").addEventListener("click", () => modal.close());
    modal.querySelector("#m_create").addEventListener("click", async () => {
      const name = modal.querySelector("#m_name").value || "Unnamed Character";
      const rulesetId = modal.querySelector("#m_ruleset").value || null;
      const level = toInt(modal.querySelector("#m_level").value, 1);

      const char = this.engine.validateCharacter({
        name,
        rulesetId,
        level,
      });

      await this.db.putCharacter(char);
      modal.close();
      location.hash = `#/sheet?id=${encodeURIComponent(char.id)}`;
    });
  }

  async _openImportRulesModal() {
    const modal = this._modal(`
      <h2>Import Ruleset JSON</h2>
      <p class="muted">Paste JSON or upload a file. Stored locally on this device.</p>
      <div class="hr"></div>

      <label>Upload JSON file</label>
      <input id="r_file" class="input" type="file" accept="application/json,.json" />

      <div class="hr"></div>

      <label>Or paste JSON</label>
      <textarea id="r_text" class="input" placeholder='{"id":"myRules","name":"Homebrew", "progression":{...}}'></textarea>

      <div class="hr"></div>
      <div class="row" style="justify-content:flex-end">
        <button id="r_cancel" class="btn ghost" type="button">Cancel</button>
        <button id="r_import" class="btn primary" type="button">Import</button>
      </div>
    `);

    const fileEl = modal.querySelector("#r_file");
    const textEl = modal.querySelector("#r_text");

    fileEl.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      textEl.value = await f.text();
    });

    modal.querySelector("#r_cancel").addEventListener("click", () => modal.close());
    modal.querySelector("#r_import").addEventListener("click", async () => {
      try {
        const text = textEl.value.trim();
        if (!text) throw new Error("No JSON provided.");
        await this.engine.importRulesetFromJsonText(text);
        modal.close();
        await this.renderHome("Ruleset imported.");
      } catch (e) {
        alert(e.message || String(e));
      }
    });
  }

  async _runLevelUpModal(ruleset, level, choices) {
    // choices: [{ key, label, type:"pickOne", pool:"feats" OR options:[...] }]
    const content = `
      <h2>Level ${escapeHtml(String(level))} choices</h2>
      <p class="muted">${escapeHtml(ruleset.name || "Ruleset")} • define these in ruleset.progression["${level}"].choices</p>
      <div class="hr"></div>
      <div class="grid" style="gap:12px">
        ${choices.map((ch, idx) => {
          const key = ch.key || `choice_${idx}`;
          const label = ch.label || key;
          const opts = Array.isArray(ch.options) ? ch.options
                    : (ch.pool ? this.engine.resolvePool(ruleset, ch.pool) : []);
          return `
            <div class="card" style="background:rgba(255,255,255,.02)">
              <div class="row between">
                <div>
                  <div style="font-weight:750">${escapeHtml(label)}</div>
                  <div class="small muted">key: <code>${escapeHtml(key)}</code> ${ch.pool ? `• pool: <code>${escapeHtml(ch.pool)}</code>` : ""}</div>
                </div>
              </div>
              <div class="hr"></div>
              <select class="input" data-choice-key="${escapeAttr(key)}">
                <option value="">(choose)</option>
                ${opts.map(o => {
                  const v = typeof o === "string" ? o : (o?.id || o?.name || JSON.stringify(o));
                  const t = typeof o === "string" ? o : (o?.name || o?.label || o?.id || v);
                  return `<option value="${escapeAttr(v)}">${escapeHtml(t)}</option>`;
                }).join("")}
              </select>
            </div>
          `;
        }).join("")}
      </div>

      <div class="hr"></div>
      <div class="row" style="justify-content:flex-end">
        <button id="lu_cancel" class="btn ghost" type="button">Cancel</button>
        <button id="lu_ok" class="btn primary" type="button">Apply</button>
      </div>
    `;

    const modal = this._modal(content);

    return await new Promise((resolve) => {
      modal.querySelector("#lu_cancel").addEventListener("click", () => {
        modal.close();
        resolve(null);
      });
      modal.querySelector("#lu_ok").addEventListener("click", () => {
        const selections = {};
        let missing = [];
        modal.querySelectorAll("[data-choice-key]").forEach(sel => {
          const k = sel.getAttribute("data-choice-key");
          const v = sel.value;
          if (!v) missing.push(k);
          selections[k] = v || null;
        });

        if (missing.length) {
          alert("Missing selections: " + missing.join(", "));
          return;
        }

        modal.close();
        resolve(selections);
      });
    });
  }

  _modal(innerHtml) {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.innerHTML = `<div class="modal">${innerHtml}</div>`;
    document.body.appendChild(wrap);

    const close = () => {
      wrap.remove();
    };

    // click outside to close
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) close();
    });

    // escape to close
    const onKey = (e) => {
      if (e.key === "Escape") {
        close();
        window.removeEventListener("keydown", onKey);
      }
    };
    window.addEventListener("keydown", onKey);

    return { close, querySelector: (...args) => wrap.querySelector(...args), el: wrap };
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  })[c]);
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

function toInt(v, d) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : d;
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Failed to read image."));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });
}
