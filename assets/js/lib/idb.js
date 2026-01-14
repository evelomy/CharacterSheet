const DB_NAME = "charsheet_db";
const DB_VERSION = 1;

const STORES = {
  rulesets: { keyPath: "id" },       // {id, meta, data, importedAt}
  characters:{ keyPath: "id" },      // {id, name, data, updatedAt, createdAt, rulesetId}
  portraits: { keyPath: "characterId" }, // {characterId, blob, type, updatedAt}
  settings:  { keyPath: "key" }      // {key, value}
};

function openDb(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const db = req.result;
      for(const [name, cfg] of Object.entries(STORES)){
        if(!db.objectStoreNames.contains(name)){
          db.createObjectStore(name, cfg);
        }
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}

async function withStore(storeName, mode, fn){
  const db = await openDb();
  return await new Promise((resolve, reject)=>{
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let out;
    Promise.resolve(fn(store)).then((v)=>{ out = v; }).catch(reject);
    tx.oncomplete = ()=> resolve(out);
    tx.onerror = ()=> reject(tx.error);
    tx.onabort = ()=> reject(tx.error);
  });
}

export const idb = {
  async put(store, value){
    return await withStore(store, "readwrite", (s)=> s.put(value));
  },
  async get(store, key){
    return await withStore(store, "readonly", (s)=> new Promise((res, rej)=>{
      const r = s.get(key);
      r.onsuccess = ()=> res(r.result ?? null);
      r.onerror = ()=> rej(r.error);
    }));
  },
  async del(store, key){
    return await withStore(store, "readwrite", (s)=> s.delete(key));
  },
  async getAll(store){
    return await withStore(store, "readonly", (s)=> new Promise((res, rej)=>{
      const r = s.getAll();
      r.onsuccess = ()=> res(r.result ?? []);
      r.onerror = ()=> rej(r.error);
    }));
  },
  async clear(store){
    return await withStore(store, "readwrite", (s)=> s.clear());
  }
};

export const stores = Object.keys(STORES);
