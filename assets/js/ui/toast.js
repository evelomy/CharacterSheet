import { el, uid } from "../lib/utils.js";

let wrap;
function ensure(){
  if(!wrap){
    wrap = el("div", {class:"toast-wrap"});
    document.body.appendChild(wrap);
  }
}
export function toast(title, message, {timeout=3500}={}){
  ensure();
  const id = uid("t");
  const n = el("div", {class:"toast", "data-id":id}, [
    el("div", {class:"t"}, title),
    el("div", {class:"m"}, message)
  ]);
  wrap.appendChild(n);
  const kill = ()=>{ n.style.opacity="0"; n.style.transform="translateY(6px)"; setTimeout(()=>n.remove(), 180); };
  setTimeout(kill, timeout);
  n.addEventListener("click", kill);
}
