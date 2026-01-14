export class Engine {
  constructor({ db }) {
    this.db = db;

    this.ABILS = ["str","dex","con","int","wis","cha"];

    this.SAVES = [
      { key: "str", name: "STR" },
      { key: "dex", name: "DEX" },
      { key: "con", name: "CON" },
      { key: "int", name: "INT" },
      { key: "wis", name: "WIS" },
      { key: "cha", name: "CHA" },
    ];

    this.SKILLS = [
      { key:"acrobatics", name:"Acrobatics", abil:"dex" },
      { key:"animal_handling", name:"Animal Handling", abil:"wis" },
      { key:"arcana", name:"Arcana", abil:"int" },
      { key:"athletics", name:"Athletics", abil:"str" },
      { key:"deception", name:"Deception", abil:"cha" },
      { key:"history", name:"History", abil:"int" },
      { key:"insight", name:"Insight", abil:"wis" },
      { key:"intimidation", name:"Intimidation", abil:"cha" },
      { key:"investigation", name:"Investigation", abil:"int" },
      { key:"medicine", name:"Medicine", abil:"wis" },
      { key:"nature", name:"Nature", abil:"int" },
      { key:"perception", name:"Perception", abil:"wis" },
      { key:"performance", name:"Performance", abil:"cha" },
      { key:"persuasion", name:"Persuasion", abil:"cha" },
      { key:"religion", name:"Religion", abil:"int" },
      { key:"sleight_of_hand", name:"Sleight of Hand", abil:"dex" },
      { key:"stealth", name:"Stealth", abil:"dex" },
      { key:"survival", name:"Survival", abil:"wis" },
    ];
  }

  clampInt(v, min, max) {
    const n = Number.parseInt(String(v), 10);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  abilityMod(score) {
    const s = this.clampInt(score ?? 10, 1, 30);
    return Math.floor((s - 10) / 2);
  }

  proficiencyBonus(level) {
    const L = this.clampInt(level ?? 1, 1, 20);
    return 2 + Math.floor((L - 1) / 4);
  }

  validateCharacter(raw) {
    const c = structuredClone(raw || {});
    c.id ||= crypto.randomUUID();
    c.name ||= "Unnamed Character";

    c.rulesetId ||= "";
    c.classId ||= "";               // e.g. "artificer"
    c.level = this.clampInt(c.level ?? 1, 1, 20);

    c.hp ||= { current: 10, max: 10 };
    c.hp.current = this.clampInt(c.hp.current ?? 10, 0, 9999);
    c.hp.max = this.clampInt(c.hp.max ?? 10, 1, 9999);

    c.tempHp = this.clampInt(c.tempHp ?? 0, 0, 9999);

    c.abilities ||= { str:10, dex:10, con:10, int:10, wis:10, cha:10 };
    for (const k of this.ABILS) c.abilities[k] = this.clampInt(c.abilities[k] ?? 10, 1, 30);

    c.ac = this.clampInt(c.ac ?? 10, 0, 60);
    c.speed = this.clampInt(c.speed ?? 30, 0, 300);

    c.inventory ||= [];
    c.notes ||= "";

    // portrait stored in blobs store
    c.portrait ||= null; // { blobId, mime }

    // Skill prof: 0 none, 1 proficient, 2 expertise
    c.skillProfs ||= {};
    // Save prof: boolean
    c.saveProfs ||= {};

    // Places for level-up outcomes
    c.spells ||= { cantrips: [], known: [] };
    c.infusions ||= { learned: [], infused: [] };
    c.features ||= []; // array of { id, name, level, text, tags[] }

    // Raw wizard selections keyed by level
    c.advancement ||= {}; // { "1": { pick_cantrips_lvl1:[...] }, "2":{...} }

    c.createdAt ||= new Date().toISOString();
    c.updatedAt ||= new Date().toISOString();
    return c;
  }

  derived(c) {
    const pb = this.proficiencyBonus(c.level);
    const mods = {};
    for (const k of this.ABILS) mods[k] = this.abilityMod(c.abilities[k]);

    const saves = {};
    for (const s of this.SAVES) {
      const base = mods[s.key];
      const add = c.saveProfs?.[s.key] ? pb : 0;
      saves[s.key] = base + add;
    }

    const skills = {};
    for (const sk of this.SKILLS) {
      const base = mods[sk.abil];
      const rank = Number(c.skillProfs?.[sk.key] ?? 0);
      const add = rank === 1 ? pb : (rank === 2 ? pb * 2 : 0);
      skills[sk.key] = base + add;
    }

    const passivePerception = 10 + (skills.perception ?? mods.wis);

    return { pb, mods, saves, skills, passivePerception };
  }

  // -------- Ruleset import / normalize (YOUR FILE HAS meta.name/meta.id/meta.version) --------
  async importRulesetFromJsonText(text) {
    let obj;
    try { obj = JSON.parse(text); }
    catch { throw new Error("Ruleset JSON is invalid."); }

    const meta = obj.meta || {};
    const id = obj.id || meta.id || crypto.randomUUID();
    const name = obj.name || meta.name || "Unnamed Ruleset";
    const version = obj.version || meta.version || "1.0";

    const ruleset = {
      id,
      name,
      version,
      raw: obj,
      importedAt: new Date().toISOString(),
    };

    await this.db.putRuleset(ruleset);
    return ruleset;
  }

  listClasses(ruleset) {
    const raw = ruleset?.raw || {};
    const classes = raw.classes || {};
    return Object.entries(classes).map(([id, c]) => ({
      id,
      name: c?.name || id,
      maxLevel: c?.maxLevel || 20
    }));
  }

  getClass(ruleset, classId) {
    const raw = ruleset?.raw || {};
    return raw?.classes?.[classId] || null;
  }

  getProgression(ruleset, classId, level) {
    const cls = this.getClass(ruleset, classId);
    if (!cls) return null;
    const prog = cls.progression || {};
    return prog[String(level)] || prog[level] || null;
  }

  // choice.from handlers for your file:
  // - "spells.cantrip" => ruleset.raw.spells where level==0 AND lists includes classId
  // - "infusions" => ruleset.raw.infusions filtered by lists includes classId and minLevel
  getChoiceOptions(ruleset, classId, choice, level) {
    const raw = ruleset?.raw || {};
    const from = choice?.from || "";
    const filter = choice?.filter || {};
    const wantClass = filter.class || classId;
    const minLevel = Number(filter.minLevel ?? 0);

    if (from === "spells.cantrip") {
      const spells = Array.isArray(raw.spells) ? raw.spells : [];
      return spells
        .filter(s => Number(s.level) === 0)
        .filter(s => (s.lists || []).includes(wantClass))
        .map(s => ({ id: s.id, name: s.name }));
    }

    if (from === "infusions") {
      const inf = Array.isArray(raw.infusions) ? raw.infusions : [];
      return inf
        .filter(x => (x.lists || []).includes(wantClass))
        .filter(x => Number(x.minLevel ?? 0) <= Math.max(level, minLevel))
        .map(x => ({ id: x.id, name: x.name, meta: x.meta || null }));
    }

    // fallback: no idea what it is, return empty
    return [];
  }

  // Apply grants/choices into character “spaces”
  applyProgressionNodeToCharacter(c, ruleset, classId, level, selectionsByChoiceId) {
    const out = this.validateCharacter(c);
    const node = this.getProgression(ruleset, classId, level);
    if (!node) {
      out.level = level;
      out.updatedAt = new Date().show?.() ? new Date().toISOString() : new Date().toISOString();
      return out;
    }

    // grants -> features list
    const raw = ruleset?.raw || {};
    const features = raw.features || {};
    const grants = Array.isArray(node.grants) ? node.grants : [];
    for (const gid of grants) {
      const name = features?.[gid]?.name || gid;
      out.features.push({
        id: crypto.randomUUID(),
        name,
        level,
        text: "",
        tags: ["grant"]
      });
    }

    // choices -> store raw and also reflect into cantrips/infusions spaces when recognized
    out.advancement[String(level)] = selectionsByChoiceId || {};

    for (const [choiceId, picks] of Object.entries(selectionsByChoiceId || {})) {
      const pickArr = Array.isArray(picks) ? picks : [picks].filter(Boolean);

      // cantrips
      if (choiceId.includes("cantrip") || choiceId.includes("cantrips")) {
        out.spells ||= { cantrips: [], known: [] };
        for (const pid of pickArr) if (!out.spells.cantrips.includes(pid)) out.spells.cantrips.push(pid);
      }

      // infusions learned
      if (choiceId.includes("infusion") || choiceId.includes("infusions")) {
        out.infusions ||= { learned: [], infused: [] };
        for (const pid of pickArr) if (!out.infusions.learned.includes(pid)) out.infusions.learned.push(pid);
      }

      // Mirror a human-readable entry into Features & Choices
      if (pickArr.length) {
        out.features.push({
          id: crypto.randomUUID(),
          name: `Level ${level} choice`,
          level,
          text: `${choiceId}: ${pickArr.join(", ")}`,
          tags: ["choice"]
        });
      }
    }

    out.level = level;
    out.updatedAt = new Date().toISOString();
    return out;
  }
}
