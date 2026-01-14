const DB_NAME="charsheet_engine";
const DB_VER=1;

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains("rulesets")) db.createObjectStore("rulesets",{keyPath:"id"});
      if(!db.objectStoreNames.contains("characters")) db.createObjectStore("characters",{keyPath:"id"});
      if(!db.objectStoreNames.contains("settings")) db.createObjectStore("settings",{keyPath:"k"});
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Robust transaction runner:
// - catches synchronous DataError (e.g., missing keyPath field on put)
// - resolves/rejects based on the request if one is returned
async function run(store, mode, fn){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    let t;
    try{
      t = db.transaction(store, mode);
    }catch(err){
      reject(err);
      return;
    }

    const s = t.objectStore(store);

    let req;
    try{
      req = fn(s);
    }catch(err){
      try{ t.abort(); }catch(_){}
      reject(err);
      return;
    }

    if(req && typeof req === "object" && "onsuccess" in req && "onerror" in req){
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || t.error);
    }else{
      t.oncomplete = () => resolve(undefined);
    }

    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("IndexedDB transaction aborted"));
  });
}

export async function getAll(store){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const t = db.transaction(store,"readonly");
    const s = t.objectStore(store);
    const req = s.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function get(store,key){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const t = db.transaction(store,"readonly");
    const s = t.objectStore(store);
    const req = s.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store,obj){
  return run(store,"readwrite", s=>s.put(obj));
}

export async function del(store,key){
  return run(store,"readwrite", s=>s.delete(key));
}

export async function setSetting(k,v){
  return put("settings",{k,v});
}

export async function getSetting(k){
  const x = await get("settings",k);
  return x ? x.v : undefined;
}
