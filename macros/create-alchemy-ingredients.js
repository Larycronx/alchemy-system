/**
 * ============================================================
 * MACRO: Criar lista completa de ingredientes alquímicos
 * Sistema de Alquimia — Foundry VTT v13 / D&D 5e
 * ============================================================
 *
 * COMO USAR:
 * 1. Crie um Macro do tipo "Script" no Foundry.
 * 2. Cole este arquivo no macro, ou importe-o como texto.
 * 3. Edite DESTINO abaixo:
 *      "world"      cria como Itens do Mundo;
 *      "compendium" cria em um compêndio existente.
 * 4. Para compêndio, informe o ID em COMPENDIUM_COLLECTION.
 *
 * O QUE ESTE MACRO FAZ:
 * - Cria 24 ingredientes alquímicos canônicos
 * - Cada ingrediente é criado como Item do tipo "loot"
 * - Adiciona flags do módulo para reconhecimento automático
 * - Evita duplicatas (verifica se já existe antes de criar)
 * - Pode atualizar ingredientes existentes
 *
 * ESTRUTURA DE UM INGREDIENTE:
 * - name: nome do ingrediente
 * - type: "loot" (tipo de item do dnd5e)
 * - system: quantidade e descrição
 * - flags: dados do módulo (categoria, propriedades, etc)
 * ============================================================
 */

const MODULE_ID = "alchemy-system";
const DESTINO = "compendium";
// Deixe vazio para o macro mostrar uma lista dos compêndios de itens disponíveis.
const COMPENDIUM_COLLECTION = "";
const QUANTIDADE_INICIAL = 3;
const ATUALIZAR_EXISTENTES = true;

/**
 * ============================================================
 * EXECUÇÃO PRINCIPAL DO MACRO
 * ============================================================
 * Este bloco é executado imediatamente quando o macro é
 * chamado. Ele:
 *
 * 1. Verifica se o usuário é o Mestre
 * 2. Obtém a biblioteca de ingredientes do módulo
 * 3. Cria ou atualiza os ingredientes no destino escolhido
 * 4. Exibe notificação com o resultado
 * ============================================================
 */
(async () => {

  // Apenas o Mestre pode executar este macro
  if (!game.user?.isGM) {
    ui.notifications.error("Somente o Mestre pode executar este macro.");
    return;
  }

  // Obtém a API do módulo e a biblioteca de ingredientes
  const moduleApi = game.modules.get(MODULE_ID)?.api;

  // Biblioteca builtin (caso a API não esteja disponível)
  const builtinLibrary = [
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
  ].map(([name, category, properties]) => ({
    name,
    category,
    properties,
    img: "modules/alchemy-system/assets/ingredient.svg"
  }));

  // Usa a API do módulo se disponível, senão usa a biblioteca builtin
  const library = moduleApi?.getIngredientLibrary?.() ?? builtinLibrary;

  // Função para normalizar texto (remover acentos e minúsculas)
  const normalize = value => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

  /**
   * Obtém a lista de propriedades de um ingrediente.
   * Remove duplicatas e valores vazios.
   */
  function propertiesFor(entry) {
    return Array.from(new Set((entry.properties ?? []).map(String).filter(Boolean)));
  }

  /**
   * Cria as flags do ingrediente para o módulo.
   * Inclui categoria, raridade, propriedades, potência, toxicidade e estabilidade.
   */
  function flagsFor(entry) {
    const properties = propertiesFor(entry);
    const poisonLike = entry.category === "Tóxico" ||
      properties.some(value => ["veneno", "tóxico", "toxina", "dano", "corrosivo"].includes(normalize(value)));

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

  /**
   * Cria os dados completos do item de ingrediente.
   * Inclui nome, tipo, imagem, sistema e flags.
   */
  function itemData(entry) {
    return {
      name: entry.name,
      type: "loot",
      img: entry.img || "modules/alchemy-system/assets/ingredient.svg",
      system: {
        quantity: QUANTIDADE_INICIAL,
        description: {
          value: `<p><strong>Ingrediente alquímico</strong></p><p>Categoria: ${entry.category || "Ingrediente"}</p><p>Propriedades: ${propertiesFor(entry).join(", ") || "Nenhuma"}</p>`
        }
      },
      flags: { [MODULE_ID]: flagsFor(entry) }
    };
  }

  /**
   * Mescla documentos existentes com novos dados.
   * Cria novos itens e atualiza existentes conforme configuração.
   */
  async function mergeDocuments(existing, data, createDocuments, updateDocuments) {
    const byName = new Map(existing.map(document => [normalize(document.name), document]));
    const toCreate = [];
    const toUpdate = [];

    for (const dataEntry of data) {
      const current = byName.get(normalize(dataEntry.name));
      if (!current) {
        toCreate.push(dataEntry);
      } else if (ATUALIZAR_EXISTENTES) {
        toUpdate.push({
          _id: current.id,
          [`flags.${MODULE_ID}.ingredient`]: dataEntry.flags[MODULE_ID].ingredient
        });
      }
    }

    if (toCreate.length) await createDocuments(toCreate);
    if (toUpdate.length && updateDocuments) await updateDocuments(toUpdate);

    return { created: toCreate.length, updated: toUpdate.length };
  }

  /**
   * Abre diálogo para escolher compêndio de itens.
   * Se COMPENDIUM_COLLECTION estiver definido, usa diretamente.
   */
  async function chooseCompendium() {
    const packs = game.packs.contents.filter(pack => pack.documentName === "Item");

    if (!packs.length) {
      ui.notifications.error("Nenhum compêndio de Itens foi encontrado neste mundo.");
      return null;
    }

    const configured = COMPENDIUM_COLLECTION ? game.packs.get(COMPENDIUM_COLLECTION) : null;
    if (configured) return configured;

    const options = packs.map(pack =>
      `<option value="${pack.collection}">${pack.title} — ${pack.collection}${pack.locked ? " (bloqueado)" : ""}</option>`
    ).join("");

    return new Promise(resolve => {
      new Dialog({
        title: "Escolher compêndio de ingredientes",
        content: `<p>Selecione o compêndio que receberá os ingredientes:</p><select name="alchemy-pack" style="width:100%">${options}</select>`,
        buttons: {
          confirm: {
            label: "Usar compêndio",
            callback: html => resolve(game.packs.get(html.find("select[name='alchemy-pack']").val()))
          },
          cancel: { label: "Cancelar", callback: () => resolve(null) }
        },
        default: "confirm",
        close: () => resolve(null)
      }).render(true);
    });
  }

  // Prepara dados dos ingredientes
  const data = library.map(itemData);
  let result;

  // Executa conforme destino configurado
  if (DESTINO === "world") {
    // Cria como Itens do Mundo
    result = await mergeDocuments(
      Array.from(game.items), data,
      entries => Item.createDocuments(entries),
      entries => Item.updateDocuments(entries)
    );
    ui.notifications.info(`Ingredientes alquímicos: ${result.created} Itens do Mundo criados e ${result.updated} atualizados.`);
  } else if (DESTINO === "compendium") {
    // Cria em um compêndio
    const pack = await chooseCompendium();
    if (!pack) return;

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

// ============================================================
// FIM DO MACRO DE CRIAÇÃO DE INGREDIENTES
// ============================================================
// Para modificar este macro:
// - Altere DESTINO para "world" ou "compendium"
// - Altere QUANTIDADE_INICIAL para a quantidade desejada
// - Altere ATUALIZAR_EXISTENTES para true/false
// - Adicione novos ingredientes à biblioteca builtin
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE MACRO
// ============================================================
// Este macro cria 24 ingredientes alquímicos canônicos no
// mundo ou em um compêndio. Cada ingrediente é criado como
// Item do tipo "loot" com a flag "ingredient" do módulo.
// ============================================================
