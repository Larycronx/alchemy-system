/**
 * ============================================================
 * GERENCIAMENTO DE INVENTÁRIO E INGREDIENTES
 * ============================================================
 * Este arquivo é responsável por:
 *
 * 1. Identificar quais itens do inventário são ingredientes
 * 2. Converter itens em ingredientes normalizados
 * 3. Fazer correspondência entre requisitos de receitas e itens
 * 4. Calcular consumo e restauração de ingredientes
 * 5. Criar novos itens de ingrediente
 *
 * Um item é considerado ingrediente se:
 * - Tem a flag "ingredient" do módulo, OU
 * - Seu nome contém palavras-chave como "erva", "folha", etc.
 *   (se a configuração "ingredientNameFallback" estiver ativa)
 * ============================================================
 */

import { MODULE_ID, PATHS } from "./constants.js";
import { deepClone, getSetting, normalizeText } from "./utils.js";

/**
 * Palavras-chave que identificam itens como ingredientes
 * quando não têm flag explícita.
 */
const FALLBACK_NAMES = [
  "erva", "folha", "raiz", "flor", "cogumelo", "esporo", "cristal", "mineral", "glândula", "glandula",
  "essência", "essencia", "água purificada", "agua purificada", "álcool alquímico", "alcool alquimico",
  "óleo estabilizador", "oleo estabilizador", "ingrediente", "reagente", "componente alquímico"
];

/**
 * Obtém a quantidade disponível de um item.
 * Verifica tanto "system.quantity" quanto "system.uses.value".
 */
export function itemQuantity(item) {
  const value = Number(item?.system?.quantity ?? item?.system?.uses?.value ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Obtém as flags de ingrediente de um item.
 * Suporta tanto o formato moderno (flags do módulo) quanto
 * o legado (flags.alchemy).
 */
export function ingredientFlag(item) {
  // Tenta obter flag moderna
  const modern = item?.getFlag?.(MODULE_ID, "ingredient") ??
    globalThis.foundry?.utils?.getProperty?.(item, `flags.${MODULE_ID}.ingredient`);
  if (modern) return modern === true ? {} : modern;

  // Fallback para formato legado
  const legacy = globalThis.foundry?.utils?.getProperty?.(item, "flags.alchemy") ?? item?.flags?.alchemy;
  if (legacy?.ingredient === false) return null;
  if (legacy?.ingredient || legacy?.category || legacy?.properties) {
    return legacy.ingredient === true ? legacy : (legacy.ingredient ?? legacy);
  }

  return null;
}

/**
 * Verifica se um item é um ingrediente válido.
 * Requer quantidade > 0 e flag ou nome compatível.
 */
export function isIngredient(item) {
  if (!item || itemQuantity(item) <= 0) return false;
  if (ingredientFlag(item)) return true;

  // Fallback por nome (se configurado)
  if (!getSetting("ingredientNameFallback", true)) return false;
  const name = normalizeText(item.name);
  const typeAllowed = ["loot", "consumable", "equipment", "tool"].includes(item.type);
  return typeAllowed && FALLBACK_NAMES.some(keyword => name.includes(normalizeText(keyword)));
}

/**
 * Converte um item em ingrediente normalizado.
 * Inclui propriedades, raridade, potência, toxicidade, etc.
 */
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

/**
 * Obtém todos os ingredientes do inventário de um ator.
 * Retorna lista ordenada por nome.
 */
export function getActorIngredients(actor) {
  if (!actor?.items) return [];
  return Array.from(actor.items)
    .filter(isIngredient)
    .map(toIngredient)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Verifica se um requisito de receita é atendido por um ingrediente.
 * Suporta requisitos por nome específico ou por propriedade.
 */
function requirementMatches(requirement, candidate) {
  if (requirement.mode === "property") {
    const required = (requirement.properties ?? []).map(normalizeText);
    return required.every(property => candidate.normalizedProperties.includes(property));
  }
  return normalizeText(requirement.name) === candidate.normalizedName;
}

/**
 * ============================================================
 * CORRESPONDÊNCIA DE INGREDIENTES
 * ============================================================
 * Faz correspondência um-para-um entre 2–3 requisitos e itens
 * selecionados. Usa backtracking para evitar usar o mesmo
 * documento duas vezes e suporta requisitos por propriedade.
 *
 * Retorna null se não houver correspondência válida.
 * ============================================================
 */
export function matchRecipeIngredients(recipe, selectedIngredients) {
  if (!recipe || !Array.isArray(selectedIngredients) || recipe.ingredients.length !== selectedIngredients.length) {
    return null;
  }

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

/**
 * Encontra a primeira receita que corresponde aos ingredientes selecionados.
 * Pode filtrar por tipo (potion, poison, special).
 */
export function findMatchingRecipe(recipes, selectedIngredients, type = null) {
  for (const recipe of recipes) {
    if (type && type !== "any" && recipe.type !== type) continue;
    const assignments = matchRecipeIngredients(recipe, selectedIngredients);
    if (assignments) return { recipe, assignments };
  }
  return null;
}

/**
 * Verifica é possível fabricar uma receita com o inventário atual.
 * Não consome nada, apenas verifica disponibilidade.
 */
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

/**
 * ============================================================
 * CONSUMO E RESTAURAÇÃO DE INGREDIENTES
 * ============================================================
 * Revalida documentos e devolve atualizações reversíveis.
 * Não exclui itens ao chegar a zero — apenas reduz a quantidade.
 *
 * Se algo falhar, o rollback pode ser feito com restoreConsumption().
 * ============================================================
 */
export function buildConsumption(actor, assignments) {
  const updates = [];
  const rollback = [];

  for (const assignment of assignments) {
    const live = actor.items.get(assignment.ingredient.id);
    if (!live || !isIngredient(live)) {
      throw new Error(`Ingrediente indisponível: ${assignment.ingredient.name}.`);
    }

    const current = itemQuantity(live);
    const amount = Number(assignment.quantity || 1);

    if (!Number.isInteger(amount) || amount < 1 || current < amount) {
      throw new Error(`Quantidade insuficiente de ${live.name}.`);
    }

    updates.push({ _id: live.id, "system.quantity": current - amount });
    rollback.push({ _id: live.id, "system.quantity": current });
  }

  return { updates, rollback };
}

/**
 * Consome ingredientes do inventário.
 * Retorna a operação para possível rollback.
 */
export async function consumeAssignments(actor, assignments) {
  const operation = buildConsumption(actor, assignments);
  if (operation.updates.length) {
    await actor.updateEmbeddedDocuments("Item", operation.updates);
  }
  return operation;
}

/**
 * Restaura ingredientes consumidos (rollback).
 * Usado quando a fabricação falha após o consumo.
 */
export async function restoreConsumption(actor, operation) {
  if (operation?.rollback?.length) {
    await actor.updateEmbeddedDocuments("Item", deepClone(operation.rollback));
  }
}

/**
 * ============================================================
 * CRIAÇÃO DE ITENS DE INGREDIENTE
 * ============================================================
 * Cria um novo item de ingrediente com as flags corretas
 * para ser reconhecido pelo sistema.
 * ============================================================
 */
export function buildIngredientItem(data = {}) {
  return {
    name: String(data.name || "Ingrediente Alquímico"),
    type: String(data.type || "loot"),
    img: String(data.img || PATHS.INGREDIENT_ICON),
    system: {
      quantity: Math.max(1, Number(data.quantity || 1)),
      description: { value: String(data.description || "") }
    },
    flags: {
      [MODULE_ID]: {
        ingredient: {
          category: String(data.category || "Ingrediente"),
          rarity: String(data.rarity || "common"),
          properties: Array.isArray(data.properties) ? data.properties.map(String) : [],
          potency: Number(data.potency || 0),
          toxicity: Number(data.toxicity || 0),
          stability: Number(data.stability || 0),
          tags: Array.isArray(data.tags) ? data.tags.map(String) : []
        }
      }
    }
  };
}

/**
 * Seleciona ingredientes do inventário para satisfazer uma receita.
 * Não consome nada — apenas retorna os itens que seriam usados.
 * Usado pela interface para habilitar/desabilitar botão de craft.
 */
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

// ============================================================
// FIM DO GERENCIAMENTO DE INVENTÁRIO E INGREDIENTES
// ============================================================
// Para adicionar novas funções:
// - Use nomes descritivos em camelCase
// - Adicione comentários JSDoc explicativos
// - Exporte a função para uso em outros módulos
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE INVENTÁRIO E INGREDIENTES
// ============================================================
// Este arquivo é responsável por identificar quais itens do
// inventário são ingredientes, converter itens em ingredientes
// normalizados, fazer correspondência entre requisitos de
// receitas e itens, calcular consumo e restauração de
// ingredientes, e criar novos itens de ingrediente.
// ============================================================
