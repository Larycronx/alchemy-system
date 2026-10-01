/**
 * ============================================================
 * GERENCIAMENTO DE DADOS E RECEITAS
 * ============================================================
 * Este arquivo é responsável por:
 *
 * 1. Definir receitas padrão e expandidas
 * 2. Validar receitas criadas pelo Mestre
 * 3. Armazenar e recuperar receitas do banco de dados
 * 4. Gerenciar a biblioteca de ingredientes
 * 5. Migrar dados entre versões do módulo
 *
 * As receitas são armazenadas em game.settings com escopo
 * "world", o que significa que são compartilhadas entre todos
 * os jogadores.
 * ============================================================
 */

import { MODULE_ID, PATHS, SCHEMA_VERSION } from "./constants.js";
import { clampNumber, deepClone, normalizeText, randomId } from "./utils.js";

/**
 * Cria um ingrediente de receita.
 * - mode: "item" (nome específico) ou "property" (propriedade)
 * - quantity: quantidade necessária
 * - properties: lista de propriedades (se mode for "property")
 */
const ingredient = (name, quantity = 1, properties = []) => ({
  name,
  quantity,
  properties,
  mode: "item"
});

/**
 * Cria o resultado de uma receita.
 * Inclui nome, descrição, imagem e dados extras (fórmula, poison, etc).
 */
const result = (name, description, img, extra = {}) => ({
  name,
  type: "consumable",
  img,
  description,
  quantity: 1,
  effects: [],
  ...extra
});

/**
 * ============================================================
 * RECEITAS PADRÃO
 * ============================================================
 * Estas receitas são incluídas automaticamente na primeira
 * inicialização do módulo. Elas servem como exemplos e podem
 * ser editadas pelo Mestre.
 *
 * Cada receita possui:
 * - id: identificador único
 * - name: nome exibido
 * - type: "potion", "poison" ou "special"
 * - category: categoria de exibição
 * - rarity: raridade (common, uncommon, rare, veryRare)
 * - description: descrição da receita
 * - ingredients: lista de ingredientes necessários
 * - result: dados do item produzido
 * - check: configuração do teste de alquimia
 * - discoverable: se pode ser descoberta por experimentação
 * - secret: se é uma receita secreta
 * - craftingTime: tempo de fabricação em minutos
 * - equipment: equipamento necessário
 * ============================================================
 */
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
    check: { enabled: true, type: "skill", key: "med", dc: 15 }, discoverable: true, secret: false, craftingTime: 60, equipment: ["Kit de Alquimia"], compendiumLookup: ["Potion of Healing", "Poção de Cura", "Healing Potion"]
  },
  {
    id: "antidote", name: "Antídoto", type: "potion", category: "Utilidade", rarity: "common",
    description: "Ajuda o organismo a combater toxinas comuns.", img: PATHS.POTION_ICON, tags: ["antidoto", "cura"],
    ingredients: [ingredient("Folha Amarga"), ingredient("Água Purificada")],
    result: result("Antídoto", "Concede vantagem contra um veneno comum, conforme decisão do Mestre.", PATHS.POTION_ICON),
    check: { enabled: true, type: "skill", key: "nat", dc: 10 }, discoverable: true, secret: false, craftingTime: 10, equipment: [], compendiumLookup: ["Antitoxin", "Antitoxina", "Antitoxin (Vial)"]
  },
  {
    id: "resistance-potion", name: "Poção de Resistência", type: "potion", category: "Resistência", rarity: "rare",
    description: "Uma essência mineral que protege contra energia elemental.", img: PATHS.POTION_ICON, tags: ["resistencia", "elemental"],
    ingredients: [ingredient("Cristal Elemental"), ingredient("Essência Mágica"), ingredient("Água Purificada")],
    result: result("Poção de Resistência", "Concede resistência elemental conforme o cristal utilizado.", PATHS.POTION_ICON),
    check: { enabled: true, type: "skill", key: "arc", dc: 20 }, discoverable: true, secret: false, craftingTime: 240, equipment: ["Kit de Alquimia"]
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
    check: { enabled: true, type: "skill", key: "med", dc: 20 }, discoverable: true, secret: true, craftingTime: 60, equipment: ["Kit de Alquimia"]
  },
  {
    id: "sleep-poison", name: "Veneno de Sono", type: "poison", category: "Sono", rarity: "uncommon",
    description: "Mistura volátil que induz torpor.", img: PATHS.POISON_ICON, tags: ["sono", "toxico"],
    ingredients: [ingredient("Flor Lunar"), ingredient("Esporo Sonífero"), ingredient("Álcool Alquímico")],
    result: result("Veneno de Sono", "Veneno de ingestão que pode causar sono.", PATHS.POISON_ICON, { poison: { application: "ingested", doses: 1, save: "con", dc: 13, damage: "0", conditions: ["unconscious"] } }),
    check: { enabled: true, type: "skill", key: "nat", dc: 15 }, discoverable: true, secret: false, craftingTime: 30, equipment: []
  }
]);


/**
 * ============================================================
 * BIBLIOTECA DE INGREDIENTES
 * ============================================================
 * Lista de ingredientes canônicos usados pelo catálogo.
 * O inventário do ator continua sendo a fonte de quantidade.
 *
 * Cada ingrediente possui:
 * - name: nome do ingrediente
 * - category: categoria (Erva, Mineral, Tóxico, etc)
 * - properties: lista de propriedades (cura, veneno, etc)
 * - img: ícone do ingrediente
 * ============================================================
 */
export const INGREDIENT_LIBRARY = Object.freeze([
  ["Erva Vermelha", "Erva", ["cura", "natural"]], ["Folha Amarga", "Erva", ["antidoto", "amargo"]],
  ["Flor Lunar", "Floral", ["sono", "luz"]], ["Raiz Entorpecente", "Raiz", ["paralisia", "entorpecente"]],
  ["Raiz de Mandrágora", "Raiz", ["vitalidade", "som"]], ["Cogumelo Azul", "Fungo", ["cura", "arcano"]],
  ["Esporo Sonífero", "Fungo", ["sono", "mental"]], ["Cristal Elemental", "Mineral", ["elemental", "resistencia"]],
  ["Cristal de Quartzo", "Mineral", ["claridade", "arcano"]], ["Pó de Diamante", "Mineral", ["abjuração", "pele"]],
  ["Pó de Esmeralda", "Mineral", ["invisibilidade", "ilusão"]], ["Escama de Dragão", "Monstruoso", ["elemental", "voo"]],
  ["Pena de Águia", "Monstruoso", ["voo", "velocidade"]], ["Olho de Basilisco", "Monstruoso", ["petrificação", "visão"]], ["Casca de Basilisco", "Monstruoso", ["petrificação", "proteção"]],
  ["Essência Mágica", "Essência", ["arcano", "potência"]], ["Essência de Sombra", "Essência", ["invisibilidade", "escuridão"]],
  ["Água Purificada", "Líquido", ["líquido", "estável"]], ["Água de Fonte Feérica", "Líquido", ["cura", "encantamento"]],
  ["Álcool Alquímico", "Líquido", ["volátil", "tóxico"]], ["Óleo Estabilizador", "Líquido", ["estável", "veneno"]],
  ["Glândula Tóxica", "Tóxico", ["veneno", "dano"]], ["Veneno de Wyvern", "Tóxico", ["veneno", "perfuração"]],
  ["Veneno de Verme Púrpura", "Tóxico", ["veneno", "corrosivo"]], ["Pó de Drow", "Tóxico", ["sono", "veneno"]],
  ["Sangue de Assassino", "Tóxico", ["veneno", "morte"]]
].map(([name, category, properties]) => ({ name, category, properties, img: PATHS.INGREDIENT_ICON })));

/**
 * Cria uma receita expandida com configurações padrão.
 * Usada para definir as receitas adicionais do módulo.
 */
const extraRecipe = (id, name, type, category, rarity, description, ingredients, resultDescription, formula, dc, tags = [], compendiumUuid = null, compendiumLookup = null) => ({
  id,
  name,
  type,
  category,
  rarity,
  description,
  img: type === "poison" ? PATHS.POISON_ICON : PATHS.POTION_ICON,
  tags,
  ingredients: ingredients.map(name => ingredient(name)),
  result: result(name, resultDescription, type === "poison" ? PATHS.POISON_ICON : PATHS.POTION_ICON, { formula, ...(compendiumUuid ? { compendiumUuid } : {}) }),
  check: { enabled: true, type: "skill", key: type === "poison" ? "nat" : "arc", dc },
  discoverable: true,
  secret: false,
  craftingTime: 60,
  equipment: ["Kit de Alquimia"],
  ...(compendiumUuid ? { compendiumUuid } : {}),
  ...(compendiumLookup ? { compendiumLookup } : {})
});

/**
 * ============================================================
 * RECEITAS EXPANDIDAS
 * ============================================================
 * Receitas adicionais incluídas na primeira inicialização.
 * Estas receitas são mais avançadas e exigem ingredientes
 * mais raros.
 * ============================================================
 */
export const EXPANDED_RECIPES = Object.freeze([
  extraRecipe("acid-vial", "Ácido (Frasco)", "special", "Dano", "common", "Acido concentrado para corroer materiais e ferimentos.", ["Álcool Alquímico", "Glândula Tóxica", "Cristal Elemental"], "Causa dano corrosivo por ferimento ou contato.", "2d6 ácido", 12, ["ácido", "corrosivo"], null, ["Acid (Vial)", "Ácido (Frasco)", "Acid Vial"]),
  extraRecipe("holy-water-flask", "Frasco com Água Benta", "special", "Cura", "rare", "Água sagrada em frasco para purificar e ferir criaturas malignas.", ["Água Purificada", "Essência Mágica", "Erva Vermelha"], "Causa dano a mortos-vivos e purifica objetos ou criaturas profanas.", "2d6 radiant", 16, ["água", "sagrada"], null, ["Holy Water", "Água Benta", "Frasco com Água Benta"]),
  extraRecipe("potion-climbing", "Poção de Escalada", "potion", "Movimento", "common", "A essência torna mãos e pés aderentes por um curto período.", ["Raiz Entorpecente", "Essência Mágica", "Água Purificada"], "Ganha deslocamento de escalada por 1 hora.", "1 hora", 12, ["escalada", "movimento"], null, ["Potion of Climbing", "Poção de Escalada"]),
  extraRecipe("potion-animal-friendship", "Poção de Amizade Animal", "potion", "Ajuste", "uncommon", "Uma poção perfumada que acalma feras e criaturas selvagens.", ["Flor Lunar", "Erva Vermelha", "Água Purificada"], "Concede influência sobre animais por 1 hora.", "1 hora", 14, ["animal", "amizade"], null, ["Potion of Animal Friendship", "Poção de Amizade Animal"]),
  extraRecipe("potion-gaseous-form", "Poção das Formas Gasosas", "potion", "Transformação", "veryRare", "Um vapor etéreo permite se transformar em névoa.", ["Essência de Sombra", "Água Purificada", "Essência Mágica"], "Permite se transformar em gás por 1 hora.", "1 hora", 20, ["gás", "transformação"], null, ["Potion of Gaseous Form", "Poção das Formas Gasosas", "Gaseous Form Potion"]),
  extraRecipe("oil-etherealness", "Óleo de Forma Etérea", "oil", "Transformação", "veryRare", "O óleo escorre como um véu de neblina e separa o corpo da matéria.", ["Essência de Sombra", "Álcool Alquímico", "Cristal de Quartzo"], "Permite entrar no plano etéreo por 1 hora.", "1 hora", 20, ["etéreo", "transformação"], null, ["Oil of Etherealness", "Óleo de Forma Etérea", "Etherealness Oil"]),
  extraRecipe("oil-precision", "Óleo de Precisão", "oil", "Aprimoramento", "rare", "Uma camada fina torna os ataques mais certeiros.", ["Cristal de Quartzo", "Erva Vermelha", "Óleo Estabilizador"], "Concede vantagem em testes de ataque por 1 hora.", "1 hora", 16, ["precisão", "ataque"], null, ["Oil of Precision", "Óleo de Precisão", "Oil of Sharpness"]),
  extraRecipe("oil-slipperiness", "Óleo Escorregadio", "oil", "Controle", "rare", "Uma película viscosa encobre pisos, armas e superfícies.", ["Álcool Alquímico", "Essência Mágica", "Água Purificada"], "Escorrega e dificulta o deslocamento por 1 minuto.", "1 minuto", 16, ["escorregadio", "controle"], null, ["Oil of Slipperiness", "Óleo Escorregadio"]),
  extraRecipe("potion-flying", "Poção de Voo", "potion", "Movimento", "veryRare", "Uma poção leve como o ar, feita com penas e essência elemental.", ["Pena de Águia", "Escama de Dragão", "Água de Fonte Feérica"], "Concede deslocamento de voo por 1 hora.", "1 hora", 22, ["voo", "movimento"], null, ["Potion of Flying", "Poção de Voo"]),
  extraRecipe("potion-invisibility", "Poção de Invisibilidade", "potion", "Ilusão", "veryRare", "O líquido desaparece do frasco antes mesmo de ser ingerido.", ["Pó de Esmeralda", "Essência de Sombra", "Água Purificada"], "Fica invisível por 1 hora ou até atacar ou conjurar uma magia.", "1 hora", 20, ["invisibilidade", "ilusão"], null, ["Potion of Invisibility", "Poção de Invisibilidade"]),
  extraRecipe("potion-stoneskin", "Poção de Pele de Pedra", "potion", "Defesa", "rare", "Uma suspensão mineral que endurece a pele sem impedir movimentos.", ["Pó de Diamante", "Cristal Elemental", "Água Purificada"], "Concede resistência a dano físico não mágico por 1 hora.", "1 hora", 20, ["defesa", "pedra"], null, ["Potion of Stone Giant Strength", "Potion of Invulnerability", "Poção de Pele de Pedra"]),
  extraRecipe("potion-speed", "Poção de Velocidade", "potion", "Movimento", "veryRare", "Bolhas douradas aceleram o coração e os reflexos.", ["Pena de Águia", "Flor Lunar", "Essência Mágica"], "Recebe os benefícios de velocidade por 1 minuto.", "1 minuto", 22, ["velocidade", "aceleração"], null, ["Potion of Speed", "Poção de Velocidade"]),
  extraRecipe("potion-mind-reading", "Poção de Leitura Mental", "potion", "Mental", "rare", "A poção reflete pensamentos como ondas sobre um lago.", ["Cristal de Quartzo", "Flor Lunar", "Essência Mágica"], "Permite perceber pensamentos superficiais por 10 minutos.", "10 minutos", 18, ["mente", "detecção"], null, ["Potion of Mind Reading", "Poção de Leitura Mental"]),
  extraRecipe("potion-greater-healing", "Poção de Cura Superior", "potion", "Cura", "rare", "Uma versão concentrada das poções restauradoras.", ["Erva Vermelha", "Raiz de Mandrágora", "Água de Fonte Feérica"], "Restaura 4d4 + 4 pontos de vida.", "4d4 + 4", 18, ["cura", "restauradora"], "Compendium.dnd5e.items.Item.5m9ErO9In8Uc5yyf", ["Potion of Greater Healing", "Poção de Cura Superior", "Poção de Cura Maior", "Greater Healing Potion"]),
  extraRecipe("potion-clairvoyance", "Poção de Clarividência", "potion", "Detecção", "rare", "O líquido mostra cenas de lugares distantes.", ["Cristal de Quartzo", "Olho de Basilisco", "Essência Mágica"], "Permite perceber uma área distante por até 10 minutos.", "10 minutos", 20, ["visão", "detecção"], null, ["Potion of Clairvoyance", "Poção de Clarividência"]),
  extraRecipe("poison-drow", "Veneno de Drow", "poison", "Sono", "rare", "Toxina escura que induz um sono profundo.", ["Pó de Drow", "Esporo Sonífero", "Óleo Estabilizador"], "Veneno de ferimento; falha na resistência deixa a criatura inconsciente.", "CD 13 CON", 18, ["sono", "veneno"], null, ["Drow Poison", "Veneno de Drow"]),
  extraRecipe("poison-wyvern", "Veneno de Wyvern", "poison", "Dano", "veryRare", "Veneno extremamente potente extraído de uma criatura alada.", ["Veneno de Wyvern", "Glândula Tóxica", "Óleo Estabilizador"], "Veneno de ferimento que causa 7d6 de dano de veneno; metade em sucesso.", "7d6", 22, ["dano", "veneno"], null, ["Wyvern Poison", "Veneno de Wyvern"]),
  extraRecipe("poison-purple-worm", "Veneno de Verme Púrpura", "poison", "Dano", "veryRare", "Uma toxina corrosiva que queima o corpo por dentro.", ["Veneno de Verme Púrpura", "Glândula Tóxica", "Álcool Alquímico"], "Veneno de ingestão ou ferimento que causa 12d6 de dano de veneno.", "12d6", 24, ["dano", "corrosivo"], null, ["Purple Worm Poison", "Veneno de Verme Púrpura"]),
  extraRecipe("poison-assassin", "Veneno de Assassino", "poison", "Morte", "veryRare", "Uma mistura silenciosa, sem cheiro e quase sem sabor.", ["Sangue de Assassino", "Folha Amarga", "Óleo Estabilizador"], "Veneno de ingestão; causa dano e pode deixar o alvo debilitado.", "9d6", 24, ["morte", "veneno"], null, ["Assassin's Blood", "Veneno de Assassino"]),
  extraRecipe("potion-heroism", "Poção de Heroísmo", "potion", "Fortalecimento", "rare", "Uma bebida dourada que desperta coragem sobrenatural.", ["Água de Fonte Feérica", "Raiz de Mandrágora", "Essência Mágica"], "Recebe pontos de vida temporários e coragem por 1 hora.", "1 hora", 18, ["coragem", "proteção"], null, ["Potion of Heroism", "Poção de Heroísmo"]),
  extraRecipe("potion-fire-breath", "Poção de Sopro de Fogo", "potion", "Elemental", "uncommon", "Pequenas brasas flutuam dentro do frasco.", ["Escama de Dragão", "Cristal Elemental", "Álcool Alquímico"], "Pode exalar fogo em uma criatura ou objeto próximo.", "4d6 fogo", 16, ["fogo", "elemental"], null, ["Potion of Fire Breath", "Poção de Sopro de Fogo"]),
  extraRecipe("potion-water-breathing", "Poção de Respiração Aquática", "potion", "Movimento", "uncommon", "O líquido tem gosto de água salgada e deixa as pupilas azuladas.", ["Água Purificada", "Essência de Sombra", "Cristal Elemental"], "Permite respirar debaixo d'água por 1 hora.", "1 hora", 14, ["água", "movimento"], null, ["Potion of Water Breathing", "Poção de Respiração Aquática"]),
  extraRecipe("potion-poison-resistance", "Poção de Resistência a Veneno", "potion", "Resistência", "uncommon", "Uma película verde protege o corpo contra toxinas.", ["Folha Amarga", "Glândula Tóxica", "Água Purificada"], "Concede resistência a dano de veneno por 1 hora.", "1 hora", 15, ["veneno", "resistencia"], null, ["Potion of Poison Resistance", "Poção de Resistência a Veneno"]),
  extraRecipe("potion-supreme-healing", "Poção de Cura Suprema", "potion", "Cura", "veryRare", "A forma mais concentrada da arte restauradora.", ["Erva Vermelha", "Raiz de Mandrágora", "Água de Fonte Feérica"], "Restaura 10d4 + 20 pontos de vida.", "10d4 + 20", 23, ["cura", "restauradora"], null, ["Potion of Supreme Healing", "Poção de Cura Suprema", "Supreme Healing Potion"]),
  extraRecipe("poison-serpent", "Veneno de Serpente", "poison", "Dano", "common", "Toxina simples, rápida e fácil de ocultar.", ["Glândula Tóxica", "Folha Amarga", "Álcool Alquímico"], "Veneno de ferimento que causa 2d6 de dano de veneno.", "2d6", 13, ["dano", "veneno"], null, ["Serpent Venom", "Veneno de Serpente"]),
  extraRecipe("poison-ghoul", "Veneno de Carniçal", "poison", "Paralisia", "rare", "Uma substância cinzenta que endurece os músculos.", ["Raiz Entorpecente", "Sangue de Assassino", "Óleo Estabilizador"], "Pode impor paralisia por 1 rodada em uma falha.", "CD 15 CON", 19, ["paralisia", "veneno"], null, ["Ghoul Paralyzer", "Veneno de Carniçal"]),
  extraRecipe("poison-nightmare", "Veneno de Pesadelo", "poison", "Mental", "rare", "A fumaça da mistura provoca visões perturbadoras.", ["Esporo Sonífero", "Essência de Sombra", "Pó de Drow"], "Causa desorientação e desvantagem no próximo teste mental.", "1 hora", 18, ["mental", "sono"], null, ["Nightmare Venom", "Veneno de Pesadelo"]),
  extraRecipe("special-alchemist-fire", "Fogo Alquímico", "special", "Área", "uncommon", "Frasco instável que explode ao atingir uma superfície.", ["Cristal Elemental", "Álcool Alquímico", "Óleo Estabilizador"], "Incendeia uma pequena área e causa dano contínuo.", "2d6 fogo", 15, ["fogo", "área"], null, ["Alchemist's Fire", "Fogo Alquímico", "Alchemists Fire"]),
  extraRecipe("special-smoke-bomb", "Bomba de Fumaça", "special", "Controle", "common", "Uma cápsula libera uma nuvem espessa e irritante.", ["Esporo Sonífero", "Pó de Esmeralda", "Álcool Alquímico"], "Cria uma nuvem de fumaça que obscurece a área por 1 minuto.", "1 minuto", 12, ["fumaça", "controle"], null, ["Smoke Bomb", "Bomba de Fumaça"]),
  extraRecipe("special-universal-solvent", "Solvente Universal", "special", "Utilidade", "veryRare", "Um líquido que dissolve quase qualquer material não mágico.", ["Pó de Diamante", "Essência Mágica", "Água Purificada"], "Dissolve adesivos, lacres e materiais comuns resistentes.", "1 dose", 22, ["utilidade", "dissolução"], null, ["Universal Solvent", "Solvente Universal"])
]);

/**
 * Obtém a biblioteca completa de ingredientes.
 * Combina ingredientes canônicos com ingredientes definidos
 * nas receitas personalizadas do Mestre.
 */
export function getIngredientLibrary(recipes = getRecipes()) {
  const entries = new Map(INGREDIENT_LIBRARY.map(item => [item.name, deepClone(item)]));

  for (const recipe of recipes) {
    for (const item of recipe.ingredients ?? []) {
      const name = item.mode === "item" ? item.name : item.properties.join(" + ");
      if (!entries.has(name)) {
        entries.set(name, {
          name,
          category: item.mode === "property" ? "Propriedade" : "Ingrediente",
          properties: item.properties ?? [],
          img: PATHS.INGREDIENT_ICON
        });
      }
    }
  }

  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * ============================================================
 * VALIDAÇÃO DE RECEITA
 * ============================================================
 * Valida e normaliza uma receita antes de salvar.
 * Garante que todos os campos obrigatórios estejam presentes
 * e que os valores estejam dentro dos limites permitidos.
 *
 * Se "strict" for true, exige que o resultado tenha um nome.
 * Isso é útil para receitas criadas pelo Mestre.
 * ============================================================
 */
export function validateRecipe(source, { strict = true } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Receita inválida: objeto esperado.");
  }

  const recipe = deepClone(source);

  // Validação básica
  recipe.id = String(recipe.id || randomId()).replace(/[^a-zA-Z0-9_-]/g, "-");
  recipe.name = String(recipe.name || "").trim().slice(0, 120);
  if (!recipe.name) throw new Error("A receita precisa de um nome.");

  recipe.type = ["potion", "poison", "special"].includes(recipe.type) ? recipe.type : "potion";
  recipe.category = String(recipe.category || "Geral").trim().slice(0, 80);
  recipe.rarity = String(recipe.rarity || "common").trim().slice(0, 40);
  recipe.description = String(recipe.description || "").slice(0, 5000);
  recipe.img = String(recipe.img || (recipe.type === "poison" ? PATHS.POISON_ICON : PATHS.POTION_ICON));
  recipe.tags = Array.from(new Set(
    (Array.isArray(recipe.tags) ? recipe.tags : [])
      .map(tag => String(tag).trim())
      .filter(Boolean)
  )).slice(0, 30);

  // Validação de ingredientes
  if (!Array.isArray(recipe.ingredients) || ![2, 3].includes(recipe.ingredients.length)) {
    throw new Error("Uma receita deve possuir exatamente 2 ou 3 ingredientes.");
  }

  recipe.ingredients = recipe.ingredients.map(entry => {
    const item = typeof entry === "string" ? { name: entry } : deepClone(entry ?? {});
    item.name = String(item.name || "").trim().slice(0, 120);
    item.properties = (Array.isArray(item.properties) ? item.properties : [])
      .map(String)
      .map(v => v.trim())
      .filter(Boolean)
      .slice(0, 20);
    item.mode = item.mode === "property" ? "property" : "item";
    item.quantity = clampNumber(item.quantity, 1, 999, 1);

    if (item.mode === "item" && !item.name) {
      throw new Error("Todo ingrediente específico precisa de nome.");
    }
    if (item.mode === "property" && !item.properties.length) {
      throw new Error("Um requisito por propriedade precisa de ao menos uma propriedade.");
    }

    return item;
  });

  // Validação do resultado
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
    midiFlags: output.midiFlags && typeof output.midiFlags === "object" ? output.midiFlags : {},
    ...(output.compendiumUuid ? { compendiumUuid: String(output.compendiumUuid) } : {})
  };

  if (recipe.compendiumUuid) recipe.compendiumUuid = String(recipe.compendiumUuid);
  if (Array.isArray(recipe.compendiumLookup)) {
    recipe.compendiumLookup = recipe.compendiumLookup.map(String).map(value => value.trim()).filter(Boolean).slice(0, 20);
  }

  // Validação do teste
  const check = recipe.check && typeof recipe.check === "object" ? recipe.check : {};
  recipe.check = {
    enabled: Boolean(check.enabled),
    type: ["skill", "ability", "formula"].includes(check.type) ? check.type : "skill",
    key: String(check.key || "arc").slice(0, 40),
    dc: clampNumber(check.dc, 1, 40, 10),
    formula: String(check.formula || "1d20").slice(0, 200)
  };

  // Outros campos
  recipe.discoverable = recipe.discoverable !== false;
  recipe.secret = Boolean(recipe.secret);
  recipe.craftingTime = clampNumber(recipe.craftingTime, 0, 525600, 0);
  recipe.equipment = (Array.isArray(recipe.equipment) ? recipe.equipment : [])
    .map(String)
    .map(v => v.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (strict && !recipe.result.name) {
    throw new Error("A receita precisa definir um resultado.");
  }

  return recipe;
}

/**
 * Obtém todas as receitas do mundo.
 * Se não houver receitas salvas, retorna as receitas padrão.
 */
export function getRecipes() {
  const stored = game.settings.get(MODULE_ID, "recipes");
  return (Array.isArray(stored) && stored.length ? stored : DEFAULT_RECIPES)
    .map(recipe => validateRecipe(recipe, { strict: false }));
}

/**
 * Encontra uma receita pelo ID.
 * Retorna null se não encontrar.
 */
export function findRecipe(id) {
  return getRecipes().find(recipe => recipe.id === id) ?? null;
}

/**
 * Salva a lista completa de receitas.
 * Apenas o Mestre pode executar esta função.
 * Garante que todos os IDs são únicos.
 */
export async function saveRecipes(recipes) {
  if (!game.user?.isGM) {
    throw new Error("Somente o Mestre pode alterar a biblioteca global.");
  }
  if (!Array.isArray(recipes) || recipes.length > 2000) {
    throw new Error("Biblioteca inválida ou grande demais.");
  }

  const validated = recipes.map(recipe => validateRecipe(recipe));
  const ids = new Set();

  for (const recipe of validated) {
    if (ids.has(recipe.id)) {
      recipe.id = randomId();
    }
    ids.add(recipe.id);
  }

  await game.settings.set(MODULE_ID, "recipes", validated);
  Hooks.callAll("alchemyRecipesUpdated", deepClone(validated));

  return validated;
}

/**
 * Cria ou atualiza uma receita.
 * Se o ID já existe, atualiza. Caso contrário, cria nova.
 */
export async function upsertRecipe(recipe) {
  const validated = validateRecipe(recipe);
  const recipes = getRecipes();
  const index = recipes.findIndex(existing => existing.id === validated.id);

  if (index >= 0) {
    recipes[index] = validated;
  } else {
    recipes.push(validated);
  }

  await saveRecipes(recipes);
  return validated;
}

/**
 * Remove uma receita pelo ID.
 * Retorna true se a receita foi removida, false se não existia.
 */
export async function deleteRecipe(id) {
  const recipes = getRecipes();
  const filtered = recipes.filter(recipe => recipe.id !== id);

  if (filtered.length === recipes.length) return false;

  await saveRecipes(filtered);
  return true;
}

/**
 * ============================================================
 * INICIALIZAÇÃO DE DADOS
 * ============================================================
 * Na primeira execução (ou quando o schemaVersion muda),
 * esta função:
 * 1. Insere receitas padrão e expandidas
 * 2. Migra receitas existentes para o novo formato
 * 3. Atualiza o schemaVersion
 *
 * Apenas o Mestre pode executar esta função.
 * ============================================================
 */
export async function initializeData() {
  if (!game.user?.isGM) return;

  const version = Number(game.settings.get(MODULE_ID, "schemaVersion") || 0);
  const stored = game.settings.get(MODULE_ID, "recipes");

  // Primeira inicialização: insere receitas padrão
  if (!Array.isArray(stored) || stored.length === 0) {
    await game.settings.set(MODULE_ID, "recipes", deepClone([...DEFAULT_RECIPES, ...EXPANDED_RECIPES]));
  }

  // Migração de schema
  if (version < SCHEMA_VERSION) {
    const current = getRecipes();
    const ids = new Set(current.map(recipe => recipe.id));
    const canonical = new Map([...DEFAULT_RECIPES, ...EXPANDED_RECIPES].map(recipe => [recipe.id, recipe]));
    const migrated = [
      ...current,
      ...EXPANDED_RECIPES.filter(recipe => !ids.has(recipe.id))
    ].map(recipe => {
      const source = canonical.get(recipe.id);
      const merged = {
        ...recipe,
        ...(source?.compendiumUuid ? { compendiumUuid: source.compendiumUuid } : {}),
        ...(source?.compendiumLookup ? { compendiumLookup: source.compendiumLookup } : {}),
        result: {
          ...recipe.result,
          ...(source?.result?.compendiumUuid ? { compendiumUuid: source.result.compendiumUuid } : {})
        }
      };
      return validateRecipe(merged, { strict: false });
    });

    await game.settings.set(MODULE_ID, "recipes", migrated);
    await game.settings.set(MODULE_ID, "schemaVersion", SCHEMA_VERSION);
  }
}

/**
 * Busca receitas por texto.
 * Compara com nome, categoria, raridade, descrição e tags.
 * Ignora acentos e maiúsculas/minúsculas.
 */
export function recipeSearch(recipe, query = "") {
  const needle = normalizeText(query);
  if (!needle) return true;

  return [recipe.name, recipe.category, recipe.rarity, recipe.description, ...(recipe.tags ?? [])]
    .some(value => normalizeText(value).includes(needle));
}

// ============================================================
// FIM DO GERENCIAMENTO DE DADOS E RECEITAS
// ============================================================
// Para adicionar novas funções:
// - Use nomes descritivos em camelCase
// - Adicione comentários JSDoc explicativos
// - Exporte a função para uso em outros módulos
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE DADOS E RECEITAS
// ============================================================
// Este arquivo gerencia todos os dados e receitas do módulo.
// As receitas são armazenadas em game.settings com escopo
// "world", o que significa que são compartilhadas entre todos
// os jogadores.
// ============================================================
