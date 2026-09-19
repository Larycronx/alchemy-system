import { MODULE_ID, PATHS, SCHEMA_VERSION } from "./constants.js";
import { clampNumber, deepClone, normalizeText, randomId } from "./utils.js";

const ingredient = (name, quantity = 1, properties = []) => ({ name, quantity, properties, mode: "item" });
const result = (name, description, img, extra = {}) => ({
  name, type: "consumable", img, description, quantity: 1, effects: [], ...extra
});

/** Receitas demonstrativas editáveis pelo Mestre. */
export const DEFAULT_RECIPES = Object.freeze([
  {
    id: "minor-healing-potion", name: "Poção de Cura Menor", type: "potion", category: "Cura", rarity: "common",
    description: "Uma preparação simples que restaura pequenas feridas.", img: PATHS.POTION_ICON, tags: ["cura", "restauradora"],
    ingredients: [ingredient("Erva Vermelha"), ingredient("Água Purificada")],
    result: result("Poção de Cura Menor", "Restaura 2d4 + 2 pontos de vida.", PATHS.POTION_ICON, { formula: "2d4 + 2" }),
    check: { enabled: true, type: "skill", key: "med", dc: 10 }, discoverable: true, secret: false, craftingTime: 0, equipment: []
  },
  {
    id: "healing-potion", name: "Poção de Cura", type: "potion", category: "Cura", rarity: "uncommon",
    description: "Uma poção restauradora concentrada.", img: PATHS.POTION_ICON, tags: ["cura", "restauradora"],
    ingredients: [ingredient("Erva Vermelha", 2), ingredient("Cogumelo Azul"), ingredient("Água Purificada")],
    result: result("Poção de Cura", "Restaura 2d4 + 2 pontos de vida.", PATHS.POTION_ICON, { formula: "2d4 + 2" }),
    check: { enabled: true, type: "skill", key: "med", dc: 15 }, discoverable: true, secret: false, craftingTime: 60, equipment: ["Kit de Alquimista"]
  },
  {
    id: "antidote", name: "Antídoto", type: "potion", category: "Utilidade", rarity: "common",
    description: "Ajuda o organismo a combater toxinas comuns.", img: PATHS.POTION_ICON, tags: ["antidoto", "cura"],
    ingredients: [ingredient("Folha Amarga"), ingredient("Água Purificada")],
    result: result("Antídoto", "Concede vantagem contra um veneno comum, conforme decisão do Mestre.", PATHS.POTION_ICON),
    check: { enabled: true, type: "skill", key: "nat", dc: 10 }, discoverable: true, secret: false, craftingTime: 10, equipment: []
  },
  {
    id: "resistance-potion", name: "Poção de Resistência", type: "potion", category: "Resistência", rarity: "rare",
    description: "Uma essência mineral que protege contra energia elemental.", img: PATHS.POTION_ICON, tags: ["resistencia", "elemental"],
    ingredients: [ingredient("Cristal Elemental"), ingredient("Essência Mágica"), ingredient("Água Purificada")],
    result: result("Poção de Resistência", "Concede resistência elemental conforme o cristal utilizado.", PATHS.POTION_ICON),
    check: { enabled: true, type: "skill", key: "arc", dc: 20 }, discoverable: true, secret: false, craftingTime: 240, equipment: ["Kit de Alquimista"]
  },
  {
    id: "weak-poison", name: "Veneno Fraco", type: "poison", category: "Dano", rarity: "common",
    description: "Toxina básica para aplicação ou ingestão.", img: PATHS.POISON_ICON, tags: ["toxico", "veneno"],
    ingredients: [ingredient("Glândula Tóxica"), ingredient("Álcool Alquímico")],
    result: result("Veneno Fraco", "Uma dose de veneno fraco; CD e dano ficam registrados nas flags.", PATHS.POISON_ICON, { poison: { application: "injury", doses: 1, save: "con", dc: 11, damage: "1d4" } }),
    check: { enabled: true, type: "skill", key: "nat", dc: 10 }, discoverable: true, secret: false, craftingTime: 10, equipment: []
  },
  {
    id: "paralysis-poison", name: "Veneno Paralisante", type: "poison", category: "Paralisia", rarity: "rare",
    description: "Veneno perigoso capaz de enrijecer os músculos.", img: PATHS.POISON_ICON, tags: ["toxico", "paralisante"],
    ingredients: [ingredient("Glândula Tóxica"), ingredient("Raiz Entorpecente"), ingredient("Óleo Estabilizador")],
    result: result("Veneno Paralisante", "Veneno de ferimento que pode impor paralisia, a critério do Mestre.", PATHS.POISON_ICON, { poison: { application: "injury", doses: 1, save: "con", dc: 15, damage: "1d6", conditions: ["paralyzed"] } }),
    check: { enabled: true, type: "skill", key: "med", dc: 20 }, discoverable: true, secret: true, craftingTime: 60, equipment: ["Kit de Alquimista"]
  },
  {
    id: "sleep-poison", name: "Veneno de Sono", type: "poison", category: "Sono", rarity: "uncommon",
    description: "Mistura volátil que induz torpor.", img: PATHS.POISON_ICON, tags: ["sono", "toxico"],
    ingredients: [ingredient("Flor Lunar"), ingredient("Esporo Sonífero"), ingredient("Álcool Alquímico")],
    result: result("Veneno de Sono", "Veneno de ingestão que pode causar sono.", PATHS.POISON_ICON, { poison: { application: "ingested", doses: 1, save: "con", dc: 13, damage: "0", conditions: ["unconscious"] } }),
    check: { enabled: true, type: "skill", key: "nat", dc: 15 }, discoverable: true, secret: false, craftingTime: 30, equipment: []
  }
]);


/** Ingredientes canônicos usados pelo catálogo; o inventário do ator continua sendo a fonte de quantidade. */
export const INGREDIENT_LIBRARY = Object.freeze([
  ["Erva Vermelha", "Erva", ["cura", "natural"]], ["Folha Amarga", "Erva", ["antidoto", "amargo"]],
  ["Flor Lunar", "Floral", ["sono", "luz"]], ["Raiz Entorpecente", "Raiz", ["paralisia", "entorpecente"]],
  ["Raiz de Mandrágora", "Raiz", ["vitalidade", "som"]], ["Cogumelo Azul", "Fungo", ["cura", "arcano"]],
  ["Esporo Sonífero", "Fungo", ["sono", "mental"]], ["Cristal Elemental", "Mineral", ["elemental", "resistencia"]],
  ["Cristal de Quartzo", "Mineral", ["claridade", "arcano"]], ["Pó de Diamante", "Mineral", ["abjuração", "pele"]],
  ["Pó de Esmeralda", "Mineral", ["invisibilidade", "ilusão"]], ["Escama de Dragão", "Monstruoso", ["elemental", "voo"]],
  ["Pena de Águia", "Monstruoso", ["voo", "velocidade"]], ["Olho de Basilisco", "Monstruoso", ["petrificação", "visão"]],
  ["Essência Mágica", "Essência", ["arcano", "potência"]], ["Essência de Sombra", "Essência", ["invisibilidade", "escuridão"]],
  ["Água Purificada", "Líquido", ["líquido", "estável"]], ["Água de Fonte Feérica", "Líquido", ["cura", "encantamento"]],
  ["Álcool Alquímico", "Líquido", ["volátil", "tóxico"]], ["Óleo Estabilizador", "Líquido", ["estável", "veneno"]],
  ["Glândula Tóxica", "Tóxico", ["veneno", "dano"]], ["Veneno de Wyvern", "Tóxico", ["veneno", "perfuração"]],
  ["Veneno de Verme Púrpura", "Tóxico", ["veneno", "corrosivo"]], ["Pó de Drow", "Tóxico", ["sono", "veneno"]],
  ["Sangue de Assassino", "Tóxico", ["veneno", "morte"]]
].map(([name, category, properties]) => ({ name, category, properties, img: PATHS.INGREDIENT_ICON })));

const extraRecipe = (id, name, type, category, rarity, description, ingredients, resultDescription, formula, dc, tags = []) => ({
  id, name, type, category, rarity, description, img: type === "poison" ? PATHS.POISON_ICON : PATHS.POTION_ICON,
  tags, ingredients: ingredients.map(name => ingredient(name)),
  result: result(name, resultDescription, type === "poison" ? PATHS.POISON_ICON : PATHS.POTION_ICON, { formula }),
  check: { enabled: true, type: "skill", key: type === "poison" ? "nat" : "arc", dc }, discoverable: true, secret: false, craftingTime: 60, equipment: ["Kit de Alquimista"]
});

export const EXPANDED_RECIPES = Object.freeze([
  extraRecipe("potion-climbing", "Poção de Escalada", "potion", "Movimento", "common", "A essência torna mãos e pés aderentes por um curto período.", ["Raiz Entorpecente", "Essência Mágica", "Água Purificada"], "Ganha deslocamento de escalada por 1 hora.", "1 hora", 12, ["escalada", "movimento"]),
  extraRecipe("potion-flying", "Poção de Voo", "potion", "Movimento", "veryRare", "Uma poção leve como o ar, feita com penas e essência elemental.", ["Pena de Águia", "Escama de Dragão", "Água de Fonte Feérica"], "Concede deslocamento de voo por 1 hora.", "1 hora", 22, ["voo", "movimento"]),
  extraRecipe("potion-invisibility", "Poção de Invisibilidade", "potion", "Ilusão", "veryRare", "O líquido desaparece do frasco antes mesmo de ser ingerido.", ["Pó de Esmeralda", "Essência de Sombra", "Água Purificada"], "Fica invisível por 1 hora ou até atacar ou conjurar uma magia.", "1 hora", 20, ["invisibilidade", "ilusão"]),
  extraRecipe("potion-stoneskin", "Poção de Pele de Pedra", "potion", "Defesa", "rare", "Uma suspensão mineral que endurece a pele sem impedir movimentos.", ["Pó de Diamante", "Cristal Elemental", "Água Purificada"], "Concede resistência a dano físico não mágico por 1 hora.", "1 hora", 20, ["defesa", "pedra"]),
  extraRecipe("potion-speed", "Poção de Velocidade", "potion", "Movimento", "veryRare", "Bolhas douradas aceleram o coração e os reflexos.", ["Pena de Águia", "Flor Lunar", "Essência Mágica"], "Recebe os benefícios de velocidade por 1 minuto.", "1 minuto", 22, ["velocidade", "aceleração"]),
  extraRecipe("potion-mind-reading", "Poção de Leitura Mental", "potion", "Mental", "rare", "A poção reflete pensamentos como ondas sobre um lago.", ["Cristal de Quartzo", "Flor Lunar", "Essência Mágica"], "Permite perceber pensamentos superficiais por 10 minutos.", "10 minutos", 18, ["mente", "detecção"]),
  extraRecipe("potion-greater-healing", "Poção de Cura Superior", "potion", "Cura", "rare", "Uma versão concentrada das poções restauradoras.", ["Erva Vermelha", "Raiz de Mandrágora", "Água de Fonte Feérica"], "Restaura 4d4 + 4 pontos de vida.", "4d4 + 4", 18, ["cura", "restauradora"]),
  extraRecipe("poison-drow", "Veneno de Drow", "poison", "Sono", "rare", "Toxina escura que induz um sono profundo.", ["Pó de Drow", "Esporo Sonífero", "Óleo Estabilizador"], "Veneno de ferimento; falha na resistência deixa a criatura inconsciente.", "CD 13 CON", 18, ["sono", "veneno"]),
  extraRecipe("poison-wyvern", "Veneno de Wyvern", "poison", "Dano", "veryRare", "Veneno extremamente potente extraído de uma criatura alada.", ["Veneno de Wyvern", "Glândula Tóxica", "Óleo Estabilizador"], "Veneno de ferimento que causa 7d6 de dano de veneno; metade em sucesso.", "7d6", 22, ["dano", "veneno"]),
  extraRecipe("poison-purple-worm", "Veneno de Verme Púrpura", "poison", "Dano", "veryRare", "Uma toxina corrosiva que queima o corpo por dentro.", ["Veneno de Verme Púrpura", "Glândula Tóxica", "Álcool Alquímico"], "Veneno de ingestão ou ferimento que causa 12d6 de dano de veneno.", "12d6", 24, ["dano", "corrosivo"]),
  extraRecipe("poison-assassin", "Veneno de Assassino", "poison", "Morte", "veryRare", "Uma mistura silenciosa, sem cheiro e quase sem sabor.", ["Sangue de Assassino", "Folha Amarga", "Óleo Estabilizador"], "Veneno de ingestão; causa dano e pode deixar o alvo debilitado.", "9d6", 24, ["morte", "veneno"]),
  extraRecipe("potion-heroism", "Poção de Heroísmo", "potion", "Fortalecimento", "rare", "Uma bebida dourada que desperta coragem sobrenatural.", ["Água de Fonte Feérica", "Raiz de Mandrágora", "Essência Mágica"], "Recebe pontos de vida temporários e coragem por 1 hora.", "1 hora", 18, ["coragem", "proteção"]),
  extraRecipe("potion-fire-breath", "Poção de Sopro de Fogo", "potion", "Elemental", "uncommon", "Pequenas brasas flutuam dentro do frasco.", ["Escama de Dragão", "Cristal Elemental", "Álcool Alquímico"], "Pode exalar fogo em uma criatura ou objeto próximo.", "4d6 fogo", 16, ["fogo", "elemental"]),
  extraRecipe("potion-water-breathing", "Poção de Respiração Aquática", "potion", "Movimento", "uncommon", "O líquido tem gosto de água salgada e deixa as pupilas azuladas.", ["Água Purificada", "Essência de Sombra", "Cristal Elemental"], "Permite respirar debaixo d'água por 1 hora.", "1 hora", 14, ["água", "movimento"]),
  extraRecipe("potion-poison-resistance", "Poção de Resistência a Veneno", "potion", "Resistência", "uncommon", "Uma película verde protege o corpo contra toxinas.", ["Folha Amarga", "Glândula Tóxica", "Água Purificada"], "Concede resistência a dano de veneno por 1 hora.", "1 hora", 15, ["veneno", "resistencia"]),
  extraRecipe("potion-supreme-healing", "Poção de Cura Suprema", "potion", "Cura", "veryRare", "A forma mais concentrada da arte restauradora.", ["Erva Vermelha", "Raiz de Mandrágora", "Água de Fonte Feérica"], "Restaura 10d4 + 20 pontos de vida.", "10d4 + 20", 23, ["cura", "restauradora"]),
  extraRecipe("potion-clairvoyance", "Poção de Clarividência", "potion", "Detecção", "rare", "O líquido mostra cenas de lugares distantes.", ["Cristal de Quartzo", "Olho de Basilisco", "Essência Mágica"], "Permite perceber uma área distante por até 10 minutos.", "10 minutos", 20, ["visão", "detecção"]),
  extraRecipe("poison-serpent", "Veneno de Serpente", "poison", "Dano", "common", "Toxina simples, rápida e fácil de ocultar.", ["Glândula Tóxica", "Folha Amarga", "Álcool Alquímico"], "Veneno de ferimento que causa 2d6 de dano de veneno.", "2d6", 13, ["dano", "veneno"]),
  extraRecipe("poison-ghoul", "Veneno de Carniçal", "poison", "Paralisia", "rare", "Uma substância cinzenta que endurece os músculos.", ["Raiz Entorpecente", "Sangue de Assassino", "Óleo Estabilizador"], "Pode impor paralisia por 1 rodada em uma falha.", "CD 15 CON", 19, ["paralisia", "veneno"]),
  extraRecipe("poison-nightmare", "Veneno de Pesadelo", "poison", "Mental", "rare", "A fumaça da mistura provoca visões perturbadoras.", ["Esporo Sonífero", "Essência de Sombra", "Pó de Drow"], "Causa desorientação e desvantagem no próximo teste mental.", "1 hora", 18, ["mental", "sono"]),
  extraRecipe("special-alchemist-fire", "Fogo Alquímico", "special", "Área", "uncommon", "Frasco instável que explode ao atingir uma superfície.", ["Cristal Elemental", "Álcool Alquímico", "Óleo Estabilizador"], "Incendeia uma pequena área e causa dano contínuo.", "2d6 fogo", 15, ["fogo", "área"]),
  extraRecipe("special-smoke-bomb", "Bomba de Fumaça", "special", "Controle", "common", "Uma cápsula libera uma nuvem espessa e irritante.", ["Esporo Sonífero", "Pó de Esmeralda", "Álcool Alquímico"], "Cria uma nuvem de fumaça que obscurece a área por 1 minuto.", "1 minuto", 12, ["fumaça", "controle"]),
  extraRecipe("special-universal-solvent", "Solvente Universal", "special", "Utilidade", "veryRare", "Um líquido que dissolve quase qualquer material não mágico.", ["Pó de Diamante", "Essência Mágica", "Água Purificada"], "Dissolve adesivos, lacres e materiais comuns resistentes.", "1 dose", 22, ["utilidade", "dissolução"])
]);

export function getIngredientLibrary(recipes = getRecipes()) {
  const entries = new Map(INGREDIENT_LIBRARY.map(item => [item.name, deepClone(item)]));
  for (const recipe of recipes) for (const item of recipe.ingredients ?? []) {
    const name = item.mode === "item" ? item.name : item.properties.join(" + ");
    if (!entries.has(name)) entries.set(name, { name, category: item.mode === "property" ? "Propriedade" : "Ingrediente", properties: item.properties ?? [], img: PATHS.INGREDIENT_ICON });
  }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function validateRecipe(source, { strict = true } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Receita inválida: objeto esperado.");
  const recipe = deepClone(source);
  recipe.id = String(recipe.id || randomId()).replace(/[^a-zA-Z0-9_-]/g, "-");
  recipe.name = String(recipe.name || "").trim().slice(0, 120);
  if (!recipe.name) throw new Error("A receita precisa de um nome.");
  recipe.type = ["potion", "poison", "special"].includes(recipe.type) ? recipe.type : "potion";
  recipe.category = String(recipe.category || "Geral").trim().slice(0, 80);
  recipe.rarity = String(recipe.rarity || "common").trim().slice(0, 40);
  recipe.description = String(recipe.description || "").slice(0, 5000);
  recipe.img = String(recipe.img || (recipe.type === "poison" ? PATHS.POISON_ICON : PATHS.POTION_ICON));
  recipe.tags = Array.from(new Set((Array.isArray(recipe.tags) ? recipe.tags : []).map(tag => String(tag).trim()).filter(Boolean))).slice(0, 30);
  if (!Array.isArray(recipe.ingredients) || ![2, 3].includes(recipe.ingredients.length)) throw new Error("Uma receita deve possuir exatamente 2 ou 3 ingredientes.");
  recipe.ingredients = recipe.ingredients.map(entry => {
    const item = typeof entry === "string" ? { name: entry } : deepClone(entry ?? {});
    item.name = String(item.name || "").trim().slice(0, 120);
    item.properties = (Array.isArray(item.properties) ? item.properties : []).map(String).map(v => v.trim()).filter(Boolean).slice(0, 20);
    item.mode = item.mode === "property" ? "property" : "item";
    item.quantity = clampNumber(item.quantity, 1, 999, 1);
    if (item.mode === "item" && !item.name) throw new Error("Todo ingrediente específico precisa de nome.");
    if (item.mode === "property" && !item.properties.length) throw new Error("Um requisito por propriedade precisa de ao menos uma propriedade.");
    return item;
  });
  const output = recipe.result && typeof recipe.result === "object" ? recipe.result : {};
  recipe.result = {
    name: String(output.name || recipe.name).trim().slice(0, 120),
    type: String(output.type || "consumable").trim(),
    img: String(output.img || recipe.img),
    description: String(output.description || recipe.description).slice(0, 5000),
    quantity: clampNumber(output.quantity, 1, 100, 1),
    formula: String(output.formula || "").slice(0, 120),
    effects: Array.isArray(output.effects) ? output.effects.slice(0, 20) : [],
    poison: output.poison && typeof output.poison === "object" ? output.poison : null,
    midiFlags: output.midiFlags && typeof output.midiFlags === "object" ? output.midiFlags : {}
  };
  const check = recipe.check && typeof recipe.check === "object" ? recipe.check : {};
  recipe.check = {
    enabled: Boolean(check.enabled), type: ["skill", "ability", "formula"].includes(check.type) ? check.type : "skill",
    key: String(check.key || "arc").slice(0, 40), dc: clampNumber(check.dc, 1, 40, 10), formula: String(check.formula || "1d20").slice(0, 200)
  };
  recipe.discoverable = recipe.discoverable !== false;
  recipe.secret = Boolean(recipe.secret);
  recipe.craftingTime = clampNumber(recipe.craftingTime, 0, 525600, 0);
  recipe.equipment = (Array.isArray(recipe.equipment) ? recipe.equipment : []).map(String).map(v => v.trim()).filter(Boolean).slice(0, 20);
  if (strict && !recipe.result.name) throw new Error("A receita precisa definir um resultado.");
  return recipe;
}

export function getRecipes() {
  const stored = game.settings.get(MODULE_ID, "recipes");
  return (Array.isArray(stored) && stored.length ? stored : DEFAULT_RECIPES).map(recipe => validateRecipe(recipe, { strict: false }));
}

export function findRecipe(id) {
  return getRecipes().find(recipe => recipe.id === id) ?? null;
}

export async function saveRecipes(recipes) {
  if (!game.user?.isGM) throw new Error("Somente o Mestre pode alterar a biblioteca global.");
  if (!Array.isArray(recipes) || recipes.length > 2000) throw new Error("Biblioteca inválida ou grande demais.");
  const validated = recipes.map(recipe => validateRecipe(recipe));
  const ids = new Set();
  for (const recipe of validated) {
    if (ids.has(recipe.id)) recipe.id = randomId();
    ids.add(recipe.id);
  }
  await game.settings.set(MODULE_ID, "recipes", validated);
  Hooks.callAll("alchemyRecipesUpdated", deepClone(validated));
  return validated;
}

export async function upsertRecipe(recipe) {
  const validated = validateRecipe(recipe);
  const recipes = getRecipes();
  const index = recipes.findIndex(existing => existing.id === validated.id);
  if (index >= 0) recipes[index] = validated;
  else recipes.push(validated);
  await saveRecipes(recipes);
  return validated;
}

export async function deleteRecipe(id) {
  const recipes = getRecipes();
  const filtered = recipes.filter(recipe => recipe.id !== id);
  if (filtered.length === recipes.length) return false;
  await saveRecipes(filtered);
  return true;
}

export async function initializeData() {
  if (!game.user?.isGM) return;
  const version = Number(game.settings.get(MODULE_ID, "schemaVersion") || 0);
  const stored = game.settings.get(MODULE_ID, "recipes");
  if (!Array.isArray(stored) || stored.length === 0) await game.settings.set(MODULE_ID, "recipes", deepClone([...DEFAULT_RECIPES, ...EXPANDED_RECIPES]));
  if (version < SCHEMA_VERSION) {
    const current = getRecipes();
    const ids = new Set(current.map(recipe => recipe.id));
    const migrated = [...current, ...EXPANDED_RECIPES.filter(recipe => !ids.has(recipe.id))].map(recipe => validateRecipe(recipe, { strict: false }));
    await game.settings.set(MODULE_ID, "recipes", migrated);
    await game.settings.set(MODULE_ID, "schemaVersion", SCHEMA_VERSION);
  }
}

export function recipeSearch(recipe, query = "") {
  const needle = normalizeText(query);
  if (!needle) return true;
  return [recipe.name, recipe.category, recipe.rarity, recipe.description, ...(recipe.tags ?? [])].some(value => normalizeText(value).includes(needle));
}
