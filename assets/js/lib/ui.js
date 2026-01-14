export const qs=(sel,root=document)=>root.querySelector(sel);
export const qsa=(sel,root=document)=>Array.from(root.querySelectorAll(sel));

export function el(tag, props={}, children=[]){
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(props||{})){
    if(k==="class") n.className=v;
    else if(k==="html") n.innerHTML=v;
    else if(k==="style") n.setAttribute("style", v);
    else if(k.startsWith("on") && typeof v==="function") n.addEventListener(k.slice(2), v);
    else if(v!==null && v!==undefined) n.setAttribute(k, v);
  }
  for(const c of (children||[])){
    if(c===null || c===undefined) continue;
    if(typeof c==="string") n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  }
  return n;
}

export function field(label, input){
  return el("label", {class:"vstack", style:"gap:6px"}, [
    el("div", {class:"small"}, label),
    input
  ]);
}

export function toast(msg){
  const t=el("div",{style:"position:fixed;left:50%;bottom:18px;transform:translateX(-50%);padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.55);backdrop-filter: blur(8px);z-index:99999;font-weight:650"},[msg]);
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 2200);
}

export function modal(title, bodyNode, actions=[]){
  const back=el("div",{class:"modalBackdrop"});
  const wrap=el("div",{class:"modal"});
  const head=el("div",{class:"modalHeader"},[
    el("h3",{},[title]),
    el("button",{class:"btn ghost", onclick:()=>back.remove()},["Close"])
  ]);
  const foot=el("div",{class:"hstack", style:"justify-content:flex-end; margin-top:12px"}, actions);
  wrap.appendChild(head);
  wrap.appendChild(el("div",{style:"margin-top:10px"},[bodyNode]));
  wrap.appendChild(foot);
  back.appendChild(wrap);
  back.addEventListener("click",(e)=>{ if(e.target===back) back.remove(); });
  document.body.appendChild(back);
  return {back, wrap};
}
