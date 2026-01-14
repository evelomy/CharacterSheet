// Ruleset + level-up logic.
// This is intentionally flexible: we accept "good enough" rulesets and don’t hard-crash on missing fields.

export class Engine {
  constructor({ db }) {
    this.db = db;
  }

  async importRulesetFromJsonText(text) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      throw new Error("Ruleset JSON is invalid JSON.");
    }

    // Normalize minimal fields
    const id = obj.id || crypto.randomUUID();
    const ruleset = {
      id,
      name: obj.name || "Unnamed Ruleset",
      version: obj.version || "1.0",
      pools: obj.pools || {}, // optional: { spells: [...], feats:[...], ... }
      progression: obj.progression || {}, // optional: { "1": { choices: [...] }, "2": ... }
      raw: obj, // keep original for future richness
      importedAt: new Date().toISOString(),
    };

    await this.db.putRuleset(ruleset);
    return ruleset;
  }

  // Return choices for a given level based on a ruleset.
  // Expected shape (recommended):
  // progression: {
  //   "2": { choices: [
  //      { key:"feat", label:"Choose a feat", type:"pickOne", pool:"feats" }
  //   ]}
  // }
  getLevelChoices(ruleset, level) {
    const prog = ruleset?.progression || ruleset?.raw?.progression || {};
    const block = prog[String(level)] || prog[level] || null;
    const choices = Array.isArray(block?.choices) ? block.choices : [];
    return choices;
  }

  resolvePool(ruleset, poolName) {
    const pools = ruleset?.pools || ruleset?.raw?.pools || {};
    const pool = pools[poolName];
    return Array.isArray(pool) ? pool : [];
  }

  validateCharacter(char) {
    // basic normalization so UI doesn’t explode
    const c = structuredClone(char || {});
    c.id ||= crypto.randomUUID();
    c.name ||= "Unnamed Character";
    c.rulesetId ||= null;
    c.level ||= 1;

    c.hp ||= { current: 10, max: 10 };
    c.tempHp ||= 0;

    c.abilities ||= { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
    c.ac ||= 10;
    c.speed ||= 30;

    c.inventory ||= [];
    c.notes ||= "";
    c.portrait ||= null; // { mime, blobId? } or { mime, dataUrl } - we store as dataUrl for simplicity

    c.advancement ||= {}; // per-level selections: { "2": { feat:"Lucky" } }

    c.createdAt ||= new Date().toISOString();
    c.updatedAt ||= new Date().toISOString();
    return c;
  }

  applyLevelUp(char, newLevel, selectionsByKey) {
    const c = this.validateCharacter(char);
    const lvl = Number(newLevel);
    if (!Number.isFinite(lvl) || lvl < 1) throw new Error("Invalid level.");
    c.level = lvl;

    if (selectionsByKey && typeof selectionsByKey === "object") {
      c.advancement[String(lvl)] = selectionsByKey;
    }

    c.updatedAt = new Date().toISOString();
    return c;
  }
}
