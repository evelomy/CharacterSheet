import { register, start, go, setRouteCallback } from "./ui/router.js";
import { el, qs } from "./lib/utils.js";
import { icons } from "./ui/icons.js";
import { toast } from "./ui/toast.js";
import { modal } from "./ui/modal.js";
import { idb } from "./lib/idb.js";
import { state, loadSettings, refreshRulesets, refreshCharacters, setActiveCharacter, setActiveRuleset } from "./lib/state.js";
import { validateRuleset, listClasses } from "./lib/ruleset.js";
import { deriveCharacter, buildLevelUpPlan, listOptionsForChoice, applyLevelUp } from "./lib/engine.js";

function navItem(path, icon, label){
  const a = el("a", {href:"#"+path, "data-nav":"1"}, [
    el("div", {html: icon}),
    el("div", {}, label),
  ]);
  a.addEventListener("click", (e)=>{ e.preventDefault(); go(path); });
  return a;
}

function shell(contentNode){
  const path = location.hash.replace(/^#/, "") || "/home";
  const sidebar = el("aside", {class:"sidebar"}, [
    el("div", {class:"brand"}, [
      el("div", {html: icons.box}),
      el("div", {class:"vstack", style:"gap:2px"}, [
        el("div", {class:"title"}, "CharSheet Engine"),
        el("div", {class:"sub"}, "Local-only. Pretty. Not a lawsuit magnet.")
      ])
    ]),
    el("div", {class:"nav"}, [
      navItem("/home", icons.home, "Home"),
      navItem("/characters", icons.users, "Characters"),
      navItem("/sheet", icons.sheet, "Sheet"),
      navItem("/levelup", icons.bolt, "Level Up"),
      navItem("/rulesets", icons.box, "Rulesets"),
      navItem("/settings", icons.settings, "Settings"),
    ]),
    el("div", {style:"margin-top:14px"}, [
      el("div", {class:"small"}, state.ruleset?.meta?.name ? `Ruleset: ${state.ruleset.meta.name}` : "Ruleset: none"),
      el("div", {class:"small"}, state.character?.name ? `Character: ${state.character.name}` : "Character: none"),
    ])
  ]);

  sidebar.querySelectorAll("a[data-nav]").forEach(a=>{
    const p = a.getAttribute("href")?.replace(/^#/, "");
    if(p === path) a.classList.add("active");
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
    }else{
      sidebar.classList.remove("open");
      scrim.remove();
    }
  }

  const main = el("main", {class:"content"}, contentNode);
  const layout = el("div", {}, [
    topbar,
    el("div", {class:"shell"}, [sidebar, main])
  ]);

  layout.addEventListener("click", (e)=>{
    const a = e.target.closest("a[data-nav]");
    if(a && window.innerWidth <= 980){
      openSidebar(false);
    }
  });

  return layout;
}

function titleFor(path){
  return ({
    "/home":"Home",
    "/characters":"Characters",
    "/sheet":"Character Sheet",
    "/levelup":"Level Up",
    "/rulesets":"Rulesets",
    "/settings":"Settings",
  })[path] || "CharSheet Engine";
}

async function init(){
  await loadSettings();
  await refreshRulesets();
  await refreshCharacters();

  if(!state.rulesets.length){
    const demo = await fetch("./data/ruleset.template.json").then(r=>r.json());
    await idb.put("rulesets", {id: demo.meta.id, meta: demo.meta, data: demo, importedAt: Date.now()});
    await setActiveRuleset(demo.meta.id);
    await refreshRulesets();
  }
  if(!state.characters.length){
    const rs = state.ruleset;
    const cls = listClasses(rs)[0];
    const ch = makeNewCharacter({name:"New Character", classId: cls?.id || "unknown", level:1});
    await saveCharacter(ch, {setActive:true});
    await refreshCharacters();
  }
}

function makeNewCharacter({name, classId, level=1}){
  return {
    id: crypto.randomUUID?.() || ("ch_"+Math.random().toString(16).slice(2)),
    name,
    classId,
    subclassId: null,
    level,
    abilities: {str:10,dex:10,con:10,int:10,wis:10,cha:10},
    features: [],
    choices: {},
    notes: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function normalizeCharacter(c){
  c = c || {};
  c.id ??= crypto.randomUUID?.() || ("ch_"+Math.random().toString(16).slice(2));
  c.name ??= "Unnamed";
  c.level = Math.max(1, parseInt(c.level ?? 1, 10) || 1);
  c.classId ??= null;
  c.subclassId ??= null;
  c.abilities ??= {str:10,dex:10,con:10,int:10,wis:10,cha:10};
  c.features ??= [];
  c.choices ??= {};
  c.custom ??= c.custom || {};
  c.inventory ??= c.inventory || [];
  c.notes ??= c.notes || "";
  c.createdAt ??= Date.now();
  c.updatedAt ??= Date.now();
  return c;
}

async function saveCharacter(ch, {setActive=false}={}){
  ch = normalizeCharacter(ch);
  const rec = {
    id: ch.id,
    name: ch.name,
    data: ch,
    updatedAt: Date.now(),
    createdAt: ch.createdAt || Date.now(),
    rulesetId: state.rulesetId
  };
  await idb.put("characters", rec);
  if(setActive){
    await setActiveCharacter(ch.id);
    state.characterId = ch.id;
    state.character = ch;
  }
}

async function loadPortrait(characterId){
  const p = await idb.get("portraits", characterId);
  return p?.blob ? URL.createObjectURL(p.blob) : null;
}

async function setPortrait(characterId, file){
  const blob = new Blob([await file.arrayBuffer()], {type: file.type || "image/jpeg"});
  await idb.put("portraits", {characterId, blob, type: blob.type, updatedAt: Date.now()});
}

function pageTitle(h, p, actions=[]){
  return el("div", {class:"page-title"}, [
    el("div", {}, [
      el("h1", {}, h),
      p ? el("p", {}, p) : null
    ]),
    el("div", {class:"hstack", style:"flex-wrap:wrap; justify-content:flex-end"}, actions)
  ]);
}

/* ---------------- Pages ---------------- */

async function Home(){
  const rs = state.ruleset;
  const ch = state.character;
  const derived = ch && rs ? deriveCharacter(rs, ch).derived : null;

  const cont = el("div", {}, []);
  const actions = [
    el("button", {class:"btn primary", html: icons.sheet, onclick: ()=>go("/sheet")}, ["Continue"]),
    el("button", {class:"btn", html: icons.users, onclick: ()=>go("/characters")}, ["Switch"]),
    el("button", {class:"btn", html: icons.bolt, onclick: ()=>go("/levelup")}, ["Level Up"]),
  ];

  cont.appendChild(pageTitle("Home", "Everything lives on this device. No accounts. No syncing. No crying.", actions));

  const hero = el("div", {class:"card"}, [
    el("div", {class:"grid cols2"}, [
      el("div", {}, [
        el("div", {class:"small"}, "Active character"),
        el("div", {style:"font-size:22px;font-weight:900;margin-top:6px"}, ch?.name || "None"),
        el("div", {class:"small", style:"margin-top:6px"}, `${labelForClass(rs, ch?.classId)} • Level ${ch?.level || "-"}`),
        el("div", {class:"small", style:"margin-top:10px"}, `Proficiency Bonus: +${derived?.proficiencyBonus ?? "?"}`),
        el("div", {class:"small"}, `Ruleset: ${rs?.meta?.name || "none"}`),
      ]),
      el("div", {}, [
        el("div", {class:"small"}, "Quick actions"),
        el("div", {class:"grid cols2", style:"margin-top:10px"}, [
          el("button", {class:"btn block", html: icons.upload, onclick: ()=>go("/rulesets")}, ["Ruleset"]),
          el("button", {class:"btn block", html: icons.download, onclick: ()=>exportCharacter()}, ["Export"]),
          el("button", {class:"btn block", html: icons.edit, onclick: ()=>renameCharacter()}, ["Rename"]),
          el("button", {class:"btn block danger", html: icons.trash, onclick: ()=>nukeAll()}, ["Reset"]),
        ])
      ])
    ])
  ]);

  cont.appendChild(hero);
  cont.appendChild(el("div", {class:"card soft"}, [
    el("div", {class:"small"}, "What this is"),
    el("div", {style:"margin-top:8px; color: 'var(--muted)'"}, "A generic character sheet engine that reads your own JSON rulesets.")
  ]));

  return shell(cont);
}

function labelForClass(rs, classId){
  return rs?.classes?.[classId]?.name || classId || "Unknown Class";
}

async function Characters(){
  const cont = el("div", {}, []);
  cont.appendChild(pageTitle("Characters", "Multiple characters on the same device.", [
    el("button", {class:"btn primary", html: icons.plus, onclick: ()=>createCharacterModal()}, ["New"]),
    el("button", {class:"btn", html: icons.upload, onclick: ()=>importCharacterModal()}, ["Import"]),
  ]));

  const list = el("div", {class:"grid"}, []);
  if(!state.characters.length){
    list.appendChild(el("div", {class:"card"}, "No characters yet. Make one."));
  }else{
    for(const rec of state.characters){
      const ch = rec.data;
      const avatar = el("div", {class:"avatar"}, [initialsNode(ch.name)]);
      loadPortrait(ch.id).then(url=>{ if(url){ avatar.innerHTML = ""; avatar.appendChild(el("img", {src:url})); }});

      const row = el("div", {class:"card tight"}, [
        el("div", {class:"char-card"}, [
          avatar,
          el("div", {class:"char-meta"}, [
            el("div", {class:"name"}, ch.name),
            el("div", {class:"sub"}, `${labelForClass(state.ruleset, ch.classId)} • Level ${ch.level}`),
          ]),
          el("div", {class:"char-actions"}, [
            el("button", {class:"btn small primary", html: icons.sheet, onclick: async ()=>{ await setActiveCharacter(ch.id); go("/sheet"); }}, ["Open"]),
            el("button", {class:"btn small", html: icons.edit, onclick: ()=>editCharacterModal(ch)}, ["Edit"]),
            el("button", {class:"btn small danger", html: icons.trash, onclick: ()=>deleteCharacter(ch)}, ["Delete"]),
          ])
        ])
      ]);
      list.appendChild(row);
    }
  }
  cont.appendChild(list);
  return shell(cont);
}

function initialsNode(name){
  return el("div", {}, (name||"?").split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join("").toUpperCase() || "?");
}

async function Sheet(){
  const rs = state.ruleset;
  const ch = state.character;

  if(!rs || !ch){
    return shell(el("div", {class:"card"}, "No ruleset or character selected."));
  }

  const {derived} = deriveCharacter(rs, ch);
  const avatar = el("div", {class:"avatar"}, [initialsNode(ch.name)]);
  loadPortrait(ch.id).then(url=>{ if(url){ avatar.innerHTML=""; avatar.appendChild(el("img", {src:url})); }});

  const header = el("div", {class:"card"}, [
    el("div", {class:"hstack", style:"align-items:flex-start"}, [
      avatar,
      el("div", {class:"vstack", style:"gap:6px"}, [
        el("div", {style:"font-size:28px;font-weight:950;letter-spacing:-.6px"}, ch.name),
        el("div", {class:"small"}, `${labelForClass(rs, ch.classId)} • Level ${ch.level}`),
        el("div", {class:"hstack", style:"flex-wrap:wrap"}, [
          el("span", {class:"badge"}, `PB +${derived.proficiencyBonus}`),
        ])
      ]),
      el("div", {class:"spacer"}),
      el("div", {class:"hstack"}, [
        el("button", {class:"btn", html: icons.edit, onclick: ()=>editCharacterModal(structuredClone(ch))}, ["Edit"]),
        el("button", {class:"btn primary", html: icons.bolt, onclick: ()=>go("/levelup")}, ["Level Up"]),
      ])
    ])
  ]);

  const stats = el("div", {class:"card"}, [
    el("div", {style:"font-weight:900; margin-bottom:10px"}, "Abilities"),
    el("div", {class:"grid cols3"}, Object.entries(ch.abilities || {}).map(([k,v])=>{
      const mod = Math.floor((v - 10)/2);
      return el("div", {class:"card soft tight"}, [
        el("div", {class:"small"}, k.toUpperCase()),
        el("div", {style:"font-size:22px;font-weight:900"}, String(v)),
        el("div", {class:"small"}, `Mod ${mod >= 0 ? "+" : ""}${mod}`)
      ]);
    }))
  ]);

  const notes = el("div", {class:"card"}, [
    el("div", {style:"font-weight:900; margin-bottom:10px"}, "Notes"),
    el("textarea", {class:"textarea", value: ch.notes || "", oninput: async (e)=>{
      const copy = structuredClone(state.character);
      copy.notes = e.target.value;
      await saveCharacter(copy);
    }})
  ]);

  const cont = el("div", {}, [
    pageTitle("Character Sheet", "V1 Essentials", []),
    header,
    el("div", {class:"grid cols2"}, [stats, notes])
  ]);

  return shell(cont);
}

/* Logic for LevelUp, Rulesets, Settings, etc. stays largely the same but ensure no variable collisions */

async function LevelUp(){
  const rs = state.ruleset;
  const ch = state.character;
  if(!rs || !ch) return shell(el("div", {class:"card"}, "Pick a character first."));

  const nextLevel = Math.min(20, (ch.level||1) + 1);
  const plan = buildLevelUpPlan(rs, ch, nextLevel);

  const choiceState = {}; 
  const blocks = el("div", {class:"vstack"}, plan.choices.map(choice => {
    const options = listOptionsForChoice(rs, ch, choice);
    return el("div", {class:"card"}, [
      el("div", {style:"font-weight:900"}, choice.title || choice.id),
      el("div", {style:"margin-top:10px"}, renderChoice(choice, options, choiceState))
    ]);
  }));

  const cont = el("div", {}, [
    pageTitle("Level Up", `Advancing to Level ${nextLevel}`, []),
    blocks,
    el("button", {class:"btn primary", style:"margin-top:20px", onclick: async ()=>{
      const newCh = applyLevelUp(rs, structuredClone(ch), plan, choiceState);
      await saveCharacter(newCh, {setActive:true});
      go("/sheet");
    }}, ["Apply Level Up"])
  ]);

  return shell(cont);
}

function renderChoice(choice, options, choiceState){
  const count = choice.count || 1;
  const wrap = el("div", {class:"grid cols2"});
  const selected = new Set();

  function refresh(){
    wrap.querySelectorAll("button").forEach(b => {
      b.classList.toggle("primary", selected.has(b.dataset.id));
    });
  }

  options.forEach(opt => {
    const id = opt.id || opt.name;
    const b = el("button", {class:"btn block", "data-id": id, onclick: ()=>{
      if(selected.has(id)) selected.delete(id);
      else if(selected.size < count) selected.add(id);
      choiceState[choice.id] = Array.from(selected);
      refresh();
    }}, opt.name);
    wrap.appendChild(b);
  });
  return wrap;
}

// Re-register all routes
register("/home", Home);
register("/characters", Characters);
register("/sheet", Sheet);
register("/levelup", LevelUp);
register("/rulesets", Rulesets);
register("/settings", Settings);
register("/404", async ()=>shell(el("div", {class:"card"}, "404. Page not found.")));

async function Rulesets(){ return shell(el("div", {}, "Ruleset Management")); }
async function Settings(){ return shell(el("div", {}, "Settings")); }

await init();
start();