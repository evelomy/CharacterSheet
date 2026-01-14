import { el, qs, field, modal, toast } from "./lib/ui.js";
import { start, route, go } from "./lib/router.js";
import { getAll, get, put, del as delKey, setSetting, getSetting } from "./lib/db.js";
import { profBonus, abilityMod, scalarAt, poolByKey, filterOptions, buildLevelUpPlan, applyLevelUp } from "./lib/engine.js";

const APP = qs("#app");
const now = ()=>Date.now();

window.addEventListener("error",(e)=>{
  APP.innerHTML = `<div class="shell"><div class="card"><h2>JS Error</h2><div class="small mono">${e.message}\n${e.filename}:${e.lineno}:${e.colno}</div></div></div>`;
});
window.addEventListener("unhandledrejection",(e)=>{
  APP.innerHTML = `<div class="shell"><div class="card"><h2>Promise Rejection</h2><div class="small mono">${(e.reason&&e.reason.stack)||e.reason||e}</div></div></div>`;
});

const DEFAULT_CHAR = ()=>({
  id: crypto.randomUUID?.() || ("ch_"+Math.random().toString(16).slice(2)),
  name: "New Character",
  classId: null,
  subclassId: null,
  level: 1,
  abilities: {str:10,dex:10,con:10,int:10,wis:10,cha:10},
  hp: { current: 1, max: 1, temp: 0 },
  ac: 10,
  speed: 30,
  inventory: [],
  notes: "",
  portrait: null,
  createdAt: now(),
  updatedAt: now()
});

async function loadState(){
  const rulesets = await getAll("rulesets");
  const chars = await getAll("characters");
  const activeCharId = await getSetting("activeCharId");
  const activeRulesetId = await getSetting("activeRulesetId");
  const rs = (activeRulesetId && rulesets.find(r=>r.meta?.id===activeRulesetId)) || rulesets[0] || null;
  const ch = (activeCharId && chars.find(c=>c.id===activeCharId)) || chars[0] || null;
  return { rulesets, chars, rs, ch };
}

function topbar(state){
  const title = state.ch ? state.ch.name : "No character";
  const rsName = state.rs ? state.rs.meta?.name : "No ruleset";
  return el("div",{class:"topbar"},[
    el("div",{class:"brand"},[
      el("div",{class:"badge"}),
      el("div",{},[
        el("h1",{},["CharacterSheet Engine"]),
        el("div",{class:"sub"},[`${title} • ${rsName}`])
      ])
    ]),
    el("div",{class:"actions"},[
      el("button",{class:"btn", onclick:()=>go("/")},["Home"]),
      el("button",{class:"btn primary", onclick:()=>openRulesets(state)},["Rulesets"]),
      el("button",{class:"btn primary", onclick:()=>openNewCharacter(state)},["New"]),
      state.ch ? el("button",{class:"btn", onclick:()=>openEditCharacter(state)},["Edit"]) : null,
      state.ch ? el("button",{class:"btn", onclick:()=>go("/sheet")},["Sheet"]) : null,
    ])
  ]);
}

async function openRulesets(state){
  const list = el("div",{class:"vstack", style:"gap:10px"},[]);
  const refresh = async()=>{
    const s = await loadState();
    list.innerHTML = "";
    if(!s.rulesets.length){
      list.appendChild(el("div",{class:"small"},["No rulesets yet. Import one."]));
    } else {
      for(const r of s.rulesets){
        list.appendChild(el("div",{class:"item row"},[
          el("div",{},[
            el("div",{style:"font-weight:900"},[r.meta?.name || r.meta?.id || "Ruleset"]),
            el("div",{class:"small mono"},[r.meta?.id || ""])
          ]),
          el("div",{class:"hstack"},[
            el("button",{class:"btn", onclick: async()=>{
              await setSetting("activeRulesetId", r.meta?.id);
              toast("Active ruleset set");
              refresh();
            }},["Use"]),
            el("button",{class:"btn danger", onclick: async()=>{
              if(!confirm("Delete ruleset?")) return;
              await delKey("rulesets", r.meta?.id);
              if((await getSetting("activeRulesetId"))===r.meta?.id) await setSetting("activeRulesetId", null);
              toast("Deleted");
              refresh();
            }},["Delete"])
          ])
        ]));
      }
    }
  };

  const file = el("input",{type:"file", accept:"application/json"});
  const importBtn = el("button",{class:"btn primary", onclick: async()=>{
    const f=file.files?.[0];
    if(!f) return toast("Pick a JSON file");
    const txt = await f.text();
    let data;
    try{ data = JSON.parse(txt); }catch(e){ return toast("Invalid JSON"); }
    if(!data?.meta?.id) return toast("Ruleset missing meta.id");
    await put("rulesets", data);
    await setSetting("activeRulesetId", data.meta.id);
    toast("Imported");
    refresh();
  }},["Import"]);

  const body = el("div",{class:"vstack", style:"gap:12px"},[
    el("div",{class:"small"},["Import a ruleset JSON. Stored per-device in IndexedDB."]),
    el("div",{class:"hstack"},[file, importBtn]),
    el("hr",{class:"sep"}),
    list
  ]);
  modal("Rulesets", body, []);
  refresh();
}

async function openNewCharacter(state){
  const s = await loadState();
  const ch = DEFAULT_CHAR();
  await put("characters", ch);
  await setSetting("activeCharId", ch.id);
  toast("Created character");
  go("/sheet");
}

function classOptions(rs){
  const cls = rs?.classes || {};
  return Object.entries(cls).map(([id,v])=>({id,name:v?.name||id}));
}

async function openEditCharacter(state){
  const s = await loadState();
  const ch = structuredClone(s.ch || DEFAULT_CHAR());

  const clsSel = el("select",{class:"input", id:"ed_class"},[
    el("option",{value:""},["(choose class)"]),
    ...classOptions(s.rs).map(c=>el("option",{value:c.id, selected: ch.classId===c.id ? "selected":None},[c.name]))
  ]);

  const nameIn = el("input",{class:"input", id:"ed_name", value: ch.name||""});
  const lvlIn = el("input",{class:"input", id:"ed_level", type:"number", min:"1", max:"20", value:String(ch.level||1)});
  const hpMax = el("input",{class:"input", id:"ed_hpmax", type:"number", min:"1", value:String(ch.hp?.max ?? 1)});
  const hpCur = el("input",{class:"input", id:"ed_hpcur", type:"number", min:"0", value:String(ch.hp?.current ?? 1)});
  const hpTmp = el("input",{class:"input", id:"ed_hptmp", type:"number", min:"0", value:String(ch.hp?.temp ?? 0)});
  const acIn = el("input",{class:"input", id:"ed_ac", type:"number", min:"0", value:String(ch.ac ?? 10)});
  const spdIn = el("input",{class:"input", id:"ed_speed", type:"number", min:"0", value:String(ch.speed ?? 30)});

  const abil = (k)=>el("input",{class:"input", id:"ed_"+k, type:"number", min:"1", max:"30", value:String(ch.abilities?.[k] ?? 10)});

  const file = el("input",{type:"file", accept:"image/*"});
  const img = el("img",{class:"avatar", src: ch.portrait || ""});
  const picRow = el("div",{class:"hstack"},[
    img,
    el("div",{class:"vstack", style:"flex:1"},[
      el("div",{class:"small"},["Portrait (stored locally per device)"]),
      file
    ])
  ]);
  file.addEventListener("change", async()=>{
    const f=file.files?.[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload=()=>{ img.src = reader.result; ch.portrait = reader.result; };
    reader.readAsDataURL(f);
  });

  const notes = el("textarea",{class:"input", id:"ed_notes"},[ch.notes||""]);

  const body = el("div",{class:"grid cols2"},[
    el("div",{class:"card"},[
      el("h2",{},["Basics"]),
      field("Name", nameIn),
      field("Class", clsSel),
      field("Level", lvlIn),
      picRow
    ]),
    el("div",{class:"card"},[
      el("h2",{},["Vitals"]),
      el("div",{class:"grid cols3"},[
        field("HP Max", hpMax),
        field("HP Current", hpCur),
        field("Temp HP", hpTmp),
        field("AC", acIn),
        field("Speed", spdIn),
      ])
    ]),
    el("div",{class:"card", style:"grid-column:1/-1"},[
      el("h2",{},["Ability Scores"]),
      el("div",{class:"grid cols3"},[
        field("STR", abil("str")),
        field("DEX", abil("dex")),
        field("CON", abil("con")),
        field("INT", abil("int")),
        field("WIS", abil("wis")),
        field("CHA", abil("cha")),
      ])
    ]),
    el("div",{class:"card", style:"grid-column:1/-1"},[
      el("h2",{},["Notes"]),
      notes
    ])
  ]);

  const m = modal("Edit Character", body, [
    el("button",{class:"btn danger", onclick: async()=>{
      if(!confirm("Delete this character?")) return;
      await delKey("characters", ch.id);
      const s2=await loadState();
      if((await getSetting("activeCharId"))===ch.id) await setSetting("activeCharId", s2.ch?.id || null);
      toast("Deleted");
      m.back.remove();
      go("/");
    }},["Delete"]),
    el("button",{class:"btn primary", onclick: async()=>{
      ch.name = nameIn.value.trim() || "Character";
      ch.classId = clsSel.value || null;
      ch.level = Math.max(1, Math.min(20, parseInt(lvlIn.value||"1",10)));
      ch.hp = { 
        max: Math.max(1, parseInt(hpMax.value||"1",10)),
        current: Math.max(0, parseInt(hpCur.value||"0",10)),
        temp: Math.max(0, parseInt(hpTmp.value||"0",10))
      };
      ch.hp.current = Math.min(ch.hp.current, ch.hp.max);
      ch.ac = Math.max(0, parseInt(acIn.value||"10",10));
      ch.speed = Math.max(0, parseInt(spdIn.value||"30",10));
      ch.abilities = {
        str: parseInt(qs("#ed_str", m.wrap).value||"10",10),
        dex: parseInt(qs("#ed_dex", m.wrap).value||"10",10),
        con: parseInt(qs("#ed_con", m.wrap).value||"10",10),
        int: parseInt(qs("#ed_int", m.wrap).value||"10",10),
        wis: parseInt(qs("#ed_wis", m.wrap).value||"10",10),
        cha: parseInt(qs("#ed_cha", m.wrap).value||"10",10)
      };
      ch.notes = notes.value || "";
      ch.updatedAt = now();
      await put("characters", ch);
      await setSetting("activeCharId", ch.id);
      toast("Saved");
      m.back.remove();
      go("/sheet");
    }},["Save"])
  ]);
}

function home(state){
  const list = el("div",{class:"list"},[]);
  const body = el("div",{class:"grid cols2"},[
    el("div",{class:"card"},[
      el("h2",{},["Characters"]),
      list
    ]),
    el("div",{class:"card"},[
      el("h2",{},["Quick Start"]),
      el("div",{class:"small"},[
        "1) Import a ruleset (Rulesets button). ",
        "2) Create a character (New). ",
        "3) Edit stats, then use Sheet."
      ])
    ])
  ]);

  if(!state.chars.length){
    list.appendChild(el("div",{class:"small"},["No characters yet. Hit New."]));
  } else {
    for(const c of state.chars){
      list.appendChild(el("div",{class:"item row"},[
        el("div",{class:"hstack"},[
          el("img",{class:"avatar", src: c.portrait || ""}),
          el("div",{},[
            el("div",{style:"font-weight:900"},[c.name || "Character"]),
            el("div",{class:"small"},[`${c.classId||"no class"} • lvl ${c.level||1}`])
          ])
        ]),
        el("div",{class:"hstack"},[
          el("button",{class:"btn", onclick: async()=>{ await setSetting("activeCharId", c.id); toast("Active character set"); go("/sheet"); }},["Open"]),
          el("button",{class:"btn", onclick: async()=>{ await setSetting("activeCharId", c.id); openEditCharacter(state); }},["Edit"])
        ])
      ]));
    }
  }

  return body;
}

function derivedSummary(rs, ch){
  const level = ch.level || 1;
  const pb = profBonus(level);
  const mods = Object.fromEntries(Object.entries(ch.abilities||{}).map(([k,v])=>[k, abilityMod(v)]));
  const spellDC = 8 + pb + (mods.int ?? 0);
  const spellAtk = pb + (mods.int ?? 0);
  return { level, pb, mods, spellDC, spellAtk };
}

async function vitalsActions(state, container){
  const ch = state.ch;
  const amt = el("input",{class:"input", type:"number", min:"0", value:"1", style:"width:110px"});
  const dmgBtn = el("button",{class:"btn danger"},["- Damage"]);
  const healBtn = el("button",{class:"btn"},["+ Heal"]);
  const clearTmp = el("button",{class:"btn"},["Clear Temp"]);
  const refresh = async()=>{
    await put("characters", ch);
    ch.updatedAt = now();
    await put("characters", ch);
    const s = await loadState();
    render(s); // re-render whole view
  };
  dmgBtn.onclick = async()=>{
    const n = Math.max(0, parseInt(amt.value||"0",10));
    const t = Math.min(ch.hp.temp||0, n);
    ch.hp.temp = (ch.hp.temp||0) - t;
    const rem = n - t;
    ch.hp.current = Math.max(0, (ch.hp.current||0) - rem);
    await refresh();
  };
  healBtn.onclick = async()=>{
    const n = Math.max(0, parseInt(amt.value||"0",10));
    ch.hp.current = Math.min(ch.hp.max||1, (ch.hp.current||0) + n);
    await refresh();
  };
  clearTmp.onclick = async()=>{
    ch.hp.temp = 0;
    await refresh();
  };
  container.appendChild(el("div",{class:"hstack"},[
    el("div",{class:"small"},["Amount"]), amt, dmgBtn, healBtn, clearTmp
  ]));
}

function inventoryCard(state){
  const ch = state.ch;
  ch.inventory ??= [];
  const nameIn = el("input",{class:"input", placeholder:"Item name"});
  const qtyIn = el("input",{class:"input", type:"number", min:"1", value:"1", style:"width:100px"});
  const noteIn = el("input",{class:"input", placeholder:"Notes (optional)"});
  const list = el("div",{class:"vstack", style:"gap:10px; margin-top:10px"},[]);
  const refreshList = ()=>{
    list.innerHTML="";
    if(!ch.inventory.length) list.appendChild(el("div",{class:"small"},["No items yet."]));
    else for(const it of ch.inventory){
      list.appendChild(el("div",{class:"item row"},[
        el("div",{},[
          el("div",{style:"font-weight:900"},[`${it.name} ×${it.qty}`]),
          it.note ? el("div",{class:"small"},[it.note]) : null
        ]),
        el("button",{class:"btn danger", onclick: async()=>{
          ch.inventory = ch.inventory.filter(x=>x.id!==it.id);
          ch.updatedAt = now();
          await put("characters", ch);
          refreshList();
        }},["Remove"])
      ]));
    }
  };
  refreshList();
  const add = async()=>{
    const name = nameIn.value.trim();
    if(!name) return toast("Name required");
    const qty = Math.max(1, parseInt(qtyIn.value||"1",10));
    const note = noteIn.value.trim();
    ch.inventory.push({id: crypto.randomUUID?.()||("it_"+Math.random().toString(16).slice(2)), name, qty, note});
    ch.updatedAt = now();
    await put("characters", ch);
    nameIn.value=""; qtyIn.value="1"; noteIn.value="";
    refreshList();
  };
  return el("div",{class:"card"},[
    el("h2",{},["Inventory"]),
    el("div",{class:"hstack"},[
      nameIn, qtyIn, noteIn,
      el("button",{class:"btn primary", onclick:add},["Add"])
    ]),
    list
  ]);
}

function choicesAndFeaturesCard(state){
  const rs = state.rs;
  const ch = state.ch;
  const feats = ch.features || [];
  const list = el("div",{class:"vstack", style:"gap:10px"},[]);
  if(!feats.length) list.appendChild(el("div",{class:"small"},["No features recorded yet (level up will store them)."]));
  else for(const f of feats){
    const obj = rs?.features?.[f];
    list.appendChild(el("div",{class:"item"},[
      el("div",{style:"font-weight:900"},[obj?.name || f]),
      obj?.description ? el("div",{class:"small"},[obj.description]) : null
    ]));
  }
  return el("div",{class:"card"},[
    el("h2",{},["Features"]),
    list
  ]);
}

function spellsCard(state){
  const rs = state.rs;
  const ch = state.ch;
  if(!rs?.spells?.length) return el("div",{class:"card"},[
    el("h2",{},["Spells"]),
    el("div",{class:"small"},["No spells in this ruleset."])
  ]);
  const cantrips = (rs.spells||[]).filter(s=>s.level===0);
  const lvl1 = (rs.spells||[]).filter(s=>s.level===1);
  const list = (title, arr)=>el("div",{class:"vstack", style:"gap:8px"},[
    el("div",{class:"pill"},[title, " • ", String(arr.length)]),
    el("div",{class:"list"}, arr.slice(0, 40).map(s=>el("div",{class:"item"},[
      el("div",{style:"font-weight:900"},[s.name]),
      el("div",{class:"small"},[`${s.meta?.school||""} • ${s.meta?.castingTime||""} • ${s.meta?.range||""}`])
    ])))
  ]);
  return el("div",{class:"card"},[
    el("h2",{},["Spells (preview)"]),
    el("div",{class:"small"},["This engine stores choices on level up. Full spell prep/slots can be layered in later."]),
    el("hr",{class:"sep"}),
    el("div",{class:"grid cols2"},[
      list("Cantrips", cantrips),
      list("Level 1", lvl1),
    ])
  ]);
}

function levelUpCard(state){
  const rs = state.rs;
  const ch = state.ch;
  if(!rs || !ch.classId) return el("div",{class:"card"},[
    el("h2",{},["Level Up"]),
    el("div",{class:"small"},["Set a class in Edit first."])
  ]);
  const nextLevel = Math.min(20, (ch.level||1)+1);
  const plan = buildLevelUpPlan(rs, ch, nextLevel);
  const box = el("div",{class:"vstack", style:"gap:12px"},[]);
  box.appendChild(el("div",{class:"small"},[`Next level: ${nextLevel} • Grants: ${plan.grants.length} • Choices: ${plan.choices.length}`]));
  const picks = {};
  for(const choice of plan.choices){
    const pool = poolByKey(rs, choice.from);
    const opts = filterOptions(pool, choice.filter||{}, {level: nextLevel, classId: ch.classId});
    const sel = el("select",{class:"input", multiple:"multiple", size: Math.min(10, Math.max(4, opts.length))});
    for(const o of opts){
      sel.appendChild(el("option",{value:o.id},[o.name]));
    }
    box.appendChild(el("div",{class:"card"},[
      el("h2",{},[choice.title || choice.id]),
      choice.help ? el("div",{class:"small"},[choice.help]) : null,
      el("div",{class:"small"},[`Pick ${choice.count || 1}`]),
      sel
    ]));
    picks[choice.id] = { sel, count: choice.count||1 };
  }
  const applyBtn = el("button",{class:"btn primary"},["Apply Level Up"]);
  applyBtn.onclick = async()=>{
    const choiceResults = {};
    for(const [id,obj] of Object.entries(picks)){
      const chosen = Array.from(obj.sel.selectedOptions).map(o=>o.value).slice(0, obj.count);
      choiceResults[id]=chosen;
    }
    const updated = applyLevelUp(ch, plan, choiceResults);
    await put("characters", updated);
    await setSetting("activeCharId", updated.id);
    toast("Level up applied");
    go("/sheet");
  };
  box.appendChild(applyBtn);
  return el("div",{class:"card"},[
    el("h2",{},["Level Up"]),
    box
  ]);
}

function sheet(state){
  const rs = state.rs;
  const ch = state.ch;
  if(!ch) return el("div",{class:"card"},[
    el("h2",{},["No character"]),
    el("div",{class:"small"},["Create one with New."])
  ]);

  // ensure defaults
  ch.hp ??= {current:1,max:1,temp:0};
  ch.inventory ??= [];
  ch.abilities ??= {str:10,dex:10,con:10,int:10,wis:10,cha:10};

  const d = derivedSummary(rs, ch);

  const tabs = [
    {id:"overview", label:"Overview"},
    {id:"inventory", label:"Inventory"},
    {id:"features", label:"Features"},
    {id:"spells", label:"Spells"},
    {id:"levelup", label:"Level Up"}
  ];
  let active = state._tab || "overview";

  const tabbar = el("div",{class:"tabbar"}, tabs.map(t=>
    el("div",{class:"tab"+(active===t.id?" active":""), onclick:()=>{ state._tab=t.id; render(state); }},[t.label])
  ));

  const overview = el("div",{class:"grid cols2"},[
    el("div",{class:"card"},[
      el("h2",{},["Vitals"]),
      el("div",{class:"grid cols3"},[
        el("div",{class:"kpi"},[el("div",{class:"label"},"HP"), el("div",{class:"value"}, `${ch.hp.current}/${ch.hp.max}`)]),
        el("div",{class:"kpi"},[el("div",{class:"label"},"Temp HP"), el("div",{class:"value"}, String(ch.hp.temp||0))]),
        el("div",{class:"kpi"},[el("div",{class:"label"},"AC"), el("div",{class:"value"}, String(ch.ac ?? 10))]),
        el("div",{class:"kpi"},[el("div",{class:"label"},"Speed"), el("div",{class:"value"}, String(ch.speed ?? 30))]),
        el("div",{class:"kpi"},[el("div",{class:"label"},"PB"), el("div",{class:"value"}, `+${d.pb}`)]),
        el("div",{class:"kpi"},[el("div",{class:"label"},"Initiative"), el("div",{class:"value"}, `${abilityMod(ch.abilities.dex||10)>=0?"+":""}${abilityMod(ch.abilities.dex||10)}`)]),
      ]),
      el("div",{style:"margin-top:10px"},[])
    ]),
    el("div",{class:"card"},[
      el("h2",{},["Core"]),
      el("div",{class:"hstack"},[
        el("img",{class:"avatar", src: ch.portrait || ""}),
        el("div",{},[
          el("div",{style:"font-weight:900; font-size:18px"},[ch.name]),
          el("div",{class:"small"},[`${ch.classId||"no class"} • Level ${d.level}`]),
          el("div",{class:"pill"},["Spell DC ", el("span",{class:"mono"},String(d.spellDC))]),
          el("div",{class:"pill"},["Spell atk ", el("span",{class:"mono"}, (d.spellAtk>=0?"+":"")+d.spellAtk )]),
        ])
      ]),
      el("hr",{class:"sep"}),
      el("div",{class:"grid cols3"}, Object.entries(ch.abilities).map(([k,v])=>{
        const m=abilityMod(v);
        return el("div",{class:"kpi"},[
          el("div",{class:"label"},k.toUpperCase()),
          el("div",{class:"value"}, String(v)),
          el("div",{class:"small mono"},[(m>=0?"+":"")+m])
        ]);
      }))
    ])
  ]);

  // attach vitals buttons under first vitals card
  const vitalsCard = overview.querySelector(".card");
  vitalsActions(state, vitalsCard);

  const content = el("div",{},[]);
  const setContent = (node)=>{ content.innerHTML=""; content.appendChild(node); };

  if(active==="overview") setContent(overview);
  if(active==="inventory") setContent(inventoryCard(state));
  if(active==="features") setContent(choicesAndFeaturesCard(state));
  if(active==="spells") setContent(spellsCard(state));
  if(active==="levelup") setContent(levelUpCard(state));

  return el("div",{class:"vstack", style:"gap:14px"},[
    tabbar,
    content
  ]);
}

function render(state){
  const r = route();
  const path = r.path;

  const shell = el("div",{class:"shell"},[
    topbar(state),
    path==="/sheet" ? sheet(state) : home(state)
  ]);

  APP.innerHTML="";
  APP.appendChild(shell);
}

start(async()=>{
  const s = await loadState();
  render(s);
});
