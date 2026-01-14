import { el, qs } from "../lib/utils.js";
import { icons } from "./icons.js";
import { go, current } from "./router.js";
import { state } from "../lib/state.js";

export function renderShell(contentNode){
  const path = current();
  const scrim = el("div", {class:"scrim", onclick: ()=>toggleSidebar(false)});
  const sidebar = el("aside", {class:"sidebar"}, [
    el("div", {class:"brand"}, [
      el("div", {html: icons.box}),
      el("div", {class:"vstack", style:"gap:2px"}, [
        el("div", {class:"title"}, "CharSheet Engine"),
        el("div", {class:"sub"}, "Local-only, DMCA-resistant, pretty enough.")
      ])
    ]),
    navLink("/home", icons.home, "Home"),
    navLink("/characters", icons.users, "Characters"),
    navLink("/sheet", icons.sheet, "Sheet"),
    navLink("/levelup", icons.bolt, "Level Up"),
    navLink("/rulesets", icons.box, "Rulesets"),
    navLink("/settings", icons.settings, "Settings"),
    el("div", {style:"margin-top:14px"}, [
      el("div", {class:"small"}, state.ruleset?.meta?.name ? `Ruleset: ${state.ruleset.meta.name}` : "No ruleset loaded"),
      el("div", {class:"small"}, state.character?.name ? `Character: ${state.character.name}` : "No character selected"),
    ])
  ]);

  const topbar = el("div", {class:"topbar"}, [
    el("button", {class:"btn ghost small", html: icons.menu, onclick: ()=>toggleSidebar(true)}),
    el("div", {style:"font-weight:800"}, titleFor(path)),
    el("div", {class:"spacer"}),
    el("span", {class:"badge"}, state.character?.level ? `Lvl ${state.character.level}` : "No char")
  ]);

  const main = el("main", {class:"content"}, contentNode);

  const shell = el("div", {class:"shell"}, [sidebar, main]);

  function toggleSidebar(open){
    if(window.innerWidth > 980) return;
    if(open){
      sidebar.classList.add("open");
      document.body.appendChild(scrim);
    }else{
      sidebar.classList.remove("open");
      scrim.remove();
    }
  }

  // Close sidebar on navigation (mobile)
  shell.addEventListener("click", (e)=>{
    const a = e.target.closest("a[data-nav]");
    if(a && window.innerWidth <= 980){
      toggleSidebar(false);
    }
  });

  return el("div", {}, [topbar, shell]);
}

function navLink(path, icon, label){
  const is = current() === path;
  return el("a", {
    href:"#"+path,
    "data-nav":"1",
    class: "nav-link " + (is ? "active" : "")
  , onclick:(e)=>{ e.preventDefault(); go(path); }}, [
    el("div", {class:"nav"}, []),
  ]);
}

// NOTE: We render nav links in sidebar differently (we want consistent styling)
function titleFor(path){
  const map = {
    "/home":"Home",
    "/characters":"Characters",
    "/sheet":"Sheet",
    "/levelup":"Level Up",
    "/rulesets":"Rulesets",
    "/settings":"Settings",
  };
  return map[path] || "CharSheet Engine";
}
