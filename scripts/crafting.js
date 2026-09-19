import { FLAG_KEYS, LOCK_TTL_MS, MODULE_ID, PATHS } from "./constants.js";
import { appendHistory, grantAlchemyXp, knowsRecipe, unlockRecipe } from "./actor-data.js";
import { findRecipe, getRecipes } from "./data.js";
import { buildConsumption, findMatchingRecipe, getActorIngredients, matchRecipeIngredients, restoreConsumption } from "./inventory.js";
import { decorateForMidi } from "./midi.js";
import { assertActorPermission, debug, getSetting, localize, postChat, randomId } from "./utils.js";

const localLocks = new Set();

function extractRoll(rolled) {
  if (Array.isArray(rolled)) return rolled[0] ?? null;
  if (rolled?.rolls && Array.isArray(rolled.rolls)) return rolled.rolls[0] ?? null;
  return rolled ?? null;
}

/** Usa chamadas nativas dnd5e quando disponíveis e recua para Roll do Foundry. */
export async function performAlchemyCheck(actor, recipe, { forcedOutcome = null } = {}) {
  if (forcedOutcome && game.user?.isGM) {
    const totals = { critical: recipe.check.dc + 10, success: recipe.check.dc, partial: recipe.check.dc - 2, failure: recipe.check.dc - 5, fumble: 1 };
    return { total: totals[forcedOutcome] ?? recipe.check.dc, natural: forcedOutcome === "critical" ? 20 : forcedOutcome === "fumble" ? 1 : null, outcome: forcedOutcome, forced: true };
  }
  const enabled = getSetting("enableChecks", true) && recipe.check?.enabled;
  if (!enabled) return { total: null, natural: null, outcome: "success", skipped: true };
  let roll;
  const config = recipe.check;
  try {
    if (game.system?.id === "dnd5e" && config.type === "skill" && typeof actor.rollSkill === "function") {
      roll = extractRoll(await actor.rollSkill({ skill: config.key }, { configure: false }, { create: true }));
    } else if (game.system?.id === "dnd5e" && config.type === "ability" && typeof actor.rollAbilityCheck === "function") {
      roll = extractRoll(await actor.rollAbilityCheck({ ability: config.key }, { configure: false }, { create: true }));
    }
  } catch (error) {
    debug("Rolagem nativa indisponível; usando fórmula de fallback", error);
  }
  if (!roll) {
    const formula = config.type === "formula" ? config.formula : "1d20";
    roll = await new Roll(formula, actor.getRollData?.() ?? {}).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${recipe.name} — CD ${config.dc}` });
  }
  const total = Number(roll.total ?? 0);
  const die = roll.dice?.find?.(term => Number(term.faces) === 20);
  const natural = Number(die?.results?.find?.(result => result.active !== false)?.result ?? 0) || null;
  let outcome = total >= Number(config.dc) ? "success" : "failure";
  if (natural === 20) outcome = "critical";
  else if (natural === 1) outcome = "fumble";
  else if (outcome === "failure" && total >= Number(config.dc) - 2) outcome = "partial";
  if (!getSetting("allowFailures", true) && ["failure", "fumble"].includes(outcome)) outcome = "success";
  return { total, natural, outcome, formula: roll.formula };
}

function outputItemData(recipe, quality, amount) {
  const result = recipe.result;
  const description = `<p>${result.description || recipe.description || ""}</p><p><strong>Qualidade:</strong> ${quality}</p>`;
  const item = {
    name: result.name || recipe.name,
    type: result.type || "consumable",
    img: result.img || recipe.img || PATHS.POTION_ICON,
    system: { quantity: amount, description: { value: description } },
    effects: Array.isArray(result.effects) ? result.effects : [],
    flags: { [MODULE_ID]: {
      crafted: true, recipeId: recipe.id, recipeType: recipe.type, quality, formula: result.formula || "",
      poison: result.poison || null, craftedAt: Date.now()
    } }
  };
  return decorateForMidi(item, recipe);
}

function qualityAndAmount(recipe, outcome) {
  const base = Math.max(1, Number(recipe.result?.quantity || 1));
  if (outcome === "critical") return { quality: "superior", amount: base + 1 };
  if (outcome === "partial") return { quality: "fraca", amount: Math.max(1, Math.floor(base / 2)) };
  return { quality: "normal", amount: base };
}

async function acquireLock(actor, requestId) {
  if (localLocks.has(actor.id)) throw new Error("Já existe uma fabricação em andamento para este personagem.");
  localLocks.add(actor.id);
  const previous = actor.getFlag(MODULE_ID, FLAG_KEYS.LOCK);
  if (previous?.expires > Date.now() && previous.requestId !== requestId) {
    localLocks.delete(actor.id);
    throw new Error("O inventário alquímico está temporariamente bloqueado por outra fabricação.");
  }
  await actor.setFlag(MODULE_ID, FLAG_KEYS.LOCK, { requestId, userId: game.user.id, expires: Date.now() + LOCK_TTL_MS });
  const confirmed = actor.getFlag(MODULE_ID, FLAG_KEYS.LOCK);
  if (confirmed?.requestId !== requestId) {
    localLocks.delete(actor.id);
    throw new Error("Não foi possível obter o bloqueio de fabricação.");
  }
}

async function releaseLock(actor, requestId) {
  localLocks.delete(actor.id);
  const current = actor.getFlag(MODULE_ID, FLAG_KEYS.LOCK);
  if (current?.requestId === requestId) await actor.unsetFlag(MODULE_ID, FLAG_KEYS.LOCK);
}

function equipmentAvailable(actor, recipe) {
  if (!getSetting("requireEquipment", false) || !recipe.equipment?.length) return true;
  const names = Array.from(actor.items ?? []).map(item => item.name.toLocaleLowerCase("pt-BR"));
  return recipe.equipment.every(required => names.includes(required.toLocaleLowerCase("pt-BR")));
}

async function addGmLog(entry) {
  if (!game.user?.isGM) return;
  const logs = game.settings.get(MODULE_ID, "gmLogs");
  const next = Array.isArray(logs) ? logs.slice(-499) : [];
  next.push(entry);
  await game.settings.set(MODULE_ID, "gmLogs", next);
}

/**
 * Executa a transação lógica. A exclusão nunca é usada: atualizações de quantidade
 * podem ser restauradas caso a criação do item falhe.
 */
export async function executeCraft({ actor, recipeId = null, ingredientIds = [], experiment = false, forcedOutcome = null, requestUser = game.user }) {
  assertActorPermission(actor, requestUser);
  if (![2, 3].includes(ingredientIds.length) || new Set(ingredientIds).size !== ingredientIds.length) throw new Error("Selecione exatamente 2 ou 3 ingredientes diferentes.");
  if (experiment && !getSetting("enableExperimentation", true)) throw new Error("A experimentação está desativada.");
  const requestId = randomId();
  await acquireLock(actor, requestId);
  let consumption = null;
  let created = [];
  try {
    const liveIngredients = getActorIngredients(actor);
    const selected = ingredientIds.map(id => liveIngredients.find(ingredient => ingredient.id === id));
    if (selected.some(value => !value)) throw new Error("Um ou mais ingredientes não existem mais no inventário.");
    const recipes = getRecipes();
    let recipe = recipeId ? findRecipe(recipeId) : null;
    let assignments = recipe ? matchRecipeIngredients(recipe, selected) : null;
    if (experiment) {
      const match = findMatchingRecipe(recipes, selected, null);
      recipe = match?.recipe ?? null;
      assignments = match?.assignments ?? null;
    }
    if (!recipe || !assignments) return await handleUnknownExperiment({ actor, selected, requestId, requestUser, experiment });
    if (!experiment && getSetting("enableKnowledge", true) && !knowsRecipe(actor, recipe.id) && !requestUser.isGM) throw new Error("O personagem ainda não conhece esta receita.");
    if (!equipmentAvailable(actor, recipe)) throw new Error(`Equipamento necessário: ${recipe.equipment.join(", ")}.`);
    const allowed = Hooks.call("beforeAlchemyCraft", { actor, recipe, assignments, experiment, requestUser });
    if (allowed === false) throw new Error("A fabricação foi cancelada por outra integração.");
    const check = await performAlchemyCheck(actor, recipe, { forcedOutcome: requestUser.isGM ? forcedOutcome : null });
    const succeeds = ["critical", "success", "partial"].includes(check.outcome);
    const shouldConsume = getSetting("consumeIngredients", true) && (succeeds || getSetting("consumeOnFailure", false));
    if (shouldConsume) {
      consumption = buildConsumption(actor, assignments);
      await actor.updateEmbeddedDocuments("Item", consumption.updates);
    }
    let quality = "nenhuma";
    let amount = 0;
    if (succeeds) {
      ({ quality, amount } = qualityAndAmount(recipe, check.outcome));
      created = await actor.createEmbeddedDocuments("Item", [outputItemData(recipe, quality, amount)]);
      if (experiment && getSetting("autoDiscover", true) && recipe.discoverable) await unlockRecipe(actor, recipe.id, { gmOverride: game.user.isGM });
      await grantAlchemyXp(actor, check.outcome === "critical" ? 20 : 10);
    }
    const entry = {
      id: randomId(), timestamp: Date.now(), userId: requestUser.id, userName: requestUser.name, actorId: actor.id, actorName: actor.name,
      recipeId: recipe.id, recipeName: recipe.name, recipeType: recipe.type, ingredients: assignments.map(a => ({ name: a.ingredient.name, quantity: a.quantity })),
      check, success: succeeds, result: check.outcome, output: created[0]?.name ?? null, amount, quality, equipment: recipe.equipment ?? [], experiment
    };
    await appendHistory(actor, entry, { gmOverride: game.user.isGM });
    await addGmLog(entry);
    await postChat({ actor, title: localize("ALCHEMY.Chat.Title", "Alquimia"), result: `${recipe.name}: ${localize(`ALCHEMY.Outcomes.${check.outcome}`, check.outcome)}`, details: created[0] ? `${amount}x ${created[0].name}` : "Nenhum item produzido." });
    if (!succeeds) Hooks.callAll("onAlchemyFailure", entry);
    Hooks.callAll("afterAlchemyCraft", entry, created);
    debug("Fabricação concluída", entry);
    return { ok: true, entry, createdIds: created.map(item => item.id) };
  } catch (error) {
    if (created.length) await actor.deleteEmbeddedDocuments("Item", created.map(item => item.id)).catch(() => {});
    if (consumption) await restoreConsumption(actor, consumption).catch(rollbackError => console.error(`${MODULE_ID} | Falha ao compensar consumo`, rollbackError));
    throw error;
  } finally {
    await releaseLock(actor, requestId).catch(error => debug("Falha ao liberar bloqueio", error));
  }
}

async function handleUnknownExperiment({ actor, selected, requestUser, experiment }) {
  if (!experiment) throw new Error("Os ingredientes selecionados não correspondem à receita.");
  const shouldConsume = getSetting("consumeIngredients", true) && getSetting("consumeOnFailure", false);
  let operation = null;
  if (shouldConsume) {
    const assignments = selected.map(ingredient => ({ ingredient, quantity: 1 }));
    operation = buildConsumption(actor, assignments);
    await actor.updateEmbeddedDocuments("Item", operation.updates);
  }
  let created = [];
  try {
    if (getSetting("failureMode", "simple") === "defective") {
      created = await actor.createEmbeddedDocuments("Item", [{
        name: "Mistura Alquímica Defeituosa", type: "consumable", img: PATHS.POTION_ICON,
        system: { quantity: 1, description: { value: "Uma substância instável sem efeito confiável." } },
        flags: { [MODULE_ID]: { crafted: true, defective: true, craftedAt: Date.now() } }
      }]);
    }
    const entry = {
      id: randomId(), timestamp: Date.now(), userId: requestUser.id, userName: requestUser.name, actorId: actor.id, actorName: actor.name,
      recipeId: null, recipeName: "Experimento desconhecido", recipeType: "experiment", ingredients: selected.map(item => ({ name: item.name, quantity: 1 })),
      check: null, success: false, result: created.length ? "defective" : "failure", output: created[0]?.name ?? null, amount: created.length, quality: "defeituosa", equipment: [], experiment: true
    };
    await appendHistory(actor, entry, { gmOverride: game.user.isGM });
    await addGmLog(entry);
    Hooks.callAll("onAlchemyFailure", entry);
    return { ok: true, entry, createdIds: created.map(item => item.id) };
  } catch (error) {
    if (operation) await restoreConsumption(actor, operation).catch(() => {});
    throw error;
  }
}
