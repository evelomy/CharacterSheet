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

  // mark active
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

  // close on nav click mobile
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

  // If no ruleset present, install the template demo in DB (safe dummy content)
  if(!state.rulesets.length){
    const demo = await fetch("./data/ruleset.template.json").then(r=>r.json());
    await idb.put("rulesets", {id: demo.meta.id, meta: demo.meta, data: demo, importedAt: Date.now()});
    await setActiveRuleset(demo.meta.id);
    await refreshRulesets();
  }
  // If no character present, create one placeholder
  if(!state.characters.length){
    const rs = state.ruleset;
    const cls = listClasses(rs)[0];
    const ch = makeNewCharacter({name:"New Character", classId: cls?.id || "unknown", level:1});
    await saveCharacter(normalizeCharacter(ch, {setActive:true}));
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

async function saveCharacter(normalizeCharacter(ch, {setActive=false}={})){
  const rec = { id: ch.id, name: ch.name, data: ch, updatedAt: Date.now(), createdAt: ch.createdAt||Date.now(), rulesetId: state.rulesetId };
  await idb.put("characters", normalizeCharacter());
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
  const derived = deriveCharacter(rs, ch).derived;

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

  const info = el("div", {class:"card soft"}, [
    el("div", {class:"small"}, "What this is"),
    el("div", {style:"margin-top:8px; color: 'var(--muted)'"}, "A generic character sheet engine that reads your own JSON rulesets. That means: no copyrighted rules in the repo, no takedowns, and you can make it behave like whatever system you want.")
  ]);
  cont.appendChild(info);

  return shell(cont);
}

function labelForClass(rs, classId){
  return rs?.classes?.[classId]?.name || classId || "Unknown Class";
}

async function Characters(){
  const cont = el("div", {}, []);
  cont.appendChild(pageTitle("Characters", "Multiple characters on the same device, because humans can’t commit to anything.", [
    el("button", {class:"btn primary", html: icons.plus, onclick: ()=>createCharacterModal()}, ["New"]),
    el("button", {class:"btn", html: icons.upload, onclick: ()=>importCharacterModal()}, ["Import"]),
  ]));

  const list = el("div", {class:"grid"}, []);
  const chars = state.characters;

  if(!chars.length){
    list.appendChild(el("div", {class:"card"}, "No characters yet. Make one."));
  }else{
    for(const rec of chars){
      const ch = rec.data;
      const row = el("div", {class:"card tight"}, []);
      const avatar = el("div", {class:"avatar"}, [initialsNode(ch.name)]);
      // attempt load portrait
      loadPortrait(ch.id).then(url=>{
        if(url){
          avatar.innerHTML = "";
          avatar.appendChild(el("img", {src:url, alt:"portrait"}));
        }
      });

      row.appendChild(el("div", {class:"char-card"}, [
        avatar,
        el("div", {class:"char-meta"}, [
          el("div", {class:"name"}, ch.name),
          el("div", {class:"sub"}, `${labelForClass(state.ruleset, ch.classId)} • Level ${ch.level}`),
          el("div", {class:"sub"}, `Last: ${new Date(rec.updatedAt).toLocaleString()}`),
        ]),
        el("div", {class:"char-actions"}, [
          el("button", {class:"btn small primary", html: icons.sheet, onclick: async ()=>{ await setActiveCharacter(ch.id); await refreshCharacters(); go("/sheet"); }}, ["Open"]),
          el("button", {class:"btn small", html: icons.edit, onclick: ()=>editCharacterModal(ch)}, ["Edit"]),
          el("button", {class:"btn small", html: icons.download, onclick: ()=>exportCharacter(ch)}, ["Export"]),
          el("button", {class:"btn small danger", html: icons.trash, onclick: ()=>deleteCharacter(ch)}, ["Delete"]),
        ])
      ]));

      list.appendChild(row);
    }
  }

  cont.appendChild(list);
  return shell(cont);
}

function initialsNode(name){
  return el("div", {}, (name||"?").split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join("").toUpperCase() || "?");
}

function createCharacterModal(){
  const normalizeCharacter=(c)=>{c=c||{};c.level??=1;c.classId??=null;c.abilities??={str:10,dex:10,con:10,int:10,wis:10,cha:10};c.hp??={current:1,max:1,temp:0};c.ac??=10;c.speed??=30;c.custom??={};c.choices??={};c.inventory??=[];c.notes??="";return c;};
  const rs = state.ruleset;
  const classes = listClasses(rs);
  const body = el("div", {class:"grid cols2"}, [
    field("Name", el("input", {class:"input", id:"ch_name", value:"New Character"})),
    field("Class", classSelect(classes, "ch_class")),
    field("Level", el("input", {class:"input", id:"ch_level", type:"number", min:"1", max:"20", value:"1"})),
    field("HP Max", el("input", {class:"input", id:"ed_hpmax", type:"number", min:"1", value:String((ch.hp&&ch.hp.max)||1)})),
    field("HP Current", el("input", {class:"input", id:"ed_hpcur", type:"number", min:"0", value:String((ch.hp&&ch.hp.current)||1)})),
    field("Temp HP", el("input", {class:"input", id:"ed_hptemp", type:"number", min:"0", value:String((ch.hp&&ch.hp.temp)||0)})),
    field("AC", el("input", {class:"input", id:"ed_ac", type:"number", min:"0", value:String(ch.ac ?? 10)})),
    field("Speed", el("input", {class:"input", id:"ed_speed", type:"number", min:"0", value:String(ch.speed ?? 30)})),
    el("div", {class:"small", style:"grid-column:1/-1"}, "Ability Scores"),
    field("STR", el("input", {class:"input", id:"ed_str", type:"number", min:"1", max:"30", value:String(ch.abilities?.str ?? 10)})),
    field("DEX", el("input", {class:"input", id:"ed_dex", type:"number", min:"1", max:"30", value:String(ch.abilities?.dex ?? 10)})),
    field("CON", el("input", {class:"input", id:"ed_con", type:"number", min:"1", max:"30", value:String(ch.abilities?.con ?? 10)})),
    field("INT", el("input", {class:"input", id:"ed_int", type:"number", min:"1", max:"30", value:String(ch.abilities?.int ?? 10)})),
    field("WIS", el("input", {class:"input", id:"ed_wis", type:"number", min:"1", max:"30", value:String(ch.abilities?.wis ?? 10)})),
    field("CHA", el("input", {class:"input", id:"ed_cha", type:"number", min:"1", max:"30", value:String(ch.abilities?.cha ?? 10)})),
    el("div", {class:"small"}, "Portrait can be added after creation.")
  ]);

  const footer = el("div", {class:"hstack"}, [
    el("button", {class:"btn", onclick: ()=>m.close()}, ["Cancel"]),
    el("button", {class:"btn primary", html: icons.plus, onclick: async ()=>{
      const name = qs("#ch_name", m.wrap).value.trim() || "Unnamed";
      const classId = qs("#ch_class", m.wrap).value;
      const level = parseInt(qs("#ch_level", m.wrap).value, 10) || 1;
      const ch = makeNewCharacter({name, classId, level});
      await saveCharacter(normalizeCharacter(ch, {setActive:true}));
      await refreshCharacters();
      toast("Character created", "Stored locally in your browser. Like a gremlin in a cupboard.");
      m.close();
      go("/sheet");
    }}, ["Create"])
  ]);
  const m = modal({title:"Create Character", body, footer});
}

function importCharacterModal(){
  const body = el("div", {}, [
    el("div", {class:"small"}, "Import a character JSON previously exported from this app."),
    el("input", {class:"input", type:"file", accept:"application/json", id:"ch_import", style:"margin-top:10px"})
  ]);
  const footer = el("div", {class:"hstack"}, [
    el("button", {class:"btn", onclick: ()=>m.close()}, ["Cancel"]),
    el("button", {class:"btn primary", html: icons.upload, onclick: async ()=>{
      const f = qs("#ch_import", m.wrap).files?.[0];
      if(!f){ toast("No file", "Pick a character JSON file."); return; }
      const txt = await f.text();
      const ch = JSON.parse(txt);
      if(!ch?.id) ch.id = crypto.randomUUID?.() || ("ch_"+Math.random().toString(16).slice(2));
      ch.updatedAt = Date.now();
      if(!ch.createdAt) ch.createdAt = Date.now();
      await saveCharacter(normalizeCharacter(ch, {setActive:true}));
      await refreshCharacters();
      toast("Imported", "Character added to this device.");
      m.close();
      go("/sheet");
    }}, ["Import"])
  ]);
  const m = modal({title:"Import Character", body, footer});
}

async function exportCharacter(ch=state.character){
  if(!ch){ toast("No character", "Select one first."); return; }
  const filename = `${safeName(ch.name)}.character.json`;
  const blob = new Blob([JSON.stringify(ch, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 3000);
}

function safeName(n){
  return (n||"character").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,64) || "character";
}

function editCharacterModal(ch){
  const rs = state.ruleset;
  const classes = listClasses(rs);
  const body = el("div", {class:"grid cols2"}, [
    field("Name", el("input", {class:"input", id:"ed_name", value: ch.name || ""})),
    field("Class", classSelect(classes, "ed_class", ch.classId)),
    field("Level", el("input", {class:"input", id:"ed_level", type:"number", min:"1", max:"20", value:String(ch.level||1)})),
    field("Portrait", el("input", {class:"input", id:"ed_portrait", type:"file", accept:"image/*"})),
    el("div", {class:"small"}, "Portrait is stored as an image blob in IndexedDB. Not in your repo. Relax.")
  ]);

  const footer = el("div", {class:"hstack"}, [
    el("button", {class:"btn", onclick: ()=>m.close()}, ["Cancel"]),
    el("button", {class:"btn primary", html: icons.edit, onclick: async ()=>{
      ch.name = qs("#ed_name", m.wrap).value.trim() || ch.name || "Unnamed";
      ch.classId = qs("#ed_class", m.wrap).value;
      ch.level = parseInt(qs("#ed_level", m.wrap).value,10) || ch.level || 1;
      ch.hp ??= {current:1,max:1,temp:0};
      ch.hp.max = Math.max(1, parseInt(qs("#ed_hpmax", m.wrap).value||"1",10));
      ch.hp.current = Math.max(0, parseInt(qs("#ed_hpcur", m.wrap).value||String(ch.hp.max),10));
      ch.hp.temp = Math.max(0, parseInt(qs("#ed_hptemp", m.wrap).value||"0",10));
      ch.ac = Math.max(0, parseInt(qs("#ed_ac", m.wrap).value||"10",10));
      ch.speed = Math.max(0, parseInt(qs("#ed_speed", m.wrap).value||"30",10));
      ch.abilities ??= {str:10,dex:10,con:10,int:10,wis:10,cha:10};
      ch.abilities.str = parseInt(qs("#ed_str", m.wrap).value||"10",10);
      ch.abilities.dex = parseInt(qs("#ed_dex", m.wrap).value||"10",10);
      ch.abilities.con = parseInt(qs("#ed_con", m.wrap).value||"10",10);
      ch.abilities.int = parseInt(qs("#ed_int", m.wrap).value||"10",10);
      ch.abilities.wis = parseInt(qs("#ed_wis", m.wrap).value||"10",10);
      ch.abilities.cha = parseInt(qs("#ed_cha", m.wrap).value||"10",10);
      ch.updatedAt = Date.now();
      const f = qs("#ed_portrait", m.wrap).files?.[0];
      if(f){
        await setPortrait(ch.id, f);
      }
      await saveCharacter(normalizeCharacter(ch, {setActive: state.characterId === ch.id}));
      await refreshCharacters();
      toast("Saved", "Character updated.");
      m.close();
      go("/characters");
    }}, ["Save"])
  ]);
  const m = modal({title:"Edit Character", body, footer});
}

async function deleteCharacter(ch){
  const body = el("div", {}, [
    el("div", {class:"small"}, `Delete ${ch.name}? This only removes it from THIS device.`),
  ]);
  const footer = el("div", {class:"hstack"}, [
    el("button", {class:"btn", onclick: ()=>m.close()}, ["Cancel"]),
    el("button", {class:"btn danger", html: icons.trash, onclick: async ()=>{
      await idb.del("characters", ch.id);
      await idb.del("portraits", ch.id);
      if(state.characterId === ch.id){
        await setActiveCharacter(null);
        state.characterId = null;
        state.character = null;
      }
      await refreshCharacters();
      toast("Deleted", "Poof.");
      m.close();
      go("/characters");
    }}, ["Delete"])
  ]);
  const m = modal({title:"Delete Character", body, footer});
}

async function Sheet(){
  const rs=(state?.activeRuleset||state?.ruleset||{});
  const c=(state?.activeCharacter||state?.character||{});
  c.level ??= 1;
  c.classId ??= (rs.classes ? Object.keys(rs.classes)[0] : null);
  c.abilities ??= {str:10,dex:10,con:10,int:10,wis:10,cha:10};
  c.custom ??= {};
  c.choices ??= {};
  const rs = state.ruleset;
  const ch = state.character;
  if(!rs || !ch){
    return shell(el("div", {class:"card"}, "No ruleset or character selected."));
  }
  const {derived} = deriveCharacter(rs, ch);

  const header = el("div", {class:"card"}, []);
  const avatar = el("div", {class:"avatar", style:"width:76px;height:76px;border-radius:22px"}, [initialsNode(ch.name)]);
  loadPortrait(ch.id).then(url=>{
    if(url){ avatar.innerHTML=""; avatar.appendChild(el("img", {src:url, alt:"portrait"})); }
  });

  header.appendChild(el("div", {class:"hstack", style:"align-items:flex-start"}, [
    avatar,
    el("div", {class:"vstack", style:"gap:6px"}, [
      el("div", {style:"font-size:28px;font-weight:950;letter-spacing:-.6px"}, ch.name),
      el("div", {class:"small"}, `${labelForClass(rs, ch.classId)} • Level ${ch.level}`),
      el("div", {class:"hstack", style:"flex-wrap:wrap"}, [
        el("span", {class:"badge"}, `PB +${derived.proficiencyBonus}`),
        el("span", {class:"badge"}, `Ruleset: ${rs.meta?.name || rs.meta?.id || "?"}`),
      ])
    ]),
    el("div", {class:"spacer"}),
    el("div", {class:"hstack", style:"flex-wrap:wrap; justify-content:flex-end"}, [
      el("button", {class:"btn", html: icons.edit, onclick: ()=>editCharacterModal(structuredClone(ch))}, ["Edit"]),
      el("button", {class:"btn primary", html: icons.bolt, onclick: ()=>go("/levelup")}, ["Level Up"]),
    ])
  ]));
  const vitals = (()=> {
    ch.hp ??= {current:1,max:1,temp:0};
    ch.ac ??= 10;
    ch.speed ??= 30;

    const amt = el("input", {class:"input", type:"number", min:"0", value:"1", style:"width:90px"});
    const saveAndRerender = async ()=>{
      const copy = structuredClone(state.character);
      copy.hp = ch.hp;
      copy.ac = ch.ac;
      copy.speed = ch.speed;
      copy.updatedAt = Date.now();
      await saveCharacter(copy, {setActive:true});
      await refreshCharacters();
      state.character = copy;
      go("/sheet");
    };

    const applyDamage = async ()=>{
      const n = parseInt(amt.value||"0",10) || 0;
      const t = Math.min(ch.hp.temp||0, n);
      ch.hp.temp = (ch.hp.temp||0) - t;
      const rem = n - t;
      ch.hp.current = Math.max(0, (ch.hp.current||0) - rem);
      await saveAndRerender();
    };

    const applyHeal = async ()=>{
      const n = parseInt(amt.value||"0",10) || 0;
      ch.hp.current = Math.min(ch.hp.max||1, (ch.hp.current||0) + n);
      await saveAndRerender();
    };

    const setTemp = async (val)=>{ ch.hp.temp = Math.max(0, val); await saveAndRerender(); };

    return el("div", {class:"card"}, [
      el("div", {style:"font-weight:900; margin-bottom:10px"}, "Vitals"),
      el("div", {class:"grid cols3"}, [
        el("div", {class:"card soft tight"}, [
          el("div", {class:"small"}, "HP"),
          el("div", {style:"font-size:22px;font-weight:900;margin-top:4px"}, `${ch.hp.current||0}/${ch.hp.max||1}`),
          el("div", {class:"small"}, `Temp ${ch.hp.temp||0}`)
        ]),
        el("div", {class:"card soft tight"}, [
          el("div", {class:"small"}, "AC"),
          el("div", {style:"font-size:22px;font-weight:900;margin-top:4px"}, String(ch.ac ?? 10)),
          el("div", {class:"small"}, "Edit to change")
        ]),
        el("div", {class:"card soft tight"}, [
          el("div", {class:"small"}, "Speed"),
          el("div", {style:"font-size:22px;font-weight:900;margin-top:4px"}, `${ch.speed ?? 30} ft.`),
          el("div", {class:"small"}, "Edit to change")
        ]),
      ]),
      el("div", {class:"hstack", style:"gap:8px; flex-wrap:wrap; margin-top:10px"}, [
        el("div", {class:"small"}, "Amount"),
        amt,
        el("button", {class:"btn danger", onclick: applyDamage}, ["- Damage"]),
        el("button", {class:"btn", onclick: applyHeal}, ["+ Heal"]),
        el("button", {class:"btn", onclick: ()=>setTemp(0)}, ["Clear Temp"]),
      ])
    ]);
  })();

  const statblock = el("div", {class:"card"}, [
    el("div", {style:"font-weight:900; margin-bottom:10px"}, "Stat Block"),
    el("div", {class:"grid cols3"}, [
      el("div", {class:"card soft tight"}, [
        el("div", {class:"small"}, "Initiative"),
        el("div", {style:"font-size:22px;font-weight:900;margin-top:4px"}, `${abilityMod(ch.abilities?.dex ?? 10) >= 0 ? "+" : ""}${abilityMod(ch.abilities?.dex ?? 10)}`),
      ]),
      el("div", {class:"card soft tight"}, [
        el("div", {class:"small"}, "Proficiency Bonus"),
        el("div", {style:"font-size:22px;font-weight:900;margin-top:4px"}, `+${derived.proficiencyBonus}`),
      ]),
      el("div", {class:"card soft tight"}, [
        el("div", {class:"small"}, "Spell DC (INT)"),
        el("div", {style:"font-size:22px;font-weight:900;margin-top:4px"}, String(8 + derived.proficiencyBonus + abilityMod(ch.abilities?.int ?? 10))),
      ]),
    ]),
    el("div", {class:"small", style:"margin-top:10px"}, "Saves (base; proficiencies coming later)"),
    el("div", {class:"grid cols3"}, Object.entries(ch.abilities||{}).map(([k,v])=>{
      const mod = abilityMod(v);
      return el("div", {class:"card soft tight"}, [
        el("div", {class:"small"}, `${k.toUpperCase()} Save`),
        el("div", {style:"font-size:18px;font-weight:900;margin-top:2px"}, `${mod>=0?"+":""}${mod}`),
      ]);
    }))
  ]);

  const inventoryCard = (()=> {
    ch.inventory ??= [];
    const nameIn = el("input", {class:"input", placeholder:"Item name"});
    const qtyIn = el("input", {class:"input", type:"number", min:"1", value:"1", style:"width:90px"});
    const noteIn = el("input", {class:"input", placeholder:"Notes (optional)"});

    const saveInv = async ()=>{
      const copy = structuredClone(state.character);
      copy.inventory = ch.inventory;
      copy.updatedAt = Date.now();
      await saveCharacter(copy, {setActive:true});
      await refreshCharacters();
      state.character = copy;
      go("/sheet");
    };

    const add = async ()=>{
      const name = (nameIn.value||"").trim();
      if(!name) return;
      const qty = Math.max(1, parseInt(qtyIn.value||"1",10)||1);
      ch.inventory.push({id: crypto.randomUUID?.()||("it_"+Math.random().toString(16).slice(2)), name, qty, note:(noteIn.value||"").trim()});
      nameIn.value=""; noteIn.value=""; qtyIn.value="1";
      await saveInv();
    };

    const del = (id)=> async ()=>{
      ch.inventory = (ch.inventory||[]).filter(x=>x.id!==id);
      await saveInv();
    };

    return el("div", {class:"card"}, [
      el("div", {style:"font-weight:900; margin-bottom:10px"}, "Inventory"),
      el("div", {class:"hstack", style:"gap:8px; flex-wrap:wrap"}, [
        nameIn, qtyIn, noteIn,
        el("button", {class:"btn primary", onclick:add}, ["Add"])
      ]),
      el("div", {style:"margin-top:10px"}, (ch.inventory||[]).length
        ? (ch.inventory||[]).map(it=> el("div", {class:"row", style:"justify-content:space-between"}, [
            el("div", {}, [
              el("div", {style:"font-weight:800"}, `${it.name} ×${it.qty}`),
              it.note ? el("div", {class:"small"}, it.note) : null
            ]),
            el("button", {class:"btn small danger", onclick:del(it.id)}, ["Remove"])
          ]))
        : el("div", {class:"small"}, "No items yet."))
    ]);
  })();


  const stats = el("div", {class:"card"}, [
    el("div", {style:"font-weight:900; margin-bottom:10px"}, "Abilities"),
    el("div", {class:"grid cols3"}, Object.entries(ch.abilities || {}).map(([k,v])=>{
      return el("div", {class:"card soft tight"}, [
        el("div", {class:"small"}, k.toUpperCase()),
        el("div", {style:"font-size:22px;font-weight:900;margin-top:4px"}, String(v)),
        el("div", {class:"small"}, `Mod ${abilityMod(v) >= 0 ? "+" : ""}${abilityMod(v)}`)
      ]);
    }))
  ]);

  const slots = el("div", {class:"card"}, [
    el("div", {style:"font-weight:900; margin-bottom:10px"}, "Spell Slots (from ruleset table)"),
    Object.keys(derived.spellSlots||{}).length
      ? el("div", {class:"grid cols4"}, Object.entries(derived.spellSlots || {}).map(([lvl,c])=> el("div", {class:"card soft tight"}, [
          el("div", {class:"small"}, `Level ${lvl}`),
          el("div", {style:"font-size:22px;font-weight:900;margin-top:4px"}, String(c))
        ])))
      : el("div", {class:"small"}, "No spell slot table defined in this ruleset for this class. That's fine. Not everything needs spells.")
  ]);

  const notes = el("div", {class:"card"}, [
    el("div", {style:"font-weight:900; margin-bottom:10px"}, "Notes"),
    el("textarea", {class:"textarea", value: ch.notes || "", id:"notes_area", oninput: async (e)=>{
      const copy = structuredClone(state.character);
      copy.notes = e.target.value;
      copy.updatedAt = Date.now();
      await saveCharacter(normalizeCharacter(copy, {setActive:true}));
      await refreshCharacters();
    }})
  ]);

  const cont = el("div", {}, []);
  cont.appendChild(pageTitle("Character Sheet", "Tabs come later; v1 shows the essentials cleanly.", []));
  cont.appendChild(header);
  cont.appendChild(el("div", {class:"grid cols2"}, [vitals, stats]));
  cont.appendChild(el("div", {class:"grid cols2"}, [inventoryCard, slots]));
  cont.appendChild(statblock);
  cont.appendChild(notes);

  return shell(cont);
}

function abilityMod(score){
  const s = parseInt(score,10) || 10;
  return Math.floor((s - 10)/2);
}

async function LevelUp(){
  const rs = state.ruleset;
  const ch = state.character;
  if(!rs || !ch) return shell(el("div", {class:"card"}, "Load a ruleset and pick a character first."));

  const nextLevel = Math.min(20, (ch.level||1) + 1);
  const plan = buildLevelUpPlan(rs, ch, nextLevel);

  const cont = el("div", {}, []);
  cont.appendChild(pageTitle("Level Up", "Guided flow. No spreadsheet punishment.", [
    el("button", {class:"btn", html: icons.sheet, onclick: ()=>go("/sheet")}, ["Back to sheet"])
  ]));

  const intro = el("div", {class:"card"}, [
    el("div", {class:"stepper"}, [
      stepDot(true), el("div", {}, `Level ${ch.level} → ${nextLevel}`),
      el("span", {class:"badge"}, labelForClass(rs, ch.classId))
    ]),
    plan.notes ? el("div", {class:"small", style:"margin-top:8px"}, plan.notes) : null,
    el("div", {class:"small", style:"margin-top:10px"}, `Grants: ${plan.grants.length ? plan.grants.join(", ") : "None"}`),
    el("div", {class:"small"}, `Choices: ${plan.choices.length ? plan.choices.length : "None"}`),
  ]);
  cont.appendChild(intro);

  const choiceState = {}; // {choiceId:[ids]}
  const blocks = el("div", {class:"vstack"}, []);

  for(const choice of plan.choices){
    const options = listOptionsForChoice(rs, ch, choice);
    const box = el("div", {class:"card"}, [
      el("div", {style:"font-weight:900"}, choice.title || choice.id),
      el("div", {class:"small", style:"margin-top:6px"}, choice.help || `Pick ${choice.count || 1} from ${choice.from}`),
      el("div", {style:"margin-top:10px"}, renderChoice(choice, options, choiceState))
    ]);
    blocks.appendChild(box);
  }

  cont.appendChild(blocks);

  const actions = el("div", {class:"card soft"}, [
    el("div", {class:"hstack", style:"flex-wrap:wrap"}, [
      el("button", {class:"btn", onclick: ()=>previewPlan(plan, choiceState)}, ["Preview"]),
      el("div", {class:"spacer"}),
      el("button", {class:"btn primary", html: icons.bolt, onclick: async ()=>{
        // validate counts
        for(const choice of plan.choices){
          const picked = choiceState[choice.id] || [];
          const need = choice.count || 1;
          if(picked.length !== need){
            toast("Incomplete", `Choice "${choice.title || choice.id}" needs ${need} pick(s).`);
            return;
          }
        }
        const newCh = applyLevelUp(rs, structuredClone(ch), plan, choiceState);
        await saveCharacter(normalizeCharacter(newCh, {setActive:true}));
        await refreshCharacters();
        toast("Level up applied", `Now level ${newCh.level}. Try not to die immediately.`);
        go("/sheet");
      }}, ["Apply Level Up"])
    ])
  ]);

  cont.appendChild(actions);

  return shell(cont);
}

function stepDot(on){
  return el("span", {class:"dot " + (on ? "on": "")});
}

function renderChoice(choice, options, choiceState){
  const count = choice.count || 1;
  const wrap = el("div", {class:"grid cols2"});
  const selected = new Set();

  function toggle(id){
    if(selected.has(id)){
      selected.delete(id);
    }else{
      if(selected.size >= count){
        toast("Limit", `You can only pick ${count}.`);
        return;
      }
      selected.add(id);
    }
    choiceState[choice.id] = Array.from(selected);
    refresh();
  }

  function refresh(){
    wrap.querySelectorAll("button[data-opt]").forEach(b=>{
      const id = b.getAttribute("data-opt");
      const on = selected.has(id);
      b.classList.toggle("primary", on);
    });
  }

  for(const opt of options){
    const id = opt.id || opt._id || opt.name;
    const label = opt.name || id;
    const b = el("button", {class:"btn block", "data-opt":id, onclick: ()=>toggle(id)}, [
      el("div", {style:"text-align:left"}, [
        el("div", {style:"font-weight:800"}, label),
        opt.tags?.length ? el("div", {class:"small"}, opt.tags.join(" • ")) : el("div", {class:"small"}, " ")
      ])
    ]);
    wrap.appendChild(b);
  }

  // empty state
  if(!options.length){
    wrap.appendChild(el("div", {class:"card soft"}, [
      el("div", {style:"font-weight:800"}, "No options"),
      el("div", {class:"small"}, "Your ruleset filter returned nothing. Either your ruleset is wrong, or the universe is.")
    ]));
  }

  return wrap;
}

function previewPlan(plan, choiceState){
  const lines = [];
  lines.push(`Next Level: ${plan.nextLevel}`);
  lines.push(`Grants: ${plan.grants.length ? plan.grants.join(", ") : "None"}`);
  for(const c of plan.choices){
    const picked = choiceState[c.id] || [];
    lines.push(`${c.title || c.id}: ${picked.length ? picked.join(", ") : "(none)"}`);
  }
  modal({
    title:"Preview Level Up",
    body: el("div", {}, [
      el("pre", {class:"card soft mono", style:"white-space:pre-wrap; overflow:auto"}, lines.join("\n"))
    ]),
    footer: el("div", {class:"hstack"}, [
      el("button", {class:"btn", onclick: ()=>m.close()}, ["Close"])
    ])
  });
  const m = {close: ()=>document.querySelector(".modal-wrap")?.remove()};
}

async function Rulesets(){
  const cont = el("div", {}, []);
  cont.appendChild(pageTitle("Rulesets", "Import your own JSON ruleset (kept locally). Public repo stays clean.", [
    el("button", {class:"btn primary", html: icons.upload, onclick: ()=>importRulesetModal()}, ["Import Ruleset"]),
  ]));

  const list = el("div", {class:"grid"}, []);
  for(const r of state.rulesets){
    const active = r.id === state.rulesetId;
    const probs = validateRuleset(r.data);
    const badge = probs.some(p=>p.level==="error") ? el("span",{class:"badge bad"},"Invalid")
                  : probs.some(p=>p.level==="warn") ? el("span",{class:"badge warn"},"Warnings")
                  : el("span",{class:"badge ok"},"OK");
    const row = el("div", {class:"card tight"}, [
      el("div", {class:"hstack", style:"flex-wrap:wrap"}, [
        el("div", {style:"font-weight:900"}, r.data?.meta?.name || r.id),
        active ? el("span", {class:"badge ok"}, "Active") : null,
        badge,
        el("div", {class:"spacer"}),
        el("button", {class:"btn small primary", onclick: async ()=>{ await setActiveRuleset(r.id); await refreshRulesets(); await refreshCharacters(); toast("Active ruleset set", r.data?.meta?.name || r.id); go('/home'); }}, ["Use"]),
        el("button", {class:"btn small", html: icons.download, onclick: ()=>exportRuleset(r.data)}, ["Export"]),
        el("button", {class:"btn small danger", html: icons.trash, onclick: ()=>deleteRuleset(r.id)}, ["Delete"])
      ]),
      probs.length ? el("div", {class:"small", style:"margin-top:8px"}, probs.slice(0,3).map(p=>`${p.level.toUpperCase()}: ${p.msg}`).join(" | ")) : null
    ]);
    list.appendChild(row);
  }
  cont.appendChild(list);

  cont.appendChild(el("div", {class:"card soft"}, [
    el("div", {style:"font-weight:900"}, "Ruleset format"),
    el("div", {class:"small", style:"margin-top:8px"}, "A ruleset defines classes, progression-by-level, and option pools (spells, infusions, feats, etc.). Use the included template and edit it offline."),
    el("div", {class:"small"}, "Tip: Keep the actual copyrighted content in a private JSON on your device, not in the repo.")
  ]));

  return shell(cont);
}

function exportRuleset(rs){
  const filename = `${safeName(rs?.meta?.name || rs?.meta?.id || "ruleset")}.ruleset.json`;
  const blob = new Blob([JSON.stringify(rs, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 3000);
}

async function deleteRuleset(id){
  const body = el("div", {}, [
    el("div", {class:"small"}, "Delete this ruleset from this device?"),
  ]);
  const footer = el("div", {class:"hstack"}, [
    el("button", {class:"btn", onclick: ()=>m.close()}, ["Cancel"]),
    el("button", {class:"btn danger", html: icons.trash, onclick: async ()=>{
      await idb.del("rulesets", id);
      if(state.rulesetId === id){
        await setActiveRuleset(null);
        state.rulesetId = null;
        state.ruleset = null;
      }
      await refreshRulesets();
      toast("Deleted", "Ruleset removed locally.");
      m.close();
      go("/rulesets");
    }}, ["Delete"])
  ]);
  const m = modal({title:"Delete Ruleset", body, footer});
}

function importRulesetModal(){
  const body = el("div", {}, [
    el("div", {class:"small"}, "Import a ruleset JSON. It will be stored locally (IndexedDB) on this device/browser."),
    el("input", {class:"input", type:"file", accept:"application/json", id:"rs_import", style:"margin-top:10px"})
  ]);
  const footer = el("div", {class:"hstack"}, [
    el("button", {class:"btn", onclick: ()=>m.close()}, ["Cancel"]),
    el("button", {class:"btn primary", html: icons.upload, onclick: async ()=>{
      const f = qs("#rs_import", m.wrap).files?.[0];
      if(!f){ toast("No file", "Pick a ruleset JSON."); return; }
      let rs;
      try{
        rs = JSON.parse(await f.text());
      }catch(e){
        toast("Invalid JSON", "That file isn't valid JSON.");
        return;
      }
      const probs = validateRuleset(rs);
      if(probs.some(p=>p.level==="error")){
        toast("Ruleset invalid", probs.filter(p=>p.level==="error")[0].msg);
        return;
      }
      const id = rs.meta.id;
      await idb.put("rulesets", {id, meta: rs.meta, data: rs, importedAt: Date.now()});
      await setActiveRuleset(id);
      await refreshRulesets();
      toast("Ruleset imported", rs.meta.name || id);
      m.close();
      go("/home");
    }}, ["Import"])
  ]);
  const m = modal({title:"Import Ruleset", body, footer});
}

async function Settings(){
  const cont = el("div", {}, []);
  cont.appendChild(pageTitle("Settings", "Local-only knobs. No accounts. No cloud. No nonsense.", []));

  const card = el("div", {class:"card"}, [
    el("div", {style:"font-weight:900"}, "Backup / Restore"),
    el("div", {class:"grid cols2", style:"margin-top:10px"}, [
      el("button", {class:"btn block", html: icons.download, onclick: ()=>exportCharacter()}, ["Export active character"]),
      el("button", {class:"btn block", html: icons.upload, onclick: ()=>importCharacterModal()}, ["Import character"]),
      el("button", {class:"btn block", html: icons.download, onclick: ()=>exportRuleset(state.ruleset)}, ["Export active ruleset"]),
      el("button", {class:"btn block", html: icons.upload, onclick: ()=>importRulesetModal()}, ["Import ruleset"]),
    ]),
    el("hr", {class:"sep"}),
    el("div", {style:"font-weight:900"}, "Danger Zone"),
    el("div", {class:"small", style:"margin-top:8px"}, "This deletes EVERYTHING stored in this browser for this site."),
    el("button", {class:"btn danger", style:"margin-top:10px", html: icons.trash, onclick: ()=>nukeAll()}, ["Reset all local data"])
  ]);

  cont.appendChild(card);
  return shell(cont);
}

async function renameCharacter(){
  const ch = state.character;
  if(!ch){ toast("No character", "Select one first."); return; }
  const body = el("div", {}, [
    field("New name", el("input", {class:"input", id:"rn", value: ch.name || ""}))
  ]);
  const footer = el("div", {class:"hstack"}, [
    el("button", {class:"btn", onclick: ()=>m.close()}, ["Cancel"]),
    el("button", {class:"btn primary", onclick: async ()=>{
      const name = qs("#rn", m.wrap).value.trim();
      if(!name){ toast("No name", "Give it a name."); return; }
      const copy = structuredClone(ch);
      copy.name = name;
      copy.updatedAt = Date.now();
      await saveCharacter(normalizeCharacter(copy, {setActive:true}));
      await refreshCharacters();
      toast("Renamed", name);
      m.close();
      go("/home");
    }}, ["Save"])
  ]);
  const m = modal({title:"Rename Character", body, footer});
}

async function nukeAll(){
  const body = el("div", {}, [
    el("div", {style:"font-weight:900"}, "Reset all local data?"),
    el("div", {class:"small", style:"margin-top:8px"}, "Deletes rulesets, characters, portraits, and settings from THIS browser on THIS device."),
    el("div", {class:"small"}, "Not undoable. Not reversible. Not a good idea unless you're sure.")
  ]);
  const footer = el("div", {class:"hstack"}, [
    el("button", {class:"btn", onclick: ()=>m.close()}, ["Cancel"]),
    el("button", {class:"btn danger", html: icons.trash, onclick: async ()=>{
      await idb.clear("rulesets");
      await idb.clear("characters");
      await idb.clear("portraits");
      await idb.clear("settings");
      toast("Reset", "Local data cleared. Fresh start.");
      m.close();
      location.hash = "#/home";
      location.reload();
    }}, ["Reset"])
  ]);
  const m = modal({title:"Reset Local Data", body, footer});
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

register("/home", Home);
register("/characters", Characters);
register("/sheet", Sheet);
register("/levelup", LevelUp);
register("/rulesets", Rulesets);
register("/settings", Settings);
register("/404", async ()=>shell(el("div", {class:"card"}, "404. You got lost.")));

setRouteCallback(async (path)=>{
  // refresh nav active state by full rerender (router already does)
});

await init();
start();
