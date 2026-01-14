// Robust IndexedDB wrapper designed to NOT crash-loop.
// If schema drift or upgrade problems are detected, we wipe the DB and reopen.
// Data loss is allowed per your requirements.

const DB_NAME = "charsheet_db";
const DB_VER = 3; // bump to force onupgradeneeded

const STORES = {
  meta: "meta",
  rulesets: "rulesets",
  characters: "characters",
};

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    tx.onerror = () => reject(tx.error || new Error("Transaction error"));
  });
}

function nowIso() {
  return new Date().toISOString();
}

export class DB {
  static async open({ onStatus } = {}) {
    const status = (m) => onStatus?.(m);

    // Retry open once after a nuke, for cases where IDB gets weird on iOS.
    try {
      status("Opening IndexedDB…");
      return await DB._openOnce(status);
    } catch (e) {
      console.warn("DB open failed, attempting nuke+reopen:", e);
      status("DB open failed. Resetting local DB…");
      await DB.nuke();
      status("Reopening IndexedDB…");
      return await DB._openOnce(status);
    }
  }

  static async _openOnce(status) {
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const oldVersion = ev.oldVersion || 0;
      status?.(`Upgrading DB ${oldVersion} → ${DB_VER}…`);

      // Create stores if missing
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.rulesets)) {
        db.createObjectStore(STORES.rulesets, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.characters)) {
        db.createObjectStore(STORES.characters, { keyPath: "id" });
      }

      // You can add indexes here later if you need them.
      // Keep upgrades simple or iOS Safari will punish you.
    };

    const db = await reqToPromise(req);
    db.onversionchange = () => {
      // Another tab upgraded. Close to avoid weirdness.
      try { db.close(); } catch (_) {}
    };

    const api = new DB(db);
    await api._ensureMeta();
    return api;
  }

  static async nuke() {
    // Close attempts don’t always matter, but we do what we can.
    await new Promise((resolve, reject) => {
      const del = indexedDB.deleteDatabase(DB_NAME);
      del.onsuccess = () => resolve();
      del.onerror = () => reject(del.error || new Error("deleteDatabase failed"));
      del.onblocked = () => resolve(); // shrug. Safari gonna Safari.
    });
  }

  constructor(idb) {
    this.idb = idb;
  }

  _tx(storeName, mode = "readonly") {
    const tx = this.idb.transaction(storeName, mode);
    return { tx, store: tx.objectStore(storeName) };
  }

  async _ensureMeta() {
    // Used to prove DB is alive and store schema info.
    const existing = await this.getMeta("schema");
    if (!existing) {
      await this.putMeta("schema", { ver: DB_VER, createdAt: nowIso() });
    } else if (existing?.ver !== DB_VER) {
      // This can happen if something went sideways in Safari.
      // We choose violence (wipe) rather than crash loops.
      throw new Error(`Schema mismatch meta.ver=${existing?.ver} DB_VER=${DB_VER}`);
    }
  }

  // ---- Meta
  async getMeta(key) {
    const { tx, store } = this._tx(STORES.meta, "readonly");
    const val = await reqToPromise(store.get(key));
    await txDone(tx);
    return val?.value ?? null;
  }

  async putMeta(key, value) {
    const { tx, store } = this._tx(STORES.meta, "readwrite");
    await reqToPromise(store.put({ key, value }));
    await txDone(tx);
  }

  // ---- Rulesets
  async listRulesets() {
    const { tx, store } = this._tx(STORES.rulesets, "readonly");
    const all = await reqToPromise(store.getAll());
    await txDone(tx);
    return all || [];
  }

  async getRuleset(id) {
    const { tx, store } = this._tx(STORES.rulesets, "readonly");
    const r = await reqToPromise(store.get(id));
    await txDone(tx);
    return r || null;
  }

  async putRuleset(ruleset) {
    return this._safeWrite(STORES.rulesets, (store) => store.put(ruleset));
  }

  async deleteRuleset(id) {
    return this._safeWrite(STORES.rulesets, (store) => store.delete(id));
  }

  // ---- Characters
  async listCharacters() {
    const { tx, store } = this._tx(STORES.characters, "readonly");
    const all = await reqToPromise(store.getAll());
    await txDone(tx);
    // newest first
    return (all || []).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  async getCharacter(id) {
    const { tx, store } = this._tx(STORES.characters, "readonly");
    const c = await reqToPromise(store.get(id));
    await txDone(tx);
    return c || null;
  }

  async putCharacter(char) {
    return this._safeWrite(STORES.characters, (store) => store.put(char));
  }

  async deleteCharacter(id) {
    return this._safeWrite(STORES.characters, (store) => store.delete(id));
  }

  // ---- Safe write: retries + graceful failure
  async _safeWrite(storeName, opFn) {
    // iOS can throw InvalidStateError / TransactionInactiveError if it’s having a day.
    const attempts = 2;
    let lastErr = null;

    for (let i = 0; i < attempts; i++) {
      try {
        const { tx, store } = this._tx(storeName, "readwrite");
        const req = opFn(store);
        await reqToPromise(req);
        await txDone(tx);
        return;
      } catch (e) {
        lastErr = e;
        console.warn(`DB write failed (attempt ${i + 1}/${attempts})`, e);
        // tiny delay to let Safari breathe
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    // If writes keep failing, it’s safer to nuke than to crash-loop forever.
    throw new Error(`DB write failed permanently: ${String(lastErr?.message || lastErr)}`);
  }
}

export { DB_NAME, DB_VER };
