import { el } from "../lib/utils.js";
import { icons } from "./icons.js";

export function modal({title="Modal", body=null, footer=null, onClose=null}={}){
  const wrap = el("div", {class:"modal-wrap"});
  const box = el("div", {class:"modal"});
  const head = el("header", {}, [
    el("div", {html: icons.box}),
    el("h3", {}, title),
    el("div", {class:"spacer"}),
    el("button", {class:"btn ghost small", title:"Close", html: icons.x, onclick: ()=>close()})
  ]);
  const bodyEl = el("div", {class:"body"});
  if(typeof body === "string") bodyEl.innerHTML = body;
  else if(body) bodyEl.appendChild(body);

  const foot = el("footer", {});
  if(footer) foot.appendChild(footer);

  box.appendChild(head);
  box.appendChild(bodyEl);
  box.appendChild(foot);
  wrap.appendChild(box);

  function close(){
    wrap.remove();
    if(onClose) onClose();
  }
  wrap.addEventListener("click", (e)=>{ if(e.target === wrap) close(); });
  document.body.appendChild(wrap);
  return { close, bodyEl, foot, head, wrap, box };
}
