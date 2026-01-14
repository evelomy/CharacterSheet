export class Engine {
  constructor({ db } = {}) {
    this.db = db || null;

    this.ABILS = ["str", "dex", "con", "int", "wis", "cha"];

    this.SAVES = [
      { key: "str", name: "STR" },
      { key: "dex", name: "DEX" },
      { key: "con", name: "CON" },
      { key: "int", name: "INT" },
      { key: "wis", name: "WIS" },
      { key: "cha", name: "CHA" },
    ];

    this.SKILLS = [
      { key: "acrobatics", name: "Acrobatics", abil: "dex" },
      { key: "animal_handling", name: "Animal Handling", abil: "wis" },
      { key: "arcana", name: "Arcana", abil: "int" },
      { key: "athletics", name: "Athletics", abil: "str" },
      { key: "deception", name: "Deception", abil: "cha" },
      { key: "history", name: "History", abil: "int" },
      { key: "insight", name: "Insight", abil: "wis" },
      { key: "intimidation", name: "Intimidation", abil: "cha" },
      { key: "investigation", name: "Investigation", abil: "int" },
      { key: "medicine", name: "Medicine", abil: "wis" },
      { key: "nature", name: "Nature", abil: "int" },
      { key: "perception", name: "Perception", abil: "wis" },
      { key: "performance", name: "Performance", abil: "cha" },
      { key: "persuasion", name: "Persuasion", abil: "cha" },
      { key: "religion", name: "Religion", abil: "int" },
      { key: "sleight_of_hand", name: "Sleight of Hand", abil: "dex" },
      { key: "stealth", name: "Stealth", abil: "dex" },
      { key: "survival", name: "Survival", abil: "wis" },
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

  newCharacter() {
    return this.validateCharacter({
      id: crypto.randomUUID(),
      name: "New Character",
      rulesetId: "",
      classId: "",
      level: 1,

      hp: { current: 10, max: 10 },
      tempHp: 0,

      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      ac: 10,
      speed: 30,

      inventory: [],
      notes: "",

      portrait: null, // { blobId, mime }

      // Proficiency state
      skillProfs: {}, // skillKey -> 0/1/2
      saveProfs: {},  // abilKey -> boolean

      // Level-up storage
      spells: { cantrips: [], known: [] },
      infusions: { learned: [], infused: [] },
      features: [],

      // advancement[level][choiceId] = [picked ids]
      advancement: {},

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  validateCharacter(raw) {
    const c = structuredClone(raw || {});
    c.id ||= crypto.randomUUID();
    c.name = typeof c.name === "string" ? c.name : "Unnamed Character";

    c.rulesetId = typeof c.rulesetId === "string" ? c.rulesetId : "";
    c.classId = typeof c.classId === "string" ? c.classId : "";
    c.level = this.clampInt(c.level ?? 1, 1, 20);

    c.hp ||= { current: 10, max: 10 };
    c.hp.current = this.clampInt(c.hp.current ?? 10, 0, 9999);
    c.hp.max = this.clampInt(c.hp.max ?? 10, 1, 9999);

    c.tempHp = this.clampInt(c.tempHp ?? 0, 0, 9999);

    c.abilities ||= {};
    for (const k of this.ABILS) c.abilities[k] = this.clampInt(c.abilities[k] ?? 10, 1, 30);

    c.ac = this.clampInt(c.ac ?? 10, 0, 60);
    c.speed = this.clampInt(c.speed ?? 30, 0, 300);

    c.inventory = Array.isArray(c.inventory) ? c.inventory : [];
    c.notes = typeof c.notes === "string" ? c.notes : "";

    c.portrait = c.portrait || null;

    c.skillProfs = c.skillProfs || {};
    c.saveProfs = c.saveProfs || {};

    c.spells = c.spells || { cantrips: [], known: [] };
    c.spells.cantrips = Array.isArray(c.spells.cantrips) ? c.spells.cantrips : [];
    c.spells.known = Array.isArray(c.spells.known) ? c.spells.known : [];

    c.infusions = c.infusions || { learned: [], infused: [] };
    c.infusions.learned = Array.isArray(c.infusions.learned) ? c.infusions.learned : [];
    c.infusions.infused = Array.isArray(c.infusions.infused) ? c.infusions.infused : [];

    c.features = Array.isArray(c.features) ? c.features : [];
    c.advancement = c.advancement || {};

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
      saves[s.key] = mods[s.key] + (c.saveProfs?.[s.key] ? pb : 0);
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

  // -------- Ruleset import (supports meta.name/meta.id/meta.version) --------
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

    if (!this.db) throw new Error("DB not available");
    await this.db.putRuleset(ruleset);
    return ruleset;
  }

  listClasses(ruleset) {
    const raw = ruleset?.raw || {};
    const classes = raw.classes || {};
    return Object.entries(classes).map(([id, c]) => ({
      id,
      name: c?.name || id,
      maxLevel: c?.maxLevel || 20,
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

  // Supported pools: spells.cantrip, infusions
  getChoiceOptions(ruleset, classId, choice, level) {
    const raw = ruleset?.raw || {};
    const from = choice?.from || "";
    const filter = choice?.filter || {};
    const wantClass = filter.class || classId;

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
        .filter(x => Number(x.minLevel ?? 0) <= level)
        .map(x => ({ id: x.id, name: x.name, meta: x.meta || null }));
    }

    return [];
  }

  // Apply one level’s node, once. Produces readable summary and prevents repeats via c.advancement.
  applyProgressionNodeToCharacter(c, ruleset, classId, level, selectionsByChoiceId) {
    const out = this.validateCharacter(c);
    const node = this.getProgression(ruleset, classId, level);

    out.advancement ||= {};
    const levelKey = String(level);
    out.advancement[levelKey] ||= {};

    // If already applied, do nothing (prevents the "level 2 repeated" issue)
    const alreadyApplied = Object.keys(out.advancement[levelKey]).length > 0;
    if (alreadyApplied) {
      out.updatedAt = new Date().toISOString();
      return out;
    }

    if (!node) {
      out.updatedAt = new Date().toISOString();
      return out;
    }

    const raw = ruleset?.raw || {};
    const featuresDict = raw.features || {};

    out.features ||= [];

    // Grants
    const grants = Array.isArray(node.grants) ? node.grants : [];
    for (const gid of grants) {
      const name = featuresDict?.[gid]?.name || gid;
      if (!out.features.some(f => f && f.name === name && Number(f.level) === level && (f.tags || []).includes("grant"))) {
        out.features.push({ id: crypto.randomUUID(), name, level, text: "", tags: ["grant"] });
      }
    }

    // Choices
    const choices = Array.isArray(node.choices) ? node.choices : [];
    const summary = [];

    for (const ch of choices) {
      const choiceId = ch?.id;
      if (!choiceId) continue;

      const picks = Array.isArray(selectionsByChoiceId?.[choiceId])
        ? selectionsByChoiceId[choiceId]
        : (selectionsByChoiceId?.[choiceId] ? [selectionsByChoiceId[choiceId]] : []);

      // Record raw picks
      out.advancement[levelKey][choiceId] = picks;

      // Map ids -> names for readability
      const opts = this.getChoiceOptions(ruleset, classId, ch, level);
      const map = new Map(opts.map(o => [o.id, o.name || o.id]));
      const nice = picks.map(pid => map.get(pid) || pid);

      // Store into known areas (dedupe)
      if (ch.from === "spells.cantrip" || choiceId.includes("cantrip")) {
        for (const pid of picks) if (!out.spells.cantrips.includes(pid)) out.spells.cantrips.push(pid);
      }
      if (ch.from === "infusions" || choiceId.includes("infusion")) {
        for (const pid of picks) if (!out.infusions.learned.includes(pid)) out.infusions.learned.push(pid);
      }

      const title = ch.title || choiceId;
      if (nice.length) summary.push(title + ":\n- " + nice.join("\n- "));
      else summary.push(title + ": (none)");
    }

    if (summary.length) {
      out.features.push({
        id: crypto.randomUUID(),
        name: "Level " + level + " choices",
        level,
        text: summary.join("\n\n"),
        tags: ["choice"],
      });
    }

    out.updatedAt = new Date().toISOString();
    return out;
  }
}
