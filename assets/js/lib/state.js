import { idb } from "./idb.js";

export const state = {
  ruleset: null,
  rulesetId: null,
  character: null,
  characterId: null,
  characters: [],
  rulesets: [],
};

export async function loadSettings(){
  const a = await idb.get("settings", "activeRulesetId");
  const b = await idb.get("settings", "activeCharacterId");
  state.rulesetId = a?.value ?? null;
  state.characterId = b?.value ?? null;
}

export async function setActiveRuleset(id){
  state.rulesetId = id;
  await idb.put("settings", {key:"activeRulesetId", value:id});
}

export async function setActiveCharacter(id){
  state.characterId = id;
  await idb.put("settings", {key:"activeCharacterId", value:id});
}

export async function refreshRulesets(){
  state.rulesets = (await idb.getAll("rulesets")).sort((x,y)=>(y.importedAt||0)-(x.importedAt||0));
  if(state.rulesetId){
    const r = await idb.get("rulesets", state.rulesetId);
    state.ruleset = r?.data ?? null;
  }else if(state.rulesets[0]){
    await setActiveRuleset(state.rulesets[0].id);
    state.ruleset = state.rulesets[0].data;
  }
}

export async function refreshCharacters(){
  state.characters = (await idb.getAll("characters")).sort((x,y)=>(y.updatedAt||0)-(x.updatedAt||0));
  if(state.characterId){
    const c = await idb.get("characters", state.characterId);
    state.character = c?.data ?? null;
  }else if(state.characters[0]){
    await setActiveCharacter(state.characters[0].id);
    state.character = state.characters[0].data;
  }
}
