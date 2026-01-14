export function validateRuleset(rs){
  const problems = [];
  if(!rs || typeof rs !== "object") problems.push({level:"error", msg:"Ruleset is not an object."});
  if(!rs?.meta?.id) problems.push({level:"error", msg:"ruleset.meta.id is required."});
  if(!rs?.meta?.name) problems.push({level:"warn", msg:"ruleset.meta.name is missing (fine, but ugly)."});
  if(!rs?.classes || typeof rs.classes !== "object") problems.push({level:"error", msg:"ruleset.classes is required."});
  return problems;
}

export function listClasses(rs){
  return Object.entries(rs?.classes || {}).map(([id, c])=>({id, ...c}));
}

export function getClass(rs, classId){
  return rs?.classes?.[classId] ?? null;
}

export function getProgressionEntry(rs, classId, level){
  const c = getClass(rs, classId);
  if(!c) return null;
  const p = c.progression || {};
  return p[String(level)] ?? null;
}

export function scalarAt(map, level, fallback=0){
  // map: {"2":4,"6":6,...} returns last value <= level
  if(!map) return fallback;
  const keys = Object.keys(map).map(k=>parseInt(k,10)).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
  let val = fallback;
  for(const k of keys){ if(level >= k) val = map[String(k)]; }
  return val;
}

export function profBonus(level){
  return 2 + Math.floor((Math.max(1, level)-1)/4);
}

export function spellSlotsAt(table, level){
  // table format: {"1":{"1":2},"5":{"1":4,"2":2}} etc. returns merged
  const out = {};
  if(!table) return out;
  const keys = Object.keys(table).map(k=>parseInt(k,10)).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
  for(const k of keys){
    if(level >= k){
      const chunk = table[String(k)] || {};
      for(const [slotLvl, count] of Object.entries(chunk)){
        out[slotLvl] = count;
      }
    }
  }
  return out;
}

export function filterOptions(options, filter={}, ctx={}){
  // filter fields: class, minLevel, tag, tagsAny, tagsAll
  return (options||[]).filter(o=>{
    if(filter.class && !(o.requires?.class === filter.class || (o.lists||[]).includes(filter.class))) return false;
    if(filter.minLevel && (o.requires?.minLevel ?? 1) > filter.minLevel && (ctx.level ?? 1) < (o.requires?.minLevel ?? 1)) {
      // if filter.minLevel is used as constraint, treat as o.requires.minLevel <= ctx.level
    }
    if(ctx.level != null){
      const ml = o.requires?.minLevel;
      if(ml != null && ctx.level < ml) return false;
    }
    if(filter.tag){
      if(!(o.tags||[]).includes(filter.tag)) return false;
    }
    if(filter.tagsAny){
      const want = filter.tagsAny;
      const has = (o.tags||[]);
      if(!want.some(t=>has.includes(t))) return false;
    }
    if(filter.tagsAll){
      const want = filter.tagsAll;
      const has = (o.tags||[]);
      if(!want.every(t=>has.includes(t))) return false;
    }
    // simple classId / subclassId checks
    if(o.requires?.subclass && ctx.subclassId && o.requires.subclass !== ctx.subclassId) return false;
    return true;
  });
}
