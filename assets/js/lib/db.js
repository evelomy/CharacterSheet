cd ~/Documents/"CHARACTER REPO"/charsheet-engine && \
cat > assets/js/lib/db.js <<'JS'
const DB_NAME="charsheet_engine";
// Bump this whenever schema changes. This forces onupgradeneeded to run.
const DB_VER=2;

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = () => {
      const db = req.result;

      // Hard reset stores to avoid keyPath mismatches from older versions.
      // Yes this wipes local data. The app is currently broken anyway.
      for(const name of ["rulesets","characters","settings"]){
        if(db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
      }

      db.createObjectStore("rulesets",{keyPath:"id"});
      db.createObjectStore("characters",{keyPath:"id"});
      db.createObjectStore("settings",{keyPath:"k"});
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab/device view. Close other tabs and retry."));
  });
}

// Robust transaction runner: catches sync DataError thrown by put/delete
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
JS
