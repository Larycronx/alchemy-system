import { MODULE_ID, PATHS } from "./constants.js";
import { deepClone, getSetting, normalizeText } from "./utils.js";

const FALLBACK_NAMES = [
  "erva", "folha", "raiz", "flor", "cogumelo", "esporo", "cristal", "mineral", "glândula", "glandula",
  "essência", "essencia", "água purificada", "agua purificada", "álcool alquímico", "alcool alquimico",
  "óleo estabilizador", "oleo estabilizador", "ingrediente", "reagente", "componente alquímico"
];

export function itemQuantity(item) {
  const value = Number(item?.system?.quantity ?? item?.system?.uses?.value ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function ingredientFlag(item) {
  const modern = item?.getFlag?.(MODULE_ID, "ingredient") ?? globalThis.foundry?.utils?.getProperty?.(item, `flags.${MODULE_ID}.ingredient`);
  if (modern) return modern === true ? {} : modern;
  const legacy = globalThis.foundry?.utils?.getProperty?.(item, "flags.alchemy") ?? item?.flags?.alchemy;
  if (legacy?.ingredient === false) return null;
  if (legacy?.ingredient || legacy?.category || legacy?.properties) return legacy.ingredient === true ? legacy : (legacy.ingredient ?? legacy);
  return null;
}

export function isIngredient(item) {
  if (!item || itemQuantity(item) <= 0) return false;
  if (ingredientFlag(item)) return true;
  if (!getSetting("ingredientNameFallback", true)) return false;
  const name = normalizeText(item.name);
  const typeAllowed = ["loot", "consumable", "equipment", "tool"].includes(item.type);
  return typeAllowed && FALLBACK_NAMES.some(keyword => name.includes(normalizeText(keyword)));
}

export function toIngredient(item) {
  const flags = ingredientFlag(item) ?? {};
  const properties = Array.from(new Set([
    ...(Array.isArray(flags.properties) ? flags.properties : []),
    ...(Array.isArray(flags.tags) ? flags.tags : []),
    flags.element,
    flags.category
  ].filter(Boolean).map(String)));
  return {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    normalizedName: normalizeText(item.name),
    img: item.img || PATHS.INGREDIENT_ICON,
    quantity: itemQuantity(item),
    category: String(flags.category || "Ingrediente"),
    rarity: String(flags.rarity || item.system?.rarity || "common"),
    properties,
    normalizedProperties: properties.map(normalizeText),
    potency: Number(flags.potency ?? 0),
    toxicity: Number(flags.toxicity ?? 0),
    stability: Number(flags.stability ?? 0),
    item
  };
}

export function getActorIngredients(actor) {
  if (!actor?.items) return [];
  return Array.from(actor.items).filter(isIngredient).map(toIngredient).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function requirementMatches(requirement, candidate) {
  if (requirement.mode === "property") {
    const required = (requirement.properties ?? []).map(normalizeText);
    return required.every(property => candidate.normalizedProperties.includes(property));
  }
  return normalizeText(requirement.name) === candidate.normalizedName;
}

/**
 * Faz correspondência um-para-um entre 2–3 requisitos e itens selecionados.
 * O backtracking evita usar o mesmo documento duas vezes e suporta requisitos por propriedade.
 */
export function matchRecipeIngredients(recipe, selectedIngredients) {
  if (!recipe || !Array.isArray(selectedIngredients) || recipe.ingredients.length !== selectedIngredients.length) return null;
  const used = new Set();
  const assignments = [];
  function visit(index) {
    if (index >= recipe.ingredients.length) return true;
    const requirement = recipe.ingredients[index];
    for (let candidateIndex = 0; candidateIndex < selectedIngredients.length; candidateIndex += 1) {
      if (used.has(candidateIndex)) continue;
      const candidate = selectedIngredients[candidateIndex];
      if (!requirementMatches(requirement, candidate)) continue;
      if (candidate.quantity < Number(requirement.quantity || 1)) continue;
      used.add(candidateIndex);
      assignments.push({ requirement, ingredient: candidate, quantity: Number(requirement.quantity || 1) });
      if (visit(index + 1)) return true;
      assignments.pop();
      used.delete(candidateIndex);
    }
    return false;
  }
  return visit(0) ? assignments : null;
}

export function findMatchingRecipe(recipes, selectedIngredients, type = null) {
  for (const recipe of recipes) {
    if (type && type !== "any" && recipe.type !== type) continue;
    const assignments = matchRecipeIngredients(recipe, selectedIngredients);
    if (assignments) return { recipe, assignments };
  }
  return null;
}

export function canCraftRecipe(recipe, inventory) {
  if (!recipe || !Array.isArray(inventory) || inventory.length < recipe.ingredients.length) return false;
  const used = new Set();
  function visit(index) {
    if (index >= recipe.ingredients.length) return true;
    const requirement = recipe.ingredients[index];
    for (let candidateIndex = 0; candidateIndex < inventory.length; candidateIndex += 1) {
      if (used.has(candidateIndex)) continue;
      const candidate = inventory[candidateIndex];
      if (!requirementMatches(requirement, candidate)) continue;
      if (candidate.quantity < Number(requirement.quantity || 1)) continue;
      used.add(candidateIndex);
      if (visit(index + 1)) return true;
      used.delete(candidateIndex);
    }
    return false;
  }
  return visit(0);
}

/** Revalida documentos e devolve atualizações reversíveis; não exclui itens ao chegar a zero. */
export function buildConsumption(actor, assignments) {
  const updates = [];
  const rollback = [];
  for (const assignment of assignments) {
    const live = actor.items.get(assignment.ingredient.id);
    if (!live || !isIngredient(live)) throw new Error(`Ingrediente indisponível: ${assignment.ingredient.name}.`);
    const current = itemQuantity(live);
    const amount = Number(assignment.quantity || 1);
    if (!Number.isInteger(amount) || amount < 1 || current < amount) throw new Error(`Quantidade insuficiente de ${live.name}.`);
    updates.push({ _id: live.id, "system.quantity": current - amount });
    rollback.push({ _id: live.id, "system.quantity": current });
  }
  return { updates, rollback };
}

export async function consumeAssignments(actor, assignments) {
  const operation = buildConsumption(actor, assignments);
  if (operation.updates.length) await actor.updateEmbeddedDocuments("Item", operation.updates);
  return operation;
}

export async function restoreConsumption(actor, operation) {
  if (operation?.rollback?.length) await actor.updateEmbeddedDocuments("Item", deepClone(operation.rollback));
}

export function buildIngredientItem(data = {}) {
  return {
    name: String(data.name || "Ingrediente Alquímico"),
    type: String(data.type || "loot"),
    img: String(data.img || PATHS.INGREDIENT_ICON),
    system: { quantity: Math.max(1, Number(data.quantity || 1)), description: { value: String(data.description || "") } },
    flags: { [MODULE_ID]: { ingredient: {
      category: String(data.category || "Ingrediente"), rarity: String(data.rarity || "common"),
      properties: Array.isArray(data.properties) ? data.properties.map(String) : [], potency: Number(data.potency || 0),
      toxicity: Number(data.toxicity || 0), stability: Number(data.stability || 0), tags: Array.isArray(data.tags) ? data.tags.map(String) : []
    } } }
  };
}

/** Escolhe documentos do inventário para satisfazer a receita sem consumir nada. */
export function selectIngredientsForRecipe(recipe, inventory) {
  if (!recipe || !Array.isArray(inventory) || inventory.length < recipe.ingredients.length) return null;
  const used = new Set();
  const selected = [];
  function visit(index) {
    if (index >= recipe.ingredients.length) return true;
    const requirement = recipe.ingredients[index];
    for (let candidateIndex = 0; candidateIndex < inventory.length; candidateIndex += 1) {
      if (used.has(candidateIndex)) continue;
      const candidate = inventory[candidateIndex];
      if (!requirementMatches(requirement, candidate) || candidate.quantity < Number(requirement.quantity || 1)) continue;
      used.add(candidateIndex);
      selected.push(candidate);
      if (visit(index + 1)) return true;
      selected.pop();
      used.delete(candidateIndex);
    }
    return false;
  }
  return visit(0) ? selected : null;
}
