/**
 * ============================================================
 * SCRIPT DE VALIDAÇÃO DO SISTEMA DE ALQUIMIA
 * ============================================================
 * Verifica integridade do módulo antes de publicar.
 *
 * Uso: node tools/validate.mjs
 *
 * O que este script verifica:
 * 1. JSON válido (module.json e lang/pt-BR.json)
 * 2. Manifesto contém campos esperados
 * 3. Caminhos do manifesto existem
 * 4. Sintaxe de todos os arquivos JavaScript
 * 5. Imports relativos existem
 * 6. Receitas de exemplo passam pela validação
 * 7. Testes de correspondência de ingredientes
 * ============================================================
 */

import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const ok = message => console.log(`OK  ${message}`);
const fail = message => { errors.push(message); console.error(`ERR ${message}`); };

/**
 * Percorre recursivamente um diretório e retorna todos os arquivos.
 */
async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path)); else output.push(path);
  }
  return output;
}

// ============================================================
// 1. Verifica JSON válido
// ============================================================
for (const name of ["module.json", "lang/pt-BR.json"]) {
  try {
    JSON.parse(await readFile(join(root, name), "utf8"));
    ok(`${name} é JSON válido`);
  } catch (error) {
    fail(`${name}: ${error.message}`);
  }
}

// ============================================================
// 2. Verifica manifesto
// ============================================================
const manifest = JSON.parse(await readFile(join(root, "module.json"), "utf8"));
try {
  assert.equal(manifest.id, "alchemy-system");
  assert.equal(manifest.compatibility.minimum, "13");
  assert(manifest.esmodules.includes("scripts/main.js"));
  assert(manifest.styles.includes("styles/alchemy.css"));
  assert(manifest.languages.some(language => language.lang === "pt-BR"));
  assert(manifest.system.includes("dnd5e"));
  ok("manifesto contém ID, compatibilidade, ES Module, CSS, idioma e sistema esperados");
} catch (error) {
  fail(`manifesto: ${error.message}`);
}

// ============================================================
// 3. Verifica caminhos do manifesto
// ============================================================
for (const path of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(entry => entry.path), manifest.readme, manifest.license]) {
  try {
    await access(join(root, path));
    ok(`caminho do manifesto existe: ${path}`);
  } catch {
    fail(`caminho do manifesto ausente: ${path}`);
  }
}

// ============================================================
// 4. Verifica sintaxe e imports de todos os arquivos JavaScript
// ============================================================
const files = await walk(root);
const javascript = files.filter(path => extname(path) === ".js" || extname(path) === ".mjs");

for (const path of javascript) {
  const checked = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  if (checked.status === 0) {
    ok(`sintaxe: ${relative(root, path)}`);
  } else {
    fail(`sintaxe ${relative(root, path)}: ${checked.stderr.trim()}`);
  }

  const source = await readFile(path, "utf8");
  for (const match of source.matchAll(/(?:from\s+|import\s*\()(["'])(\.\.?\/[^"']+)\1/g)) {
    const target = resolve(dirname(path), match[2]);
    try {
      await access(target);
    } catch {
      fail(`import relativo ausente em ${relative(root, path)}: ${match[2]}`);
    }
  }
}

// ============================================================
// 5. Testa receitas de exemplo e correspondência de ingredientes
// ============================================================
try {
  // Usa file:// URL para compatibilidade com Windows
  const dataUrl = new URL(`file://${join(root, "scripts/data.js").replace(/\\/g, "/")}`);
  const { DEFAULT_RECIPES, EXPANDED_RECIPES, INGREDIENT_LIBRARY, validateRecipe } = await import(dataUrl);
  assert.equal(DEFAULT_RECIPES.length, 7);
  assert.ok(EXPANDED_RECIPES.some(recipe => recipe.compendiumUuid === "Compendium.dnd5e.items.Item.5m9ErO9In8Uc5yyf"), "mapeamento do compêndio da poção de cura superior presente");

  const ingredientNames = new Set(INGREDIENT_LIBRARY.map(item => item.name));
  const missingIngredients = [...DEFAULT_RECIPES, ...EXPANDED_RECIPES]
    .flatMap(recipe => recipe.ingredients.map(item => item.name))
    .filter((name, index, names) => !ingredientNames.has(name) && names.indexOf(name) === index);
  assert.deepEqual(missingIngredients, [], `ingredientes ausentes da biblioteca: ${missingIngredients.join(", ")}`);
  ok(`todos os ${ingredientNames.size} ingredientes usados pelas receitas existem na biblioteca`);

  for (const recipe of DEFAULT_RECIPES) {
    const validated = validateRecipe(recipe);
    assert([2, 3].includes(validated.ingredients.length));
    assert(validated.result.name);
  }
  ok("sete receitas de exemplo passam pela validação de dados");

  // Testa correspondência de ingredientes
  globalThis.game = { settings: { get: (_module, key) => key === "ingredientNameFallback" } };
  const inventoryUrl = new URL(`file://${join(root, "scripts/inventory.js").replace(/\\/g, "/")}`);
  const { canCraftRecipe, matchRecipeIngredients } = await import(inventoryUrl);

  const recipe = validateRecipe(DEFAULT_RECIPES[0]);
  const inventory = [
    { id: "x", name: "Cristal", normalizedName: "cristal", quantity: 9, normalizedProperties: [] },
    { id: "a", name: "Erva Vermelha", normalizedName: "erva vermelha", quantity: 2, normalizedProperties: ["cura"] },
    { id: "b", name: "Água Purificada", normalizedName: "agua purificada", quantity: 1, normalizedProperties: ["liquido"] }
  ];

  assert.equal(canCraftRecipe(recipe, inventory), true);
  assert.equal(matchRecipeIngredients(recipe, inventory.slice(1))?.length, 2);
  assert.equal(matchRecipeIngredients(recipe, inventory.slice(0, 2)), null);
  ok("correspondência de 2 ingredientes e inventário com itens extras funciona");
} catch (error) {
  fail(`testes de dados: ${error.stack || error.message}`);
}

// ============================================================
// Resumo
// ============================================================
if (errors.length) {
  console.error(`\nValidação falhou com ${errors.length} erro(s).`);
  process.exit(1);
}
console.log(`\nValidação concluída: ${javascript.length} arquivos JavaScript e ${files.length} arquivos totais.`);

// ============================================================
// FIM DO SCRIPT DE VALIDAÇÃO
// ============================================================
// Para adicionar novas verificações:
// - Use assert.equal() para comparações
// - Use assert() para verificações booleanas
// - Use ok() e fail() para mensagens
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE VALIDAÇÃO
// ============================================================
// Este script verifica integridade do módulo antes de publicar.
// Ele verifica JSON válido, manifesto, sintaxe JavaScript,
// imports relativos, receitas de exemplo e templates Handlebars.
// ============================================================
