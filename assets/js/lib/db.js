const DB_NAME="charsheet_engine";
const DB_VER=1;

function openDB(){
  return new Promise((resolve, reject)=>{
    const req=indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains("rulesets")) db.createObjectStore("rulesets",{keyPath:"id"});
      if(!db.objectStoreNames.contains("characters")) db.createObjectStore("characters",{keyPath:"id"});
      if(!db.objectStoreNames.contains("settings")) db.createObjectStore("settings",{keyPath:"k"});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function run(store, mode, fn){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const t=db.transaction(store, mode);
    const s=t.objectStore(store);
    const out=fn(s);
    t.oncomplete=()=>resolve(out);
    t.onerror=()=>reject(t.error);
  });
}

export async function getAll(store){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const t=db.transaction(store,"readonly");
    const s=t.objectStore(store);
    const req=s.getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}
export async function get(store,key){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const t=db.transaction(store,"readonly");
    const s=t.objectStore(store);
    const req=s.get(key);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
export async function put(store,obj){ return run(store,"readwrite", s=>s.put(obj)); }
export async function del(store,key){ return run(store,"readwrite", s=>s.delete(key)); }

export async function setSetting(k,v){ return put("settings",{k,v}); }
export async function getSetting(k){ const x=await get("settings",k); return x?x.v:undefined; }
