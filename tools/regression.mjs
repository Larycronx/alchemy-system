import assert from "node:assert/strict";
import { DEFAULT_RECIPES, EXPANDED_RECIPES, validateRecipe } from "../scripts/data.js";
assert.equal(DEFAULT_RECIPES.length, 7);
assert.equal(EXPANDED_RECIPES.length, 23);
assert(EXPANDED_RECIPES.some(recipe => recipe.id === "potion-invisibility"));
assert(EXPANDED_RECIPES.some(recipe => recipe.id === "potion-stoneskin"));
for (const recipe of [...DEFAULT_RECIPES, ...EXPANDED_RECIPES]) {
  const validated = validateRecipe(recipe);
  assert([2, 3].includes(validated.ingredients.length));
}
console.log(`Catálogo validado: ${DEFAULT_RECIPES.length + EXPANDED_RECIPES.length} receitas (${EXPANDED_RECIPES.filter(recipe => recipe.type === "potion").length} novas poções, ${EXPANDED_RECIPES.filter(recipe => recipe.type === "poison").length} novos venenos).`);
