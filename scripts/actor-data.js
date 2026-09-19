import { FLAG_KEYS, MAX_HISTORY_HARD_LIMIT, MODULE_ID } from "./constants.js";
import { assertActorPermission, deepClone, getSetting } from "./utils.js";

export function getKnowledge(actor) {
  return Array.from(new Set((actor?.getFlag?.(MODULE_ID, FLAG_KEYS.KNOWLEDGE) ?? []).map(String)));
}

export function knowsRecipe(actor, recipeId) {
  return getKnowledge(actor).includes(String(recipeId));
}

export async function setKnowledge(actor, recipeIds, { gmOverride = false } = {}) {
  if (!gmOverride) assertActorPermission(actor);
  if (gmOverride && !game.user?.isGM) throw new Error("Somente o Mestre pode substituir conhecimentos.");
  const ids = Array.from(new Set((Array.isArray(recipeIds) ? recipeIds : []).map(String))).slice(0, 2000);
  await actor.setFlag(MODULE_ID, FLAG_KEYS.KNOWLEDGE, ids);
  return ids;
}

export async function unlockRecipe(actor, recipeId, options = {}) {
  const knowledge = getKnowledge(actor);
  if (knowledge.includes(String(recipeId))) return false;
  knowledge.push(String(recipeId));
  await setKnowledge(actor, knowledge, options);
  Hooks.callAll("onRecipeDiscovered", actor, String(recipeId), options);
  return true;
}

export async function lockRecipe(actor, recipeId, options = {}) {
  return setKnowledge(actor, getKnowledge(actor).filter(id => id !== String(recipeId)), options);
}

export async function clearKnowledge(actor, { gmOverride = false } = {}) {
  return setKnowledge(actor, [], { gmOverride });
}

export async function clearHistory(actor, { gmOverride = false } = {}) {
  if (!gmOverride) assertActorPermission(actor);
  if (gmOverride && !game.user?.isGM) throw new Error("Somente o Mestre pode limpar históricos.");
  await actor.setFlag(MODULE_ID, FLAG_KEYS.HISTORY, []);
  return [];
}

export async function resetProgression(actor, { gmOverride = false } = {}) {
  if (!gmOverride) assertActorPermission(actor);
  if (gmOverride && !game.user?.isGM) throw new Error("Somente o Mestre pode resetar progressão.");
  const progression = { level: 1, xp: 0, specializations: [] };
  await actor.setFlag(MODULE_ID, FLAG_KEYS.PROGRESSION, progression);
  return progression;
}

export function getFavorites(actor) {
  return Array.from(new Set((actor?.getFlag?.(MODULE_ID, FLAG_KEYS.FAVORITES) ?? []).map(String)));
}

export async function toggleFavorite(actor, recipeId) {
  assertActorPermission(actor);
  const set = new Set(getFavorites(actor));
  if (set.has(recipeId)) set.delete(recipeId); else set.add(recipeId);
  const favorites = Array.from(set);
  await actor.setFlag(MODULE_ID, FLAG_KEYS.FAVORITES, favorites);
  return favorites;
}

export function getHistory(actor) {
  const history = actor?.getFlag?.(MODULE_ID, FLAG_KEYS.HISTORY);
  return Array.isArray(history) ? deepClone(history) : [];
}

export async function appendHistory(actor, entry, { gmOverride = false } = {}) {
  if (!gmOverride) assertActorPermission(actor);
  const max = Math.min(MAX_HISTORY_HARD_LIMIT, Math.max(25, Number(getSetting("maxHistory", 200))));
  const history = getHistory(actor);
  history.unshift(deepClone(entry));
  if (history.length > max) history.length = max;
  await actor.setFlag(MODULE_ID, FLAG_KEYS.HISTORY, history);
  return entry;
}

export function getNotes(actor) {
  const notes = actor?.getFlag?.(MODULE_ID, FLAG_KEYS.NOTES);
  return notes && typeof notes === "object" ? deepClone(notes) : { general: "", recipes: {}, ingredients: {} };
}

export async function saveNotes(actor, notes) {
  assertActorPermission(actor);
  const clean = {
    general: String(notes?.general ?? "").slice(0, 20_000),
    recipes: Object.fromEntries(Object.entries(notes?.recipes ?? {}).slice(0, 200).map(([key, value]) => [String(key), String(value).slice(0, 5_000)])),
    ingredients: Object.fromEntries(Object.entries(notes?.ingredients ?? {}).slice(0, 200).map(([key, value]) => [String(key), String(value).slice(0, 5_000)]))
  };
  await actor.setFlag(MODULE_ID, FLAG_KEYS.NOTES, clean);
  return clean;
}

export function getProgression(actor) {
  const current = actor?.getFlag?.(MODULE_ID, FLAG_KEYS.PROGRESSION) ?? {};
  return { level: Math.max(1, Number(current.level || 1)), xp: Math.max(0, Number(current.xp || 0)), specializations: Array.isArray(current.specializations) ? current.specializations : [] };
}

export async function grantAlchemyXp(actor, amount) {
  const progression = getProgression(actor);
  progression.xp += Math.max(0, Number(amount || 0));
  progression.level = Math.max(progression.level, 1 + Math.floor(Math.sqrt(progression.xp / 100)));
  await actor.setFlag(MODULE_ID, FLAG_KEYS.PROGRESSION, progression);
  return progression;
}
