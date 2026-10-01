/**
 * ============================================================
 * SCRIPT DE REGRESSÃO DO SISTEMA DE ALQUIMIA
 * ============================================================
 * Valida que o catálogo de receitas está íntegro e que todas
 * as receitas passam pela validação de dados.
 *
 * Uso: node tools/regression.mjs
 *
 * O que este script verifica:
 * 1. Número correto de receitas padrão (7)
 * 2. Número correto de receitas expandidas (30)
 * 3. Receitas específicas existem
 * 4. Todas as receitas passam pela validação
 * 5. Todas as receitas têm 2 ou 3 ingredientes
 * ============================================================
 */

import assert from "node:assert/strict";
import { DEFAULT_RECIPES, EXPANDED_RECIPES, validateRecipe } from "../scripts/data.js";

// Verifica número de receitas padrão
assert.equal(DEFAULT_RECIPES.length, 7);

// Verifica número de receitas expandidas
assert.equal(EXPANDED_RECIPES.length, 30);

// Verifica receitas específicas existem
assert(EXPANDED_RECIPES.some(recipe => recipe.id === "potion-invisibility"));
assert(EXPANDED_RECIPES.some(recipe => recipe.id === "potion-stoneskin"));

// Valida todas as receitas
for (const recipe of [...DEFAULT_RECIPES, ...EXPANDED_RECIPES]) {
  const validated = validateRecipe(recipe);
  assert([2, 3].includes(validated.ingredients.length));
}

console.log(`Catálogo validado: ${DEFAULT_RECIPES.length + EXPANDED_RECIPES.length} receitas (${EXPANDED_RECIPES.filter(recipe => recipe.type === "potion").length} novas poções, ${EXPANDED_RECIPES.filter(recipe => recipe.type === "poison").length} novos venenos).`);

// ============================================================
// FIM DO SCRIPT DE REGRESSÃO
// ============================================================
// Para adicionar novas verificações:
// - Use assert.equal() para comparações
// - Use assert() para verificações booleanas
// - Adicione novas receitas às listas DEFAULT_RECIPES ou EXPANDED_RECIPES
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE REGRESSÃO
// ============================================================
// Este script valida que o catálogo de receitas está íntegro
// e que todas as receitas passam pela validação de dados.
// ============================================================
