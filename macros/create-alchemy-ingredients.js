/*
 * Macro: Criar lista completa de ingredientes alquímicos
 * Sistema de Alquimia — Foundry VTT v13 / D&D 5e
 *
 * Como usar:
 * 1. Crie um Macro do tipo "Script" no Foundry.
 * 2. Cole este arquivo no macro, ou importe-o como texto.
 * 3. Edite DESTINO abaixo:
 *      "world"      cria como Itens do Mundo;
 *      "compendium" cria em um compêndio existente.
 * 4. Para compêndio, informe o ID em COMPENDIUM_COLLECTION.
 */

const DESTINO = "compendium";
// Deixe vazio para o macro mostrar uma lista dos compêndios de itens disponíveis.
const COMPENDIUM_COLLECTION = "";
const QUANTIDADE_INICIAL = 3;
const ATUALIZAR_EXISTENTES = true;

(async () => {

if (!game.user?.isGM) {
  ui.notifications.error("Somente o Mestre pode executar este macro.");
  return;
}

const moduleApi = game.modules.get("alchemy-system")?.api;
const builtinLibrary = [
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
].map(([name, category, properties]) => ({ name, category, properties, img: "modules/alchemy-system/assets/ingredient.svg" }));
const library = moduleApi?.getIngredientLibrary?.() ?? builtinLibrary;
const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();

function propertiesFor(entry) {
  return Array.from(new Set((entry.properties ?? []).map(String).filter(Boolean)));
}

function flagsFor(entry) {
  const properties = propertiesFor(entry);
  const poisonLike = entry.category === "Tóxico" || properties.some(value => ["veneno", "tóxico", "toxina", "dano", "corrosivo"].includes(normalize(value)));
  return {
    ingredient: {
      category: entry.category || "Ingrediente",
      rarity: entry.rarity || "common",
      properties,
      tags: properties,
      potency: poisonLike ? 2 : 1,
      toxicity: poisonLike ? 2 : 0,
      stability: entry.category === "Líquido" ? 2 : 1
    }
  };
}

function itemData(entry) {
  return {
    name: entry.name,
    type: "loot",
    img: entry.img || "modules/alchemy-system/assets/ingredient.svg",
    system: {
      quantity: QUANTIDADE_INICIAL,
      description: { value: `<p><strong>Ingrediente alquímico</strong></p><p>Categoria: ${entry.category || "Ingrediente"}</p><p>Propriedades: ${propertiesFor(entry).join(", ") || "Nenhuma"}</p>` }
    },
    flags: { "alchemy-system": flagsFor(entry) }
  };
}

async function mergeDocuments(existing, data, createDocuments, updateDocuments) {
  const byName = new Map(existing.map(document => [normalize(document.name), document]));
  const toCreate = [];
  const toUpdate = [];
  for (const dataEntry of data) {
    const current = byName.get(normalize(dataEntry.name));
    if (!current) toCreate.push(dataEntry);
    else if (ATUALIZAR_EXISTENTES) toUpdate.push({ _id: current.id, "flags.alchemy-system.ingredient": dataEntry.flags["alchemy-system"].ingredient });
  }
  if (toCreate.length) await createDocuments(toCreate);
  if (toUpdate.length && updateDocuments) await updateDocuments(toUpdate);
  return { created: toCreate.length, updated: toUpdate.length };
}

async function chooseCompendium() {
  const packs = game.packs.contents.filter(pack => pack.documentName === "Item");
  if (!packs.length) {
    ui.notifications.error("Nenhum compêndio de Itens foi encontrado neste mundo.");
    return null;
  }
  const configured = COMPENDIUM_COLLECTION ? game.packs.get(COMPENDIUM_COLLECTION) : null;
  if (configured) return configured;
  const options = packs.map(pack => `<option value="${pack.collection}">${pack.title} — ${pack.collection}${pack.locked ? " (bloqueado)" : ""}</option>`).join("");
  return new Promise(resolve => {
    new Dialog({
      title: "Escolher compêndio de ingredientes",
      content: `<p>Selecione o compêndio que receberá os ingredientes:</p><select name="alchemy-pack" style="width:100%">${options}</select>`,
      buttons: {
        confirm: { label: "Usar compêndio", callback: html => resolve(game.packs.get(html.find("select[name='alchemy-pack']").val())) },
        cancel: { label: "Cancelar", callback: () => resolve(null) }
      },
      default: "confirm",
      close: () => resolve(null)
    }).render(true);
  });
}

const data = library.map(itemData);
let result;

if (DESTINO === "world") {
  result = await mergeDocuments(
    Array.from(game.items), data,
    entries => Item.createDocuments(entries),
    entries => Item.updateDocuments(entries)
  );
  ui.notifications.info(`Ingredientes alquímicos: ${result.created} Itens do Mundo criados e ${result.updated} atualizados.`);
} else if (DESTINO === "compendium") {
  const pack = await chooseCompendium();
  if (!pack) {
    return;
  }
  if (pack.locked) {
    ui.notifications.warn("Desbloqueie o compêndio antes de executar o macro.");
    return;
  }
  const existing = await pack.getDocuments();
  result = await mergeDocuments(
    existing, data,
    entries => pack.documentClass.createDocuments(entries, { pack: pack.collection }),
    entries => pack.documentClass.updateDocuments(entries, { pack: pack.collection })
  );
  ui.notifications.info(`Ingredientes alquímicos: ${result.created} criados e ${result.updated} atualizados em ${pack.title}.`);
} else {
  ui.notifications.error(`Destino inválido: ${DESTINO}. Use actor, world ou compendium.`);
}
})();
