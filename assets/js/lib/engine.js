import { getProgressionEntry, scalarAt, spellSlotsAt, profBonus, filterOptions } from "./ruleset.js";

export function deriveCharacter(rs, ch){
  if(!rs || !ch) return { derived:{} };
  const c = rs.classes?.[ch.classId];
  const level = ch.level ?? 1;

  const derived = {};
  derived.proficiencyBonus = profBonus(level);

  // scalars (optional)
  const scalars = c?.scalars || {};
  derived.scalars = {};
  for(const [k,map] of Object.entries(scalars)){
    derived.scalars[k] = scalarAt(map, level, 0);
  }

  // spell slots (optional)
  derived.spellSlots = spellSlotsAt(c?.spellSlots, level);

  // prepared spells formula (optional)
  // rule: prepared = intMod + floor(level/2) etc. You can define in ruleset later.

  return { derived };
}

export function buildLevelUpPlan(rs, ch, nextLevel){
  const entry = getProgressionEntry(rs, ch.classId, nextLevel) || {};
  const plan = {
    nextLevel,
    grants: entry.grants || [],
    choices: entry.choices || [],
    notes: entry.notes || null
  };
  return plan;
}

export function poolByKey(rs, key){
  // "infusions" or "spells.cantrip" etc.
  if(key === "infusions") return rs.infusions || [];
  if(key.startsWith("spells.")){
    const lvl = key.split(".")[1];
    const spells = rs.spells || [];
    if(lvl === "cantrip") return spells.filter(s=>s.level === 0);
    const n = parseInt(lvl,10);
    return spells.filter(s=>s.level === n);
  }
  if(key === "features") return Object.entries(rs.features||{}).map(([id,v])=>({id, ...v, _id:id}));
  if(key === "feats") return rs.feats || [];
  return [];
}

export function applyLevelUp(rs, ch, plan, choiceResults){
  // choiceResults: { choiceId: [selectedIds...] } or similar
  const out = structuredClone(ch);
  out.level = plan.nextLevel;

  out.features = out.features || [];
  for(const f of (plan.grants||[])){
    if(!out.features.includes(f)) out.features.push(f);
  }

  out.choices = out.choices || {};
  out.choicesByLevel = out.choicesByLevel || {};
  out.choicesByLevel[String(plan.nextLevel)] = { plan, choiceResults, at: Date.now() };

  // Store selected options in named buckets (simple default)
  for(const choice of (plan.choices||[])){
    const picked = choiceResults[choice.id] || [];
    if(!out.choices[choice.id]) out.choices[choice.id] = [];
    // overwrite for that level-up choice
    out.choices[choice.id] = picked;
  }

  out.updatedAt = Date.now();
  return out;
}

export function listOptionsForChoice(rs, ch, choice){
  const pool = poolByKey(rs, choice.from);
  const ctx = { level: ch.level ?? 1, classId: ch.classId, subclassId: ch.subclassId };
  return filterOptions(pool, choice.filter || {}, ctx);
}
