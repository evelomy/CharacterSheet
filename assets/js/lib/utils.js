export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

export function el(tag, attrs={}, children=[]){
  const n = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(k === "class") n.className = v;
    else if(k === "html") n.innerHTML = v;
    else if(k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if(v !== undefined && v !== null) n.setAttribute(k, String(v));
  }
  for(const c of (Array.isArray(children)? children:[children])){
    if(c === null || c === undefined) continue;
    if(typeof c === "string") n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  }
  return n;
}

export function uid(prefix="id"){
  return prefix + "_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

export function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

export function initials(name=""){
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return "?";
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length>1 ? parts[parts.length-1][0] : "";
  return (a+b).toUpperCase();
}

export function fmtTime(ts){
  try{
    const d = new Date(ts);
    return d.toLocaleString(undefined, {year:"numeric", month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit"});
  }catch{ return ""; }
}

export function downloadJson(filename, obj){
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}

export async function readFileAsText(file){
  return await file.text();
}
export async function readFileAsJson(file){
  const txt = await readFileAsText(file);
  return JSON.parse(txt);
}
