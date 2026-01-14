export function profBonus(level){
  if(level>=17) return 6;
  if(level>=13) return 5;
  if(level>=9) return 4;
  if(level>=5) return 3;
  return 2;
}
export function abilityMod(score){ return Math.floor((score-10)/2); }

export function scalarAt(map, level, def=0){
  if(!map) return def;
  const keys = Object.keys(map).map(k=>parseInt(k,10)).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
  let v=def;
  for(const k of keys){ if(level>=k) v=map[String(k)]; }
  return v;
}

export function filterOptions(pool, filter={}, ctx={}){
  let out = pool.slice();
  if(filter.minLevel!=null){
    out = out.filter(it=>{
      const ml = it?.requires?.minLevel ?? it?.minLevel ?? 0;
      return (ctx.level ?? 1) >= (ml || 0);
    });
  }
  if(filter.class){
    out = out.filter(it=>{
      const lists = it.lists || (it.class?[it.class]:[]);
      return Array.isArray(lists) ? lists.includes(filter.class) : false;
    });
  }
  return out;
}

export function poolByKey(rs, key){
  if(!rs) return [];
  if(key==="infusions") return rs.infusions || [];
  if(key==="feats") return rs.feats || [];
  if(key==="features") return Object.entries(rs.features||{}).map(([id,v])=>({id,...v,_id:id}));
  if(key.startsWith("spells.")){
    const lvl = key.split(".")[1];
    const spells = rs.spells || [];
    if(lvl==="cantrip") return spells.filter(s=>s.level===0);
    const n=parseInt(lvl,10);
    return spells.filter(s=>s.level===n);
  }
  return [];
}

export function buildLevelUpPlan(rs, ch, nextLevel){
  const cls = rs?.classes?.[ch.classId];
  const entry = cls?.progression?.[String(nextLevel)] || {};
  return {
    nextLevel,
    grants: entry.grants || [],
    choices: entry.choices || [],
    notes: entry.notes || null
  };
}

export function applyLevelUp(ch, plan, choiceResults){
  const out = structuredClone(ch);
  out.level = plan.nextLevel;
  out.features = out.features || [];
  for(const f of (plan.grants||[])) if(!out.features.includes(f)) out.features.push(f);
  out.choices = out.choices || {};
  out.choicesByLevel = out.choicesByLevel || {};
  out.choicesByLevel[String(plan.nextLevel)] = { plan, choiceResults, at: Date.now() };
  for(const choice of (plan.choices||[])){
    const picked = choiceResults?.[choice.id] || [];
    out.choices[choice.id] = picked;
  }
  out.updatedAt = Date.now();
  return out;
}
