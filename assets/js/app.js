import { register, start, go, setRouteCallback } from "./ui/router.js";
import { el, qs } from "./lib/utils.js";
import { icons } from "./ui/icons.js";
import { toast } from "./ui/toast.js";
import { modal } from "./ui/modal.js";
import { idb } from "./lib/idb.js";
import { state, loadSettings, refreshRulesets, refreshCharacters, setActiveCharacter, setActiveRuleset } from "./lib/state.js";
import { validateRuleset, listClasses } from "./lib/ruleset.js";
import { deriveCharacter, buildLevelUpPlan, listOptionsForChoice, applyLevelUp } from "./lib/engine.js";

/* --- Helpers --- */

function navItem(path, icon, label){
  const a = el("a", {href:"#"+path, "data-nav":"1"}, [
    el("div", {html: icon}),
    el("div", {}, label),
  ]);
  a.addEventListener("click", (e)=>{ e.preventDefault(); go(path); });
  return a;
}

function labelForClass(rs, classId){
  return rs?.classes?.[classId]?.name || classId || "Unknown Class";
}

function initialsNode(name){
  return el("div", {}, (name||"?").split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join("").toUpperCase() || "?");
}

function field(label, inputNode){
  return el("div", {class:"field"}, [
    el("label", {}, label),
    inputNode
  ]);
}

function classSelect(classes, id, value=null){
  const s = el("select", {class:"select", id});
  for(const c of classes){
    const o = el("option", {value:c.id}, c.name || c.id);
    if(value && value === c.id) o.selected = true;
    s.appendChild(o);
  }
  return s;
}

function abilityMod(score){
  const s = parseInt(score,10) || 10;
  return Math.floor((s - 10)/2);
}

function safeName(n){
  return (n||"character").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,64) || "character";
}

/* --- Layout --- */

function shell(contentNode){
  const path = location.hash.replace(/^#/, "") || "/home";
  const sidebar = el("aside", {class:"sidebar"}, [
    el("div", {class:"brand"}, [
      el("div", {html: icons.box}),
      el("div", {class:"vstack", style:"gap:2px"}, [
        el("div", {class:"title"}, "CharSheet Engine"),
        el("div", {class:"sub"}, "Local-only. Pretty. No cloud.")
      ])
    ]),
    el("div", {class:"nav"}, [
      navItem("/home", icons.home, "Home"),
      navItem("/characters", icons.users, "Characters"),
      navItem("/sheet", icons.sheet, "Sheet"),
      navItem("/levelup", icons.bolt, "Level Up"),
      navItem("/rulesets", icons.box, "Rulesets"),
      navItem("/settings", icons.settings, "Settings"),
    ])
  ]);

  sidebar.querySelectorAll("a[data-nav]").forEach(a=>{
    if(a.getAttribute("href")?.replace(/^#/, "") === path) a.classList.add("active");
  });

  const scrim = el("div", {class:"scrim"});
  const topbar = el("div", {class:"topbar"}, [
    el("button", {class:"btn ghost small", html: icons.menu, onclick: ()=>openSidebar(true)}),
    el("div", {style:"font-weight:800"}, titleFor(path)),
    el("div", {class:"spacer"}),
    el("span", {class:"badge"}, state.character?.level ? `Lvl ${state.character.level}` : "No char"),
  ]);

  function openSidebar(open){
    if(window.innerWidth > 980) return;
    if(open){
      sidebar.classList.add("open");
      scrim.addEventListener("click", ()=>openSidebar(false), {once:true});
      document.body.appendChild(scrim);
    }else{ sidebar.classList.remove("open"); scrim.remove(); }
  }

  const layout = el("div", {}, [
    topbar,
    el("div", {class:"shell"}, [sidebar, el("main", {class:"content"}, contentNode)])
  ]);

  return layout;
}

function titleFor(path){
  const titles = {"/home":"Home","/characters":"Characters","/sheet":"Sheet","/levelup":"Level Up","/rulesets":"Rulesets","/settings":"Settings"};
  return titles[path] || "CharSheet Engine";
}

function pageTitle(h, p, actions=[]){
  return el("div", {class:"page-title"}, [
    el("div", {}, [el("h1", {}, h), p ? el("p", {}, p) : null]),
    el("div", {class:"hstack", style:"flex-wrap:wrap; justify-content:flex-end"}, actions)
  ]);
}

/* --- Data Logic --- */

async function init(){
  await loadSettings();
  await refreshRulesets();
  await refreshCharacters();

  if(!state.rulesets.length){
    try {
      const demo = await fetch("./data/ruleset.template.json").then(r=>r.json());
      await idb.put("rulesets", {id: demo.meta.id, meta: demo.meta, data: demo, importedAt: Date.now()});
      await setActiveRuleset(demo.meta.id);
      await refreshRulesets();
    } catch(e) { console.warn("No template ruleset found."); }
  }
}

function makeNewCharacter({name, classId, level=1}){
  return {
    id: crypto.randomUUID?.() || ("ch_"+Math.random().toString(16).slice(2)),
    name, classId, level,
    abilities: {str:10,dex:10,con:10,int:10,wis:10,cha:10},
    choices: {}, notes: "", createdAt: Date.now(), updatedAt: Date.now()
  };
}

async function saveCharacter(ch, {setActive=false}={}){
  const rec = { id: ch.id, name: ch.name, data: ch, updatedAt: Date.now(), rulesetId: state.rulesetId };
  await idb.put("characters", rec);
  if(setActive){ await setActiveCharacter(ch.id); }
}

async function loadPortrait(characterId){
  const p = await idb.get("portraits", characterId);
  return p?.blob ? URL.createObjectURL(p.blob) : null;
}

/* --- Pages --- */

async function Home(){
  const rs = state.ruleset;
  const ch = state.character;
  const derived = (rs && ch) ? deriveCharacter(rs, ch).derived : null;

  const actions = [
    el("button", {class:"btn primary", html: icons.sheet, onclick: ()=>go("/sheet")}, ["Sheet"]),
    el("button", {class:"btn", html: icons.users, onclick: ()=>go("/characters")}, ["Switch"])
  ];

  const hero = el("div", {class:"card"}, [
    el("div", {class:"grid cols2"}, [
      el("div", {}, [
        el("div", {class:"small"}, "Active Character"),
        el("div", {style:"font-size:22px;font-weight:900"}, ch?.name || "None"),
        el("div", {class:"small"}, `${labelForClass(rs, ch?.classId)} • Lvl ${ch?.level || "-"}`),
        el("div", {class:"small"}, `Ruleset: ${rs?.meta?.name || "None"}`)
      ]),
      el("div", {class:"grid cols2"}, [
        el("button", {class:"btn block", html: icons.download, onclick: ()=>exportCharacter(ch)}, ["Export"]),
        el("button", {class:"btn block danger", html: icons.trash, onclick: ()=>nukeAll()}, ["Reset All"])
      ])
    ])
  ]);

  return shell(el("div", {}, [pageTitle("Home", "Local character manager.", actions), hero]));
}

async function Characters(){
  const cont = el("div", {}, [pageTitle("Characters", "Manage your roster.", [
    el("button", {class:"btn primary", html: icons.plus, onclick: ()=>createCharacterModal()}, ["New"])
  ])]);

  const list = el("div", {class:"grid"}, []);
  for(const rec of state.characters){
    const ch = rec.data;
    const avatar = el("div", {class:"avatar"}, [initialsNode(ch.name)]);
    loadPortrait(ch.id).then(url => { if(url) avatar.innerHTML = `<img src="${url}">`; });

    list.appendChild(el("div", {class:"card tight"}, [
      el("div", {class:"char-card"}, [
        avatar,
        el("div", {class:"char-meta"}, [el("div", {class:"name"}, ch.name), el("div", {class:"sub"}, `Level ${ch.level} ${labelForClass(state.ruleset, ch.classId)}`)]),
        el("div", {class:"char-actions"}, [
          el("button", {class:"btn small primary", onclick: async ()=>{ await setActiveCharacter(ch.id); go("/sheet"); }}, ["Open"]),
          el("button", {class:"btn small danger", onclick: ()=>deleteCharacter(ch)}, [icons.trash])
        ])
      ])
    ]));
  }
  cont.appendChild(list);
  return shell(cont);
}

async function Sheet(){
  const rs = state.ruleset;
  const ch = state.character;
  if(!rs || !ch) return shell(el("div", {class:"card"}, "Select a character and ruleset first."));

  const {derived} = deriveCharacter(rs, ch);
  const avatar = el("div", {class:"avatar"}, [initialsNode(ch.name)]);
  loadPortrait(ch.id).then(url => { if(url) avatar.innerHTML = `<img src="${url}">`; });

  const header = el("div", {class:"card"}, [
    el("div", {class:"hstack"}, [
      avatar,
      el("div", {class:"vstack"}, [
        el("div", {style:"font-size:24px;font-weight:900"}, ch.name),
        el("div", {class:"small"}, `Level ${ch.level} ${labelForClass(rs, ch.classId)} • PB +${derived.proficiencyBonus}`)
      ]),
      el("div", {class:"spacer"}),
      el("button", {class:"btn primary", html: icons.bolt, onclick: ()=>go("/levelup")}, ["Level Up"])
    ])
  ]);

  const stats = el("div", {class:"card"}, [
    el("div", {style:"font-weight:900"}, "Abilities"),
    el("div", {class:"grid cols3", style:"margin-top:10px"}, Object.entries(ch.abilities).map(([k,v])=> el("div", {class:"card soft tight"}, [
      el("div", {class:"small"}, k.toUpperCase()),
      el("div", {style:"font-size:20px;font-weight:900"}, String(v)),
      el("div", {class:"small"}, `${abilityMod(v)>=0?"+":""}${abilityMod(v)}`)
    ])))
  ]);

  const notes = el("div", {class:"card"}, [
    el("div", {style:"font-weight:900"}, "Notes"),
    el("textarea", {class:"textarea", style:"margin-top:10px", value: ch.notes, oninput: async (e)=>{
      ch.notes = e.target.value;
      await saveCharacter(ch);
    }})
  ]);

  return shell(el("div", {}, [header, el("div", {class:"grid cols2"}, [stats, notes])]));
}

async function LevelUp(){
  const rs = state.ruleset;
  const ch = state.character;
  if(!rs || !ch) return shell(el("div", {class:"card"}, "Setup required."));

  const nextLevel = Math.min(20, (ch.level||1) + 1);
  const plan = buildLevelUpPlan(rs, ch, nextLevel);
  const choiceState = {};

  const cont = el("div", {}, [pageTitle("Level Up", `Advancing to Level ${nextLevel}`, [])]);
  const blocks = el("div", {class:"vstack"}, plan.choices.map(choice => {
    const options = listOptionsForChoice(rs, ch, choice);
    return el("div", {class:"card"}, [
      el("div", {style:"font-weight:800"}, choice.title || choice.id),
      el("div", {style:"margin-top:10px"}, renderChoice(choice, options, choiceState))
    ]);
  }));

  cont.appendChild(blocks);
  cont.appendChild(el("button", {class:"btn primary block", style:"margin-top:20px", onclick: async ()=>{
    const newCh = applyLevelUp(rs, structuredClone(ch), plan, choiceState);
    await saveCharacter(newCh, {setActive:true});
    await refreshCharacters();
    go("/sheet");
  }}, ["Apply Level Up"]));

  return shell(cont);
}

function renderChoice(choice, options, choiceState){
  const count = choice.count || 1;
  const wrap = el("div", {class:"grid cols2"});
  const selected = new Set();
  options.forEach(opt => {
    const id = opt.id || opt.name;
    const b = el("button", {class:"btn block", onclick: ()=>{
      if(selected.has(id)) selected.delete(id);
      else if(selected.size < count) selected.add(id);
      choiceState[choice.id] = Array.from(selected);
      wrap.querySelectorAll("button").forEach(btn => btn.classList.toggle("primary", selected.has(btn.textContent)));
    }}, opt.name);
    wrap.appendChild(b);
  });
  return wrap;
}

/* --- Modals --- */

function createCharacterModal(){
  const rs = state.ruleset;
  const classes = listClasses(rs);
  const body = el("div", {class:"vstack"}, [
    field("Name", el("input", {class:"input", id:"nc_name", value:"New Hero"})),
    field("Class", classSelect(classes, "nc_class"))
  ]);
  const m = modal({title:"New Character", body, footer: el("button", {class:"btn primary", onclick: async ()=>{
    const ch = makeNewCharacter({name: qs("#nc_name", m.wrap).value, classId: qs("#nc_class", m.wrap).value});
    await saveCharacter(ch, {setActive:true});
    await refreshCharacters();
    m.close();
    go("/sheet");
  }}, ["Create"])});
}

async function nukeAll(){
  if(!confirm("Erase all local data?")) return;
  await idb.clear("rulesets"); await idb.clear("characters"); await idb.clear("portraits");
  location.reload();
}

async function exportCharacter(ch){
  const blob = new Blob([JSON.stringify(ch, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `${safeName(ch.name)}.json`;
  a.click();
}

async function deleteCharacter(ch){
  if(!confirm(`Delete ${ch.name}?`)) return;
  await idb.del("characters", ch.id);
  await refreshCharacters();
  go("/characters");
}

/* --- Routes --- */

register("/home", Home);
register("/characters", Characters);
register("/sheet", Sheet);
register("/levelup", LevelUp);
register("/rulesets", async ()=>shell(el("div", {class:"card"}, "Ruleset Management coming in v1.1")));
register("/settings", async ()=>shell(el("div", {class:"card"}, "Settings coming in v1.1")));
register("/404", async ()=>shell(el("div", {}, "404 Not Found")));

await init();
start();