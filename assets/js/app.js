import { el, modal, toast, qs } from "./lib/ui.js";
import { start, route, go } from "./lib/router.js";
import * as db from "./lib/db.js";
import { profBonus, abilityMod, buildLevelUpPlan, applyLevelUp, poolByKey, filterOptions } from "./lib/engine.js";

const BUILD_ID = "rebuild2-1768422552";

function crashOverlay(err){
  const wrap=document.createElement("div");
  wrap.className="errOverlay";
  wrap.innerHTML = `<h2>App crashed (sorry)</h2>
  <div class="small">Build: ${BUILD_ID}</div>
  <pre>${(err && (err.stack||err.message)) || String(err)}</pre>`;
  document.body.appendChild(wrap);
}

window.addEventListener("error", (e)=>{ crashOverlay(e.error || e.message); });
window.addEventListener("unhandledrejection", (e)=>{ crashOverlay(e.reason); });

const DEFAULT_RULESET = {
  id: "core-empty",
  name: "Empty Ruleset",
  version: "1.0.0",
  classes: {},
  spells: [],
  infusions: []
};

const DEFAULT_CHAR = ()=>({
  id: crypto.randomUUID(),
  name: "New Character",
  classId: null,
  level: 1,
  abilities: {str:10,dex:10,con:10,int:10,wis:10,cha:10},
  hp: {current: 1, max: 1, temp: 0},
  ac: 10,
  speed: 30,
  inventory: [],
  notes: "",
  portrait: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  rulesetId: null,
});

async function loadAppState(){
  const rulesetId = await db.getSetting("activeRulesetId") || DEFAULT_RULESET.id;
  const charId = await db.getSetting("activeCharId") || null;
  const rulesets = await db.getAll("rulesets");
  let rs = rulesets.find(r=>r.id===rulesetId) || null;
  if(!rs){
    rs = DEFAULT_RULESET;
    await db.put("rulesets", rs);
  }
  const chars = await db.getAll("characters");
  const chRec = charId ? chars.find(c=>c.id===charId) : null;
  return { rs, rulesets, chars, ch: chRec?.data || null, activeCharId: charId };
}

async function setActiveRuleset(id){
  await db.setSetting("activeRulesetId", id);
}
async function setActiveCharacter(id){
  await db.setSetting("activeCharId", id);
}

function derivedFor(ch){
  const level = ch.level ?? 1;
  const pb = profBonus(level);
  const mods = {};
  for(const [k,v] of Object.entries(ch.abilities||{})) mods[k]=abilityMod(v);
  const init = mods.dex || 0;
  const spellAtk = pb + (mods.int||0);
  const spellDC = 8 + pb + (mods.int||0);
  return { pb, mods, init, spellAtk, spellDC };
}

function topBar(state){
  const rsSel = el("select", {onchange: async(e)=>{ await setActiveRuleset(e.target.value); location.reload(); }}, [
    ...state.rulesets.map(r=>el("option",{value:r.id, ...(r.id===state.rs.id?{selected:"selected"}:{})},[`${r.name} (${r.id})`]))
  ]);
  const importBtn = el("button",{class:"btn", onclick:()=>openRulesetImport()},["Import Ruleset JSON"]);
  const exportBtn = el("button",{class:"btn", onclick:()=>openRulesetExport(state.rs)},["Export Ruleset"]);
  return el("div",{class:"card row", style:"justify-content:space-between; flex-wrap:wrap"},[
    el("div",{class:"row", style:"flex-wrap:wrap"},[
      el("div",{class:"pill"},[el("b",{},["CharacterSheet"]), el("span",{class:"small"},`Build ${BUILD_ID}`)]),
      rsSel,
    ]),
    el("div",{class:"row", style:"flex-wrap:wrap"},[importBtn, exportBtn])
  ]);
}

function openRulesetImport(){
  const file = el("input",{type:"file", accept:"application/json"});
  const body = el("div",{class:"col"},[
    el("div",{class:"small"},["Pick a ruleset JSON to import. Stored locally in IndexedDB."]),
    file
  ]);
  modal("Import Ruleset", body, [
    el("button",{class:"btn primary", onclick: async()=>{
      const f=file.files?.[0]; if(!f) return toast("No file selected");
      const txt=await f.text();
      const rs=JSON.parse(txt);
      if(!rs.id) rs.id = crypto.randomUUID();
      if(!rs.name) rs.name = rs.id;
      rs.version = rs.version || "1.0.0";
      rs.classes = rs.classes || {};
      rs.spells = rs.spells || [];
      rs.infusions = rs.infusions || [];
      await db.put("rulesets", rs);
      await setActiveRuleset(rs.id);
      toast("Imported ruleset");
      location.reload();
    }},["Import"])
  ]);
}

function openRulesetExport(rs){
  const txt = JSON.stringify(rs, null, 2);
  const blob = new Blob([txt], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = el("a",{href:url, download:`${rs.id}.json`},["Download ruleset JSON"]);
  const body = el("div",{class:"col"},[
    el("div",{class:"small"},["Export will download the active ruleset as JSON."]),
    a
  ]);
  modal("Export Ruleset", body, [
    el("button",{class:"btn primary", onclick:()=>{ a.click(); }},["Download"])
  ]);
}

function homeView(state){
  const list = el("div",{class:"col"},[]);
  for(const rec of state.chars){
    const isActive = rec.id === state.activeCharId;
    list.appendChild(el("div",{class:"card row", style:"justify-content:space-between; align-items:center"},[
      el("div",{class:"col", style:"gap:4px"},[
        el("b",{},[rec.name || "Unnamed"]),
        el("div",{class:"small"},[`id: ${rec.id}`])
      ]),
      el("div",{class:"row", style:"flex-wrap:wrap"},[
        el("span",{class:`badge ${isActive?"ok":""}`},[isActive?"Active":"Saved"]),
        el("button",{class:"btn primary", onclick: async()=>{ await setActiveCharacter(rec.id); go(`/sheet?id=${rec.id}`); }},["Open"]),
        el("button",{class:"btn danger", onclick: async()=>{
          if(!confirm("Delete character?")) return;
          await db.del("characters", rec.id);
          if(isActive) await setActiveCharacter(null);
          location.reload();
        }},["Delete"])
      ])
    ]));
  }
  const createBtn = el("button",{class:"btn primary", onclick:()=>openCreateCharacter(state)},["New Character"]);
  return el("div",{class:"col"},[
    el("div",{class:"card"},[
      el("h2",{},["Characters"]),
      el("div",{class:"small"},["Stored locally (IndexedDB). Each device keeps its own data."]),
      el("div",{style:"margin-top:10px"},[createBtn])
    ]),
    list
  ]);
}

function openCreateCharacter(state){
  const ch = DEFAULT_CHAR();
  const name = el("input",{value:ch.name});
  const classSel = el("select",{},[
    el("option",{value:""},["(no class)"]),
    ...Object.entries(state.rs.classes||{}).map(([id,c])=>el("option",{value:id},[c.name||id]))
  ]);
  const lvl = el("input",{type:"number", min:"1", max:"20", value:String(ch.level)});
  const body = el("div",{class:"grid cols2"},[
    el("div",{class:"col"},[el("div",{class:"small"},["Name"]), name]),
    el("div",{class:"col"},[el("div",{class:"small"},["Class"]), classSel]),
    el("div",{class:"col"},[el("div",{class:"small"},["Level"]), lvl]),
    el("div",{class:"col"},[el("div",{class:"small"},["Ruleset"]), el("div",{class:"pill"},[state.rs.name])]),
  ]);
  modal("New Character", body, [
    el("button",{class:"btn primary", onclick: async()=>{
      ch.name = name.value.trim() || "Character";
      ch.classId = classSel.value || null;
      ch.level = Math.max(1, Math.min(20, parseInt(lvl.value||"1",10)));
      ch.rulesetId = state.rs.id;
      await db.put("characters",{id: ch.id, name: ch.name, data: ch, updatedAt: Date.now()});
      await setActiveCharacter(ch.id);
      go(`/sheet?id=${ch.id}`);
    }},["Create"])
  ]);
}

async function saveCharacter(state, ch){
  ch.updatedAt = Date.now();
  await db.put("characters",{id: ch.id, name: ch.name, data: ch, updatedAt: Date.now(), rulesetId: state.rs.id});
}

function sheetView(state, ch){
  if(!ch) return el("div",{class:"card"},[el("h2",{},["No character selected"]), el("button",{class:"btn primary", onclick:()=>go("/")},["Back"])]);
  const d = derivedFor(ch);

  const portrait = el("img",{class:"portrait", src: ch.portrait || ""});
  if(!ch.portrait) portrait.style.display="none";
  const up = el("input",{type:"file", accept:"image/*", onchange: async(e)=>{
    const f=e.target.files?.[0]; if(!f) return;
    const reader=new FileReader();
    reader.onload=async()=>{ ch.portrait = reader.result; await saveCharacter(state,ch); location.reload(); };
    reader.readAsDataURL(f);
  }});
  const rmPic = el("button",{class:"btn", onclick: async()=>{ ch.portrait=null; await saveCharacter(state,ch); location.reload(); }},["Remove"]);

  // HP controls
  const hpAmt = el("input",{type:"number", value:"5", min:"0"});
  const hpCur = el("input",{type:"number", value:String(ch.hp.current)});
  const hpMax = el("input",{type:"number", value:String(ch.hp.max)});
  const hpTemp = el("input",{type:"number", value:String(ch.hp.temp||0)});

  const applyHP = async(delta)=>{
    const amt = Math.max(0, parseInt(hpAmt.value||"0",10));
    let cur = parseInt(hpCur.value||"0",10);
    let tmp = parseInt(hpTemp.value||"0",10);
    if(delta<0){
      let dmg = amt;
      if(tmp>0){
        const used = Math.min(tmp, dmg);
        tmp -= used;
        dmg -= used;
      }
      cur = Math.max(0, cur - dmg);
    }else{
      cur = Math.min(parseInt(hpMax.value||"0",10), cur + amt);
    }
    ch.hp.current = cur; ch.hp.max = parseInt(hpMax.value||"1",10); ch.hp.temp = tmp;
    await saveCharacter(state,ch);
    location.reload();
  };

  const stats = el("div",{class:"grid cols3"}, Object.entries(ch.abilities).map(([k,v])=>{
    const mod=d.mods[k]||0;
    return el("div",{class:"card"},[
      el("div",{class:"row", style:"justify-content:space-between"},[
        el("b",{},[k.toUpperCase()]),
        el("span",{class:"badge"},[mod>=0?`+${mod}`:`${mod}`])
      ]),
      el("div",{class:"small"},[`Score: ${v}`])
    ]);
  }));

  const header = el("div",{class:"card row", style:"justify-content:space-between; flex-wrap:wrap"},[
    el("div",{class:"row", style:"gap:14px; align-items:center; flex-wrap:wrap"},[
      portrait,
      el("div",{class:"col", style:"gap:6px"},[
        el("h2",{},[ch.name]),
        el("div",{class:"row", style:"flex-wrap:wrap"},[
          el("span",{class:"pill"},[el("b",{},["Class"]), el("span",{class:"small"},[ch.classId? (state.rs.classes?.[ch.classId]?.name||ch.classId):"(none)"])]),
          el("span",{class:"pill"},[el("b",{},["Level"]), el("span",{class:"small"},[String(ch.level)])]),
          el("span",{class:"pill"},[el("b",{},["PB"]), el("span",{class:"small"},[`+${d.pb}`])]),
          el("span",{class:"pill"},[el("b",{},["Init"]), el("span",{class:"small"},[d.init>=0?`+${d.init}`:`${d.init}`])]),
          el("span",{class:"pill"},[el("b",{},["Spell DC"]), el("span",{class:"small"},[String(d.spellDC)])]),
        ])
      ])
    ]),
    el("div",{class:"row", style:"flex-wrap:wrap"},[
      el("button",{class:"btn", onclick:()=>openEditCharacter(state,ch)},["Edit"]),
      el("button",{class:"btn primary", onclick:()=>openLevelUp(state,ch)},["Level Up"]),
      el("button",{class:"btn", onclick:()=>go("/")},["Back"])
    ])
  ]);

  const hpCard = el("div",{class:"card"},[
    el("h3",{},["HP Tracker"]),
    el("div",{class:"grid cols3"},[
      el("div",{},[el("div",{class:"small"},["Current"]), hpCur]),
      el("div",{},[el("div",{class:"small"},["Max"]), hpMax]),
      el("div",{},[el("div",{class:"small"},["Temp"]), hpTemp]),
    ]),
    el("div",{class:"row", style:"margin-top:10px; flex-wrap:wrap"},[
      el("div",{class:"pill"},[el("span",{class:"small"},["Amount"]), hpAmt]),
      el("button",{class:"btn danger", onclick:()=>applyHP(-1)},["Damage"]),
      el("button",{class:"btn primary", onclick:()=>applyHP(+1)},["Heal"]),
      el("button",{class:"btn", onclick: async()=>{ ch.hp.temp=0; await saveCharacter(state,ch); location.reload(); }},["Clear Temp"])
    ])
  ]);

  const defenses = el("div",{class:"card"},[
    el("h3",{},["Defenses"]),
    el("div",{class:"grid cols3"},[
      el("div",{},[el("div",{class:"small"},["AC"]), el("div",{class:"pill"},[String(ch.ac)])]),
      el("div",{},[el("div",{class:"small"},["Speed"]), el("div",{class:"pill"},[String(ch.speed)])]),
      el("div",{},[el("div",{class:"small"},["Spell Attack"]), el("div",{class:"pill"},[d.spellAtk>=0?`+${d.spellAtk}`:`${d.spellAtk}`])]),
    ])
  ]);

  const invList = el("div",{class:"col"},[]);
  for(const [idx,item] of (ch.inventory||[]).entries()){
    invList.appendChild(el("div",{class:"card row", style:"justify-content:space-between; align-items:center"},[
      el("div",{class:"col", style:"gap:4px"},[
        el("b",{},[item.name || "Item"]),
        el("div",{class:"small"},[`qty: ${item.qty || 1}${item.notes?` | ${item.notes}`:""}`])
      ]),
      el("button",{class:"btn danger", onclick: async()=>{
        ch.inventory.splice(idx,1);
        await saveCharacter(state,ch);
        location.reload();
      }},["Remove"])
    ]));
  }
  const addInv = el("button",{class:"btn primary", onclick:()=>openAddInventory(state,ch)},["Add Item"]);
  const invCard = el("div",{class:"card"},[
    el("h3",{},["Inventory"]),
    addInv,
    el("div",{style:"margin-top:10px"},[invList])
  ]);

  const spellsCard = renderSpellSummary(state, ch);
  const infCard = renderInfusionSummary(state, ch);

  return el("div",{class:"col"},[
    header,
    el("div",{class:"grid cols2"},[hpCard, defenses]),
    stats,
    el("div",{class:"grid cols2"},[invCard, el("div",{class:"card"},[
      el("h3",{},["Notes"]),
      el("div",{class:"small"},["Free text."]),
      el("pre",{style:"white-space:pre-wrap; margin:0"},[ch.notes||""])
    ])]),
    el("div",{class:"grid cols2"},[spellsCard, infCard]),
    el("div",{class:"card"},[
      el("h3",{},["Portrait"]),
      el("div",{class:"row", style:"flex-wrap:wrap"},[up, rmPic]),
      el("div",{class:"small", style:"margin-top:8px"},["Stored locally per device in IndexedDB (as a data URL)."])
    ])
  ]);
}

function renderSpellSummary(state, ch){
  const rs=state.rs;
  const spells = rs.spells || [];
  const known = [];
  // accumulate chosen spell picks from choices (generic)
  for(const picks of Object.values(ch.choices||{})){
    for(const id of (picks||[])){
      const s = spells.find(x=>x.id===id || x.name===id);
      if(s) known.push(s);
    }
  }
  const list = el("div",{class:"col"},[]);
  if(!spells.length){
    list.appendChild(el("div",{class:"small"},["No spells in this ruleset."]));
  }else if(!known.length){
    list.appendChild(el("div",{class:"small"},["No selected spells yet (use Level Up choices if ruleset defines them)."]));
  }else{
    for(const s of known.slice(0,30)){
      list.appendChild(el("div",{class:"pill"},[`${s.name} (L${s.level})`]));
    }
    if(known.length>30) list.appendChild(el("div",{class:"small"},[`+${known.length-30} more`]));
  }
  return el("div",{class:"card"},[
    el("h3",{},["Spells (summary)"]),
    list
  ]);
}

function renderInfusionSummary(state, ch){
  const rs=state.rs;
  const inf = rs.infusions || [];
  const picked = (ch.choices||{}).pick_infusions_lvl2 || (ch.choices||{}).infusions || [];
  const list=el("div",{class:"col"},[]);
  if(!inf.length){
    list.appendChild(el("div",{class:"small"},["No infusions in this ruleset."]));
  }else if(!picked.length){
    list.appendChild(el("div",{class:"small"},["No selected infusions yet (use Level Up)."]));
  }else{
    for(const id of picked){
      const it = inf.find(x=>x.id===id || x.name===id);
      list.appendChild(el("div",{class:"pill"},[it?it.name:id]));
    }
  }
  return el("div",{class:"card"},[
    el("h3",{},["Infusions (selected)"]),
    list
  ]);
}

function openAddInventory(state, ch){
  const name=el("input",{});
  const qty=el("input",{type:"number", value:"1", min:"1"});
  const notes=el("input",{});
  const body=el("div",{class:"grid cols2"},[
    el("div",{},[el("div",{class:"small"},["Name"]), name]),
    el("div",{},[el("div",{class:"small"},["Qty"]), qty]),
    el("div",{style:"grid-column:1/-1"},[el("div",{class:"small"},["Notes"]), notes]),
  ]);
  modal("Add Inventory Item", body, [
    el("button",{class:"btn primary", onclick: async()=>{
      ch.inventory = ch.inventory || [];
      ch.inventory.push({name:name.value.trim()||"Item", qty: parseInt(qty.value||"1",10), notes: notes.value.trim()||""});
      await saveCharacter(state,ch);
      location.reload();
    }},["Add"])
  ]);
}

function openEditCharacter(state, ch){
  // normalize
  ch.abilities ??= {str:10,dex:10,con:10,int:10,wis:10,cha:10};
  ch.hp ??= {current:1,max:1,temp:0};
  ch.inventory ??= [];

  const name=el("input",{value: ch.name || ""});
  const cls=el("select",{},[
    el("option",{value:""},["(no class)"]),
    ...Object.entries(state.rs.classes||{}).map(([id,c])=>el("option",{value:id, ...(id===ch.classId?{selected:"selected"}:{})},[c.name||id]))
  ]);
  const lvl=el("input",{type:"number", min:"1", max:"20", value:String(ch.level||1)});
  const ac=el("input",{type:"number", value:String(ch.ac||10)});
  const spd=el("input",{type:"number", value:String(ch.speed||30)});
  const hpmax=el("input",{type:"number", value:String(ch.hp.max||1)});
  const notes=el("textarea",{value: ch.notes || ""});

  const abInputs = {};
  const abGrid = el("div",{class:"grid cols3"}, Object.entries(ch.abilities).map(([k,v])=>{
    const inp=el("input",{type:"number", value:String(v), min:"1", max:"30"});
    abInputs[k]=inp;
    return el("div",{},[el("div",{class:"small"},[k.toUpperCase()]), inp]);
  }));

  const body=el("div",{class:"col"},[
    el("div",{class:"grid cols2"},[
      el("div",{},[el("div",{class:"small"},["Name"]), name]),
      el("div",{},[el("div",{class:"small"},["Class"]), cls]),
      el("div",{},[el("div",{class:"small"},["Level"]), lvl]),
      el("div",{},[el("div",{class:"small"},["AC"]), ac]),
      el("div",{},[el("div",{class:"small"},["Speed"]), spd]),
      el("div",{},[el("div",{class:"small"},["HP Max"]), hpmax]),
    ]),
    el("hr",{}),
    el("h3",{},["Ability Scores"]),
    abGrid,
    el("hr",{}),
    el("h3",{},["Notes"]),
    notes
  ]);

  modal("Edit Character", body, [
    el("button",{class:"btn primary", onclick: async()=>{
      ch.name = name.value.trim() || "Character";
      ch.classId = cls.value || null;
      ch.level = Math.max(1, Math.min(20, parseInt(lvl.value||"1",10)));
      ch.ac = parseInt(ac.value||"10",10);
      ch.speed = parseInt(spd.value||"30",10);
      ch.hp.max = Math.max(1, parseInt(hpmax.value||"1",10));
      // clamp current
      ch.hp.current = Math.min(ch.hp.current||ch.hp.max, ch.hp.max);
      for(const k of Object.keys(ch.abilities)){
        ch.abilities[k] = Math.max(1, Math.min(30, parseInt(abInputs[k].value||"10",10)));
      }
      ch.notes = notes.value;
      await saveCharacter(state, ch);
      toast("Saved");
      location.reload();
    }},["Save"])
  ]);
}

function openLevelUp(state, ch){
  if(!ch.classId) return toast("Set a class first");
  const next = Math.min(20, (ch.level||1)+1);
  const plan = buildLevelUpPlan(state.rs, ch, next);

  const body = el("div",{class:"col"},[
    el("div",{class:"pill"},[el("b",{},["Next level"]), ` ${next}`]),
    el("div",{class:"small"},[`Grants: ${plan.grants.length ? plan.grants.join(", ") : "none"}`]),
  ]);

  const choiceUIs = [];
  const results = {};
  for(const choice of (plan.choices||[])){
    const opts = filterOptions(poolByKey(state.rs, choice.from), choice.filter||{}, {level: next, classId: ch.classId});
    const sel = el("select",{multiple:"multiple", size:String(Math.min(10, Math.max(4, opts.length||4)))});
    for(const o of opts){
      const id = o.id || o.name;
      sel.appendChild(el("option",{value:id},[o.name||id]));
    }
    choiceUIs.push(el("div",{class:"card"},[
      el("b",{},[choice.title || choice.id]),
      el("div",{class:"small"},[choice.help || ""]),
      sel
    ]));
    results[choice.id] = ()=>Array.from(sel.selectedOptions).slice(0, choice.count||999).map(x=>x.value);
  }

  if(!choiceUIs.length){
    body.appendChild(el("div",{class:"card"},[el("div",{class:"small"},["No choices defined for this level in the ruleset."])]));
  }else{
    body.appendChild(el("div",{class:"col"}, choiceUIs));
  }

  modal("Level Up", body, [
    el("button",{class:"btn primary", onclick: async()=>{
      const picked = {};
      for(const choice of (plan.choices||[])) picked[choice.id] = results[choice.id]();
      const updated = applyLevelUp(ch, plan, picked);
      await saveCharacter(state, updated);
      await setActiveCharacter(updated.id);
      toast(`Leveled to ${next}`);
      location.reload();
    }},["Apply"])
  ]);
}

function renderApp(state){
  const r = route();
  const root = qs("#app");
  root.innerHTML = "";
  root.appendChild(topBar(state));

  if(r.path === "/sheet"){
    const id = r.params.get("id") || state.activeCharId;
    const rec = state.chars.find(c=>c.id===id);
    const ch = rec ? rec.data : state.ch;
    root.appendChild(sheetView(state, ch));
  }else{
    root.appendChild(homeView(state));
  }
}

async function main(){
  const state = await loadAppState();
  start(()=>renderApp(state));
}

main();
