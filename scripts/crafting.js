import { FLAG_KEYS, LOCK_TTL_MS, MODULE_ID, PATHS } from "./constants.js";
import { appendHistory, grantAlchemyXp, knowsRecipe, unlockRecipe } from "./actor-data.js";
import { findRecipe, getRecipes } from "./data.js";
import { buildConsumption, findMatchingRecipe, getActorIngredients, matchRecipeIngredients, restoreConsumption } from "./inventory.js";
import { decorateForMidi } from "./midi.js";
import { assertActorPermission, debug, getSetting, localize, postChat, randomId } from "./utils.js";

const localLocks = new Set();

/**
 * ============================================================
 * EXTRAÇÃO DE ROLAGEM
 * ============================================================
 * O dnd5e pode retornar rolagens em diferentes formatos:
 * - Array de rolagens
 * - Objeto com propriedade "rolls"
 * - Objeto de rolagem direto
 *
 * Esta função normaliza todos os formatos para um único
 * objeto de rolagem.
 * ============================================================
 */
function extractRoll(rolled) {
  if (Array.isArray(rolled)) return rolled[0] ?? null;
  if (rolled?.rolls && Array.isArray(rolled.rolls)) return rolled.rolls[0] ?? null;
  return rolled ?? null;
}

/**
 * ============================================================
 * TESTE DE ALQUIMIA
 * ============================================================
 * Executa o teste de habilidade para fabricação de poções.
 * Suporta três tipos de teste:
 *
 * 1. "skill" - Perícia (ex: Medicina, Natureza, Arcano)
 * 2. "ability" - Atributo (ex: Inteligência, Sabedoria)
 * 3. "formula" - Fórmula personalizada (ex: "1d20 + 3")
 *
 * Resultados possíveis:
 * - "critical" - Sucesso crítico (20 natural) - qualidade superior
 * - "success" - Sucesso normal - qualidade normal
 * - "partial" - Sucesso parcial (falha por 1-2 pontos) - qualidade fraca
 * - "failure" - Falha normal
 * - "fumble" - Falha crítica (1 natural)
 *
 * O Mestre pode forçar um resultado específico para testes
 * de narrativa ou quando o teste não é necessário.
 * ============================================================
 */
export async function performAlchemyCheck(actor, recipe, { forcedOutcome = null } = {}) {
  // Mestre pode forçar resultado
  if (forcedOutcome && game.user?.isGM) {
    const totals = {
      critical: recipe.check.dc + 10,
      success: recipe.check.dc,
      partial: recipe.check.dc - 2,
      failure: recipe.check.dc - 5,
      fumble: 1
    };
    return {
      total: totals[forcedOutcome] ?? recipe.check.dc,
      natural: forcedOutcome === "critical" ? 20 : forcedOutcome === "fumble" ? 1 : null,
      outcome: forcedOutcome,
      forced: true
    };
  }

  // Verifica se testes estão habilitados
  const enabled = getSetting("enableChecks", true) && recipe.check?.enabled;
  if (!enabled) {
    return { total: null, natural: null, outcome: "success", skipped: true };
  }

  let roll;
  const config = recipe.check;

  // Tenta usar rolagens nativas do dnd5e
  try {
    if (game.system?.id === "dnd5e" && config.type === "skill" && typeof actor.rollSkill === "function") {
      roll = extractRoll(await actor.rollSkill({ skill: config.key }, { configure: false }, { create: true }));
    } else if (game.system?.id === "dnd5e" && config.type === "ability" && typeof actor.rollAbilityCheck === "function") {
      roll = extractRoll(await actor.rollAbilityCheck({ ability: config.key }, { configure: false }, { create: true }));
    }
  } catch (error) {
    debug("Rolagem nativa indisponível; usando fórmula de fallback", error);
  }

  // Fallback para rolagem manual
  if (!roll) {
    const formula = config.type === "formula" ? config.formula : "1d20";
    roll = await new Roll(formula, actor.getRollData?.() ?? {}).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${recipe.name} — CD ${config.dc}`
    });
  }

  // Calcula resultado
  const total = Number(roll.total ?? 0);
  const die = roll.dice?.find?.(term => Number(term.faces) === 20);
  const natural = Number(die?.results?.find?.(result => result.active !== false)?.result ?? 0) || null;

  let outcome = total >= Number(config.dc) ? "success" : "failure";
  if (natural === 20) outcome = "critical";
  else if (natural === 1) outcome = "fumble";
  else if (outcome === "failure" && total >= Number(config.dc) - 2) outcome = "partial";

  // Configuração: permitir falhas
  if (!getSetting("allowFailures", true) && ["failure", "fumble"].includes(outcome)) {
    outcome = "success";
  }

  return { total, natural, outcome, formula: roll.formula };
}

/**
 * ============================================================
 * CRIAÇÃO DO ITEM RESULTADO
 * ============================================================
 * Cria os dados do item que será adicionado ao inventário do
 * personagem após a fabricação bem-sucedida.
 *
 * O item inclui:
 * - Nome, tipo e imagem
 * - Quantidade produzida
 * - Descrição com qualidade
 * - Efeitos (se houver)
 * - Flags do módulo (qualidade, receita, etc)
 * - Flags do Midi-QOL (se ativo)
 * ============================================================
 */
async function resolveCompendiumSource(recipe) {
  const uuidCandidates = [
    recipe.compendiumUuid,
    recipe.result?.compendiumUuid,
    recipe.result?.sourceId,
    recipe.sourceId,
    recipe.compendiumName,
    recipe.result?.compendiumName
  ].filter(Boolean).filter(candidate => /^Compendium\./.test(String(candidate)) || /[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[A-Za-z0-9]+/.test(String(candidate)));

  for (const candidate of uuidCandidates) {
    try {
      const item = await fromUuid(candidate);
      if (item) return { uuid: candidate, document: item };

      const parts = String(candidate).split(".");
      if (parts.length === 4 && parts[0] === "Compendium") {
        const pack = game.packs.get(`${parts[1]}.${parts[2]}`);
        const packItem = await pack?.getDocument(parts[3]);
        if (packItem) return { uuid: candidate, document: packItem };
      }
    } catch (error) {
      debug(`UUID de compêndio inválida para ${recipe.name}: ${candidate}`, error);
    }
  }

  const names = [
    recipe.compendiumLookup,
    recipe.compendiumName,
    recipe.result?.compendiumLookup,
    recipe.result?.compendiumName,
    recipe.name,
    recipe.result?.name
  ].flatMap(value => Array.isArray(value) ? value : [value]).filter(Boolean).map(name => String(name).trim());
  if (!names.length || !game?.packs?.size) return null;

  const normalizedNames = names.map(name => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim());
  const preferredPacks = [
    game.packs.get("dnd5e.items"),
    ...game.packs.values()
  ].filter((pack, index, packs) => pack && packs.indexOf(pack) === index);

  for (const pack of preferredPacks) {
    try {
      if (!pack || (pack.documentName !== "Item" && pack.metadata?.type !== "Item" && !pack.collection?.endsWith(".items"))) continue;
      const index = await pack.getIndex();
      const matches = index.filter(entry => {
        if (!entry?.name) return false;
        const candidate = entry.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
        return normalizedNames.includes(candidate);
      });
      if (matches.length === 1) {
        const item = await pack.getDocument(matches[0]._id ?? matches[0].id);
        if (item) return { uuid: matches[0].uuid, document: item };
      }
    } catch (error) {
      debug(`Falha ao buscar compêndio para ${recipe.name}`, error);
    }
  }

  return null;
}

async function outputItemData(recipe, quality, amount) {
  const result = recipe.result;
  const description = `<p>${result.description || recipe.description || ""}</p><p><strong>Qualidade:</strong> ${quality}</p>`;
  const compendiumEntry = await resolveCompendiumSource(recipe);
  if ((recipe.compendiumUuid || recipe.compendiumLookup) && !compendiumEntry) {
    throw new Error(`Item do compêndio não encontrado para a receita "${recipe.name}".`);
  }
  const sourceItem = compendiumEntry?.document ? compendiumEntry.document.toObject?.() ?? foundry.utils.deepClone(compendiumEntry.document) : null;

  const item = sourceItem ? foundry.utils.deepClone(sourceItem) : {
    name: result.name || recipe.name,
    type: result.type || "consumable",
    img: result.img || recipe.img || PATHS.POTION_ICON,
    system: {
      quantity: amount,
      description: { value: description }
    },
    effects: Array.isArray(result.effects) ? result.effects : [],
    flags: {}
  };

  item.name ??= result.name || recipe.name;
  item.type ??= result.type || "consumable";
  item.img ??= result.img || recipe.img || PATHS.POTION_ICON;
  item.system ??= {};
  item.system.quantity = amount;
  if (!item.system.description) item.system.description = {};
  if (!sourceItem) {
    item.system.description.value = description;
  }

  if (Array.isArray(result.effects) && result.effects.length && !sourceItem) {
    item.effects = result.effects;
  }

  item.flags = {
    ...(item.flags ?? {}),
    [MODULE_ID]: {
      ...(item.flags?.[MODULE_ID] ?? {}),
      crafted: true,
      recipeId: recipe.id,
      recipeType: recipe.type,
      quality,
      formula: result.formula || "",
      poison: result.poison || null,
      craftedAt: Date.now()
    }
  };

  if (compendiumEntry?.uuid) {
    const [scope, packName, docType, id] = compendiumEntry.uuid.split(".");
    item.flags.core = {
      ...(item.flags.core ?? {}),
      sourceId: compendiumEntry.uuid,
      sourcePack: packName ? `${scope}.${packName}` : undefined,
      sourceDocument: docType || undefined,
      sourceDocumentId: id || undefined
    };
  }

  return decorateForMidi(item, recipe);
}

/**
 * ============================================================
 * QUALIDADE E QUANTIDADE DO RESULTADO
 * ============================================================
 * Determina a qualidade e quantidade do item produzido
 * com base no resultado do teste:
 *
 * - "critical" - Qualidade superior, quantidade + 1
 * - "success" - Qualidade normal, quantidade base
 * - "partial" - Qualidade fraca, quantidade reduzida (metade)
 * - "failure" - Nenhum item produzido
 * ============================================================
 */
function qualityAndAmount(recipe, outcome) {
  const base = Math.max(1, Number(recipe.result?.quantity || 1));

  if (outcome === "critical") {
    return { quality: "superior", amount: base + 1 };
  }
  if (outcome === "partial") {
    return { quality: "fraca", amount: Math.max(1, Math.floor(base / 2)) };
  }
  return { quality: "normal", amount: base };
}

/**
 * ============================================================
 * BLOQUEIO DE FABRICAÇÃO
 * ============================================================
 * Impede que o mesmo personagem fabrique múltiplos itens
 * simultaneamente. Isso evita condições de corrida e garante
 * que o inventário seja atualizado corretamente.
 *
 * O bloqueio é armazenado em flags do ator e tem um TTL
 * (time-to-live) de 30 segundos. Se o processo falhar, o
 * bloqueio é liberado automaticamente.
 * ============================================================
 */
async function acquireLock(actor, requestId) {
  // Verifica se já existe fabricação em andamento
  if (localLocks.has(actor.id)) {
    throw new Error("Já existe uma fabricação em andamento para este personagem.");
  }

  localLocks.add(actor.id);

  // Verifica bloqueio remoto (outro jogador ou GM)
  const previous = actor.getFlag(MODULE_ID, FLAG_KEYS.LOCK);
  if (previous?.expires > Date.now() && previous.requestId !== requestId) {
    localLocks.delete(actor.id);
    throw new Error("O inventário alquímico está temporariamente bloqueado por outra fabricação.");
  }

  // Define novo bloqueio
  await actor.setFlag(MODULE_ID, FLAG_KEYS.LOCK, {
    requestId,
    userId: game.user.id,
    expires: Date.now() + LOCK_TTL_MS
  });

  // Confirma que o bloqueio foi adquirido
  const confirmed = actor.getFlag(MODULE_ID, FLAG_KEYS.LOCK);
  if (confirmed?.requestId !== requestId) {
    localLocks.delete(actor.id);
    throw new Error("Não foi possível obter o bloqueio de fabricação.");
  }
}

/**
 * Libera o bloqueio de fabricação
 */
async function releaseLock(actor, requestId) {
  localLocks.delete(actor.id);
  const current = actor.getFlag(MODULE_ID, FLAG_KEYS.LOCK);
  if (current?.requestId === requestId) {
    await actor.unsetFlag(MODULE_ID, FLAG_KEYS.LOCK);
  }
}

/**
 * ============================================================
 * VERIFICAÇÃO DE EQUIPAMENTO
 * ============================================================
 * Verifica se o personagem possui o equipamento necessário
 * para fabricar a receita (ex: "Kit de Alquimia").
 *
 * Se a configuração "requireEquipment" estiver desabilitada,
 * a verificação é ignorada.
 * ============================================================
 */
function normalizeForComparison(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function equipmentAvailable(actor, recipe) {
  if (!getSetting("requireEquipment", false) || !recipe.equipment?.length) {
    return true;
  }

  const names = Array.from(actor.items ?? []).map(item => normalizeForComparison(item.name));
  return recipe.equipment.every(required => {
    const normalizedRequired = normalizeForComparison(required);
    const variants = new Set([normalizedRequired]);

    if (normalizedRequired.includes("alquimista")) {
      variants.add(normalizedRequired.replace(/alquimista/g, "alquimia"));
    }
    if (normalizedRequired.includes("alquimia")) {
      variants.add(normalizedRequired.replace(/alquimia/g, "alquimista"));
    }

    return names.some(name =>
      Array.from(variants).some(variant => name === variant || name.includes(variant) || variant.includes(name))
    );
  });
}

/**
 * ============================================================
 * REGISTRO DE LOG DO MESTRE
 * ============================================================
 * Adiciona uma entrada ao log global do Mestre. Este log
 * é compartilhado entre todos os jogadores e pode ser
 * visualizado no painel do Mestre.
 *
 * O log é limitado a 500 entradas (as mais antigas são
 * removidas automaticamente).
 * ============================================================
 */
async function addGmLog(entry) {
  if (!game.user?.isGM) return;

  const logs = game.settings.get(MODULE_ID, "gmLogs");
  const next = Array.isArray(logs) ? logs.slice(-499) : [];
  next.push(entry);
  await game.settings.set(MODULE_ID, "gmLogs", next);
}

/**
 * ============================================================
 * MOTOR DE FABRICAÇÃO DE POÇÕES
 * ============================================================
 * Esta é a função principal que executa a criação de poções,
 * venenos e itens especiais. Ela é responsável por:
 *
 * 1. Verificar permissões do jogador
 * 2. Adquirir bloqueio para evitar fabricação simultânea
 * 3. Validar ingredientes selecionados
 * 4. Encontrar a receita correspondente
 * 5. Verificar conhecimento da receita
 * 6. Verificar equipamento necessário
 * 7. Verificar quantidade suficiente de ingredientes
 * 8. Executar teste de alquimia
 * 9. Consumir ingredientes (se configurado)
 * 10. Criar item resultado (se sucesso)
 * 11. Registrar histórico e enviar mensagem ao chat
 * 12. Liberar bloqueio
 *
 * IMPORTANTE: A exclusão nunca é usada. Atualizações de quantidade
 * podem ser restauradas caso a criação do item falhe.
 * ============================================================
 */
export async function executeCraft({ actor, recipeId = null, ingredientIds = [], experiment = false, forcedOutcome = null, requestUser = game.user }) {
  // 1. Verifica se o jogador tem permissão sobre o personagem
  assertActorPermission(actor, requestUser);

  // 2. Valida número de ingredientes (2 ou 3)
  if (![2, 3].includes(ingredientIds.length) || new Set(ingredientIds).size !== ingredientIds.length) {
    throw new Error("Selecione exatamente 2 ou 3 ingredientes diferentes.");
  }

  // 3. Verifica se experimentação está habilitada
  if (experiment && !getSetting("enableExperimentation", true)) {
    throw new Error("A experimentação está desativada.");
  }

  // 4. Adquire bloqueio para evitar fabricação simultânea
  const requestId = randomId();
  await acquireLock(actor, requestId);

  let consumption = null;
  let created = [];

  try {
    // 5. Obtém ingredientes ativos do ator
    const liveIngredients = getActorIngredients(actor);
    const selected = ingredientIds.map(id => liveIngredients.find(ingredient => ingredient.id === id));
    if (selected.some(value => !value)) {
      throw new Error("Um ou mais ingredientes não existem mais no inventário.");
    }

    // 6. Encontra a receita (por ID ou experimentação)
    const recipes = getRecipes();
    let recipe = recipeId ? findRecipe(recipeId) : null;
    let assignments = recipe ? matchRecipeIngredients(recipe, selected) : null;

    if (experiment) {
      const match = findMatchingRecipe(recipes, selected, null);
      recipe = match?.recipe ?? null;
      assignments = match?.assignments ?? null;
    }

    // 7. Se não encontrou receita, trata como experimento desconhecido
    if (!recipe || !assignments) {
      return await handleUnknownExperiment({ actor, selected, requestId, requestUser, experiment });
    }

    // 8. Verifica se o personagem conhece a receita
    if (!experiment && getSetting("enableKnowledge", true) && !knowsRecipe(actor, recipe.id) && !requestUser.isGM) {
      throw new Error("O personagem ainda não conhece esta receita.");
    }

    // 9. Verifica equipamento necessário
    if (!equipmentAvailable(actor, recipe)) {
      throw new Error(`Equipamento necessário: ${recipe.equipment.join(", ")}.`);
    }

    // 10. Verifica quantidade suficiente ANTES de executar o teste
    const shouldConsume = getSetting("consumeIngredients", true);
    if (shouldConsume) {
      try {
        consumption = buildConsumption(actor, assignments);
      } catch (error) {
        throw new Error(`Ingredientes insuficientes: ${error.message}`);
      }
    }

    // 11. Permite que outros módulos cancelem a fabricação
    const allowed = Hooks.call("beforeAlchemyCraft", { actor, recipe, assignments, experiment, requestUser });
    if (allowed === false) {
      throw new Error("A fabricação foi cancelada por outra integração.");
    }

    // 12. Executa teste de alquimia
    const check = await performAlchemyCheck(actor, recipe, { forcedOutcome: requestUser.isGM ? forcedOutcome : null });
    const succeeds = ["critical", "success", "partial"].includes(check.outcome);

    // 13. Consome ingredientes (se configurado e se sucesso ou falha com consumo)
    const consumeOnFailure = getSetting("consumeOnFailure", false);
    const shouldActuallyConsume = shouldConsume && (succeeds || consumeOnFailure);
    if (shouldActuallyConsume && consumption) {
      await actor.updateEmbeddedDocuments("Item", consumption.updates);
    }

    // 14. Cria item resultado (se sucesso)
    let quality = "nenhuma";
    let amount = 0;
    if (succeeds) {
      ({ quality, amount } = qualityAndAmount(recipe, check.outcome));
      created = await actor.createEmbeddedDocuments("Item", [await outputItemData(recipe, quality, amount)]);

      // 15. Descoberta automática (experimentação)
      if (experiment && getSetting("autoDiscover", true) && recipe.discoverable) {
        await unlockRecipe(actor, recipe.id, { gmOverride: game.user.isGM });
      }

      // 16. Concede XP alquímico
      await grantAlchemyXp(actor, check.outcome === "critical" ? 20 : 10);
    }

    // 17. Registra histórico
    const entry = {
      id: randomId(),
      timestamp: Date.now(),
      userId: requestUser.id,
      userName: requestUser.name,
      actorId: actor.id,
      actorName: actor.name,
      recipeId: recipe.id,
      recipeName: recipe.name,
      recipeType: recipe.type,
      ingredients: assignments.map(a => ({ name: a.ingredient.name, quantity: a.quantity })),
      check,
      success: succeeds,
      result: check.outcome,
      output: created[0]?.name ?? null,
      amount,
      quality,
      equipment: recipe.equipment ?? [],
      experiment
    };

    await appendHistory(actor, entry, { gmOverride: game.user.isGM });
    await addGmLog(entry);

    // 18. Envia mensagem ao chat
    await postChat({
      actor,
      title: localize("ALCHEMY.Chat.Title", "Alquimia"),
      result: `${recipe.name}: ${localize(`ALCHEMY.Outcomes.${check.outcome}`, check.outcome)}`,
      details: created[0] ? `${amount}x ${created[0].name}` : "Nenhum item produzido."
    });

    // 19. Dispara hooks de falha e sucesso
    if (!succeeds) Hooks.callAll("onAlchemyFailure", entry);
    Hooks.callAll("afterAlchemyCraft", entry, created);

    debug("Fabricação concluída", entry);
    return { ok: true, entry, createdIds: created.map(item => item.id) };
  } catch (error) {
    // 20. Rollback: restaura ingredientes se algo falhar
    if (created.length) {
      await actor.deleteEmbeddedDocuments("Item", created.map(item => item.id)).catch(() => {});
    }
    if (consumption) {
      await restoreConsumption(actor, consumption).catch(rollbackError =>
        console.error(`${MODULE_ID} | Falha ao compensar consumo`, rollbackError)
      );
    }
    throw error;
  } finally {
    // 21. Libera bloqueio
    await releaseLock(actor, requestId).catch(error => debug("Falha ao liberar bloqueio", error));
  }
}

/**
 * ============================================================
 * TRATAMENTO DE EXPERIMENTO DESCONHECIDO
 * ============================================================
 * Quando o jogador tenta combinar ingredientes que não correspondem
 * a nenhuma receita conhecida, esta função é chamada. Ela pode:
 *
 * 1. Criar uma "Mistura Alquímica Defeituosa" (se configurado)
 * 2. Registrar o experimento no histórico
 * 3. Disparar hooks de falha
 *
 * Se o modo de falha for "defective", o jogador recebe um item
 * defeituoso. Caso contrário, apenas o histórico é registrado.
 * ============================================================
 */
async function handleUnknownExperiment({ actor, selected, requestUser, experiment }) {
  // Se não é experimento, é um erro de correspondência de receita
  if (!experiment) {
    throw new Error("Os ingredientes selecionados não correspondem à receita.");
  }

  // Verifica se deve consumir ingredientes em caso de falha
  const shouldConsume = getSetting("consumeIngredients", true) && getSetting("consumeOnFailure", false);
  let operation = null;

  if (shouldConsume) {
    const assignments = selected.map(ingredient => ({ ingredient, quantity: 1 }));
    try {
      operation = buildConsumption(actor, assignments);
    } catch (error) {
      throw new Error(`Ingredientes insuficientes: ${error.message}`);
    }
    await actor.updateEmbeddedDocuments("Item", operation.updates);
  }

  let created = [];

  try {
    // Cria item defeituoso se configurado
    if (getSetting("failureMode", "simple") === "defective") {
      created = await actor.createEmbeddedDocuments("Item", [{
        name: "Mistura Alquímica Defeituosa",
        type: "consumable",
        img: PATHS.POTION_ICON,
        system: {
          quantity: 1,
          description: { value: "Uma substância instável sem efeito confiável." }
        },
        flags: {
          [MODULE_ID]: { crafted: true, defective: true, craftedAt: Date.now() }
        }
      }]);
    }

    // Registra no histórico
    const entry = {
      id: randomId(),
      timestamp: Date.now(),
      userId: requestUser.id,
      userName: requestUser.name,
      actorId: actor.id,
      actorName: actor.name,
      recipeId: null,
      recipeName: "Experimento desconhecido",
      recipeType: "experiment",
      ingredients: selected.map(item => ({ name: item.name, quantity: 1 })),
      check: null,
      success: false,
      result: created.length ? "defective" : "failure",
      output: created[0]?.name ?? null,
      amount: created.length,
      quality: "defeituosa",
      equipment: [],
      experiment: true
    };

    await appendHistory(actor, entry, { gmOverride: game.user.isGM });
    await addGmLog(entry);
    Hooks.callAll("onAlchemyFailure", entry);

    return { ok: true, entry, createdIds: created.map(item => item.id) };
  } catch (error) {
    // Rollback: restaura ingredientes se algo falhar
    if (operation) await restoreConsumption(actor, operation).catch(() => {});
    throw error;
  }
}

// ============================================================
// FIM DO MOTOR DE FABRICAÇÃO DE POÇÕES
// ============================================================
// Para adicionar novas funções:
// - Use nomes descritivos em camelCase
// - Adicione comentários JSDoc explicativos
// - Exporte a função para uso em outros módulos
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE FABRICAÇÃO
// ============================================================
// Este arquivo contém o motor de fabricação de poções, que
// é responsável por executar a criação de poções, venenos e
// itens especiais. Ele verifica permissões, valida ingredientes,
// encontra a receita correspondente, verifica conhecimento,
// verifica equipamento, verifica quantidade suficiente, executa
// teste de alquimia, consome ingredientes, cria item resultado,
// registra histórico e envia mensagem ao chat.
// ============================================================
