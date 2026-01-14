export class Engine{
  constructor({ db }){ this.db = db; }

  validateCharacter(char){
    const c = structuredClone(char || {});
    c.id ||= crypto.randomUUID();
    c.name ||= "Unnamed Character";
    c.rulesetId ||= null;

    c.level = clampInt(c.level ?? 1, 1, 20);

    c.hp ||= { current: 10, max: 10 };
    c.hp.current = clampInt(c.hp.current ?? 10, 0, 9999);
    c.hp.max = clampInt(c.hp.max ?? 10, 1, 9999);

    c.tempHp = clampInt(c.tempHp ?? 0, 0, 9999);

    c.abilities ||= { STR:10, DEX:10, CON:10, INT:10, WIS:10, CHA:10 };
    for(const k of ["STR","DEX","CON","INT","WIS","CHA"]){
      c.abilities[k] = clampInt(c.abilities[k] ?? 10, 1, 30);
    }

    c.ac = clampInt(c.ac ?? 10, 0, 60);
    c.speed = clampInt(c.speed ?? 30, 0, 300);

    c.inventory ||= [];
    c.notes ||= "";

    // portrait: { blobId, mime }
    c.portrait ||= null;

    // advancement selections by level: { "2": { feat:"Lucky" } }
    c.advancement ||= {};

    // features/choices area visible on sheet
    // array of { id, name, level, text, tags[] }
    c.features ||= [];

    // skills proficiency: { acrobatics:0|1|2, ... } 0 none, 1 proficient, 2 expertise
    c.skillProfs ||= {};

    c.createdAt ||= new Date().toISOString();
    c.updatedAt ||= new Date().toISOString();
    return c;
  }

  proficiencyBonus(level){
    // D&D 5e style: 2 at 1-4, 3 at 5-8, 4 at 9-12, 5 at 13-16, 6 at 17-20
    const lvl = clampInt(level ?? 1, 1, 20);
    return 2 + Math.floor((lvl - 1) / 4);
  }

  abilityMod(score){
    const s = clampInt(score ?? 10, 1, 30);
    return Math.floor((s - 10) / 2);
  }

  // ---- Rulesets ----
  async importRulesetFromJsonText(text){
    let obj;
    try{ obj = JSON.parse(text); }catch(_){
      throw new Error("Ruleset JSON is invalid.");
    }
    const id = obj.id || crypto.randomUUID();
    const ruleset = {
      id,
      name: obj.name || "Unnamed Ruleset",
      version: obj.version || "1.0",
      pools: obj.pools || {},
      progression: obj.progression || {},
      raw: obj,
      importedAt: new Date().toISOString(),
    };
    await this.db.putRuleset(ruleset);
    return ruleset;
  }

  getLevelChoices(ruleset, level){
    // supports progression as object keyed by "2" etc
    const prog = ruleset?.progression || ruleset?.raw?.progression || {};
    const block = prog[String(level)] || prog[level] || null;
    return Array.isArray(block?.choices) ? block.choices : [];
  }

  resolvePool(ruleset, poolName){
    const pools = ruleset?.pools || ruleset?.raw?.pools || {};
    const pool = pools[poolName];
    return Array.isArray(pool) ? pool : [];
  }

  // Apply wizard selections to the character in a friendly way
  applyLevelSelections(char, level, selections){
    const c = this.validateCharacter(char);
    const lvl = clampInt(level, 1, 20);
    c.level = lvl;
    c.advancement[String(lvl)] = selections || {};
    c.updatedAt = new Date().toISOString();

    // Mirror into features list so there is "space" on the sheet.
    // We store as readable lines (still editable in UI).
    const lines = [];
    for(const [k,v] of Object.entries(selections || {})){
      if(v == null || v === "") continue;
      if(Array.isArray(v)){
        lines.push(`${k}: ${v.join(", ")}`);
      }else{
        lines.push(`${k}: ${String(v)}`);
      }
    }
    if(lines.length){
      c.features.push({
        id: crypto.randomUUID(),
        name: `Level ${lvl} choices`,
        level: lvl,
        text: lines.join("\n"),
        tags: ["level-up"]
      });
    }

    return c;
  }
}

function clampInt(v, min, max){
  const n = Number.parseInt(String(v), 10);
  if(!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max,n));
}
