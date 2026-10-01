/**
 * ============================================================
 * DADOS DO PERSONAGEM
 * ============================================================
 * Este arquivo gerencia todos os dados específicos do
 * personagem no Sistema de Alquimia:
 *
 * 1. Conhecimento de receitas
 * 2. Histórico de fabricação
 * 3. Anotações do laboratório
 * 4. Favoritos
 * 5. Progressão (XP e nível)
 * 6. Bloqueios temporários
 *
 * Todos os dados são armazenados em flags do ator, usando
 * o ID do módulo como namespace.
 * ============================================================
 */

import { FLAG_KEYS, MAX_HISTORY_HARD_LIMIT, MODULE_ID } from "./constants.js";
import { assertActorPermission, deepClone, getSetting } from "./utils.js";

/**
 * ============================================================
 * CONHECIMENTO DE RECEITAS
 * ============================================================
 * Cada personagem conhece apenas algumas receitas. O Mestre
 * pode liberar receitas manualmente ou o personagem pode
 * descobri-las através de experimentação.
 * ============================================================
 */

/**
 * Obtém a lista de IDs de receitas que o personagem conhece.
 */
export function getKnowledge(actor) {
  return Array.from(new Set((actor?.getFlag?.(MODULE_ID, FLAG_KEYS.KNOWLEDGE) ?? []).map(String)));
}

/**
 * Verifica se o personagem conhece uma receita específica.
 */
export function knowsRecipe(actor, recipeId) {
  return getKnowledge(actor).includes(String(recipeId));
}

/**
 * Define a lista completa de receitas conhecidas.
 * Apenas o Mestre pode substituir o conhecimento.
 */
export async function setKnowledge(actor, recipeIds, { gmOverride = false } = {}) {
  if (!gmOverride) assertActorPermission(actor);
  if (gmOverride && !game.user?.isGM) {
    throw new Error("Somente o Mestre pode substituir conhecimentos.");
  }

  const ids = Array.from(new Set((Array.isArray(recipeIds) ? recipeIds : []).map(String))).slice(0, 2000);
  await actor.setFlag(MODULE_ID, FLAG_KEYS.KNOWLEDGE, ids);
  return ids;
}

/**
 * Adiciona uma receita ao conhecimento do personagem.
 * Dispara o hook "onRecipeDiscovered".
 * Retorna true se a receita foi adicionada, false se já era conhecida.
 */
export async function unlockRecipe(actor, recipeId, options = {}) {
  const knowledge = getKnowledge(actor);
  if (knowledge.includes(String(recipeId))) return false;

  knowledge.push(String(recipeId));
  await setKnowledge(actor, knowledge, options);
  Hooks.callAll("onRecipeDiscovered", actor, String(recipeId), options);
  return true;
}

/**
 * Remove uma receita do conhecimento do personagem.
 */
export async function lockRecipe(actor, recipeId, options = {}) {
  return setKnowledge(actor, getKnowledge(actor).filter(id => id !== String(recipeId)), options);
}

/**
 * Remove todas as receitas do conhecimento do personagem.
 */
export async function clearKnowledge(actor, { gmOverride = false } = {}) {
  return setKnowledge(actor, [], { gmOverride });
}


/**
 * ============================================================
 * HISTÓRICO DE FABRICAÇÃO
 * ============================================================
 * Registra todas as tentativas de fabricação, bem-sucedidas
 * ou não. O histórico é limitado a 200 entradas por padrão
 * (configurável pelo Mestre).
 * ============================================================
 */

/**
 * Limpa o histórico de fabricação do personagem.
 */
export async function clearHistory(actor, { gmOverride = false } = {}) {
  if (!gmOverride) assertActorPermission(actor);
  if (gmOverride && !game.user?.isGM) {
    throw new Error("Somente o Mestre pode limpar históricos.");
  }

  await actor.setFlag(MODULE_ID, FLAG_KEYS.HISTORY, []);
  return [];
}

/**
 * Obtém o histórico de fabricação do personagem.
 */
export function getHistory(actor) {
  const history = actor?.getFlag?.(MODULE_ID, FLAG_KEYS.HISTORY);
  return Array.isArray(history) ? deepClone(history) : [];
}

/**
 * Adiciona uma entrada ao histórico de fabricação.
 * As entradas mais recentes são inseridas no início.
 */
export async function appendHistory(actor, entry, { gmOverride = false } = {}) {
  if (!gmOverride) assertActorPermission(actor);

  const max = Math.min(MAX_HISTORY_HARD_LIMIT, Math.max(25, Number(getSetting("maxHistory", 200))));
  const history = getHistory(actor);
  history.unshift(deepClone(entry));

  if (history.length > max) {
    history.length = max;
  }

  await actor.setFlag(MODULE_ID, FLAG_KEYS.HISTORY, history);
  return entry;
}


/**
 * ============================================================
 * ANOTAÇÕES DO LABORATÓRIO
 * ============================================================
 * Cada personagem pode manter anotações pessoais sobre
 * suas experiências alquímicas.
 * ============================================================
 */

/**
 * Obtém as anotações do personagem.
 */
export function getNotes(actor) {
  const notes = actor?.getFlag?.(MODULE_ID, FLAG_KEYS.NOTES);
  return notes && typeof notes === "object"
    ? deepClone(notes)
    : { general: "", recipes: {}, ingredients: {} };
}

/**
 * Salva as anotações do personagem.
 * Limpa e valida os dados antes de salvar.
 */
export async function saveNotes(actor, notes) {
  assertActorPermission(actor);

  const clean = {
    general: String(notes?.general ?? "").slice(0, 20_000),
    recipes: Object.fromEntries(
      Object.entries(notes?.recipes ?? {}).slice(0, 200).map(([key, value]) => [
        String(key),
        String(value).slice(0, 5_000)
      ])
    ),
    ingredients: Object.fromEntries(
      Object.entries(notes?.ingredients ?? {}).slice(0, 200).map(([key, value]) => [
        String(key),
        String(value).slice(0, 5_000)
      ])
    )
  };

  await actor.setFlag(MODULE_ID, FLAG_KEYS.NOTES, clean);
  return clean;
}


/**
 * ============================================================
 * FAVORITOS
 * ============================================================
 * Receitas favoritas aparecem destacadas na interface.
 * ============================================================
 */

/**
 * Obtém a lista de IDs de receitas favoritas.
 */
export function getFavorites(actor) {
  return Array.from(new Set((actor?.getFlag?.(MODULE_ID, FLAG_KEYS.FAVORITES) ?? []).map(String)));
}

/**
 * Alterna o status de favorito de uma receita.
 */
export async function toggleFavorite(actor, recipeId) {
  assertActorPermission(actor);

  const set = new Set(getFavorites(actor));
  if (set.has(recipeId)) {
    set.delete(recipeId);
  } else {
    set.add(recipeId);
  }

  const favorites = Array.from(set);
  await actor.setFlag(MODULE_ID, FLAG_KEYS.FAVORITES, favorites);
  return favorites;
}


/**
 * ============================================================
 * PROGRESSÃO ALQUÍMICA
 * ============================================================
 * Sistema de XP e níveis. O personagem ganha XP ao fabricar
 * itens. O nível é calculado com base na raiz quadrada do XP.
 *
 * Fórmula: nível = 1 + floor(sqrt(xp / 100))
 *
 * Exemplos:
 * - 0 XP → nível 1
 * - 100 XP → nível 2
 * - 400 XP → nível 3
 * - 900 XP → nível 4
 * ============================================================
 */

/**
 * Obtém a progressão atual do personagem.
 */
export function getProgression(actor) {
  const current = actor?.getFlag?.(MODULE_ID, FLAG_KEYS.PROGRESSION) ?? {};
  return {
    level: Math.max(1, Number(current.level || 1)),
    xp: Math.max(0, Number(current.xp || 0)),
    specializations: Array.isArray(current.specializations) ? current.specializations : []
  };
}

/**
 * Concede XP alquímico ao personagem.
 * Recalcula o nível automaticamente.
 */
export async function grantAlchemyXp(actor, amount) {
  const progression = getProgression(actor);
  progression.xp += Math.max(0, Number(amount || 0));
  progression.level = Math.max(progression.level, 1 + Math.floor(Math.sqrt(progression.xp / 100)));

  await actor.setFlag(MODULE_ID, FLAG_KEYS.PROGRESSION, progression);
  return progression;
}

/**
 * Reseta a progressão alquímica do personagem.
 * Remove todo o XP, volta ao nível 1 e remove especializações.
 */
export async function resetProgression(actor, { gmOverride = false } = {}) {
  if (!gmOverride) assertActorPermission(actor);
  if (gmOverride && !game.user?.isGM) {
    throw new Error("Somente o Mestre pode resetar progressão.");
  }

  const progression = { level: 1, xp: 0, specializations: [] };
  await actor.setFlag(MODULE_ID, FLAG_KEYS.PROGRESSION, progression);
  return progression;
}

// ============================================================
// FIM DOS DADOS DO PERSONAGEM
// ============================================================
// Para adicionar novas funções:
// - Use nomes descritivos em camelCase
// - Adicione comentários JSDoc explicativos
// - Exporte a função para uso em outros módulos
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE DADOS DO PERSONAGEM
// ============================================================
// Este arquivo gerencia todos os dados específicos do
// personagem no Sistema de Alquimia. Todos os dados são
// armazenados em flags do ator, usando o ID do módulo como
// namespace.
// ============================================================
