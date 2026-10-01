/**
 * ============================================================
 * API PÚBLICA DO MÓDULO
 * ============================================================
 * Este arquivo expõe a API pública do Sistema de Alquimia.
 * Outros módulos e macros podem usar esta API para:
 *
 * - Abrir a interface do jogador ou do Mestre
 * - Criar, atualizar e excluir receitas
 * - Fabricar poções e itens
 * - Gerenciar conhecimento de personagens
 * - Aplicar venenos a armas
 *
 * A API é exposta via:
 * - game.modules.get("alchemy-system").api
 * - globalThis.AlchemyModule
 * ============================================================
 */

import { AlchemyApp } from "./apps/alchemy-app.js";
import { AlchemyGMApp } from "./apps/gm-app.js";
import { getHistory, lockRecipe, unlockRecipe } from "./actor-data.js";
import { deleteRecipe, findRecipe, getIngredientLibrary, getRecipes, upsertRecipe } from "./data.js";
import { buildIngredientItem, getActorIngredients } from "./inventory.js";
import { applyPoisonToWeapon, midiStatus } from "./midi.js";
import { requestCraft } from "./socket.js";
import { activeActor, assertActorPermission } from "./utils.js";
import {
  applyHealing,
  applyInvisibilityEffect,
  applySpeedEffect,
  consumeAppliedPoison,
  getHealingFormula,
  getValidHealingTargets,
  getValidPoisonWeapons,
  isHealingPotion,
  isInvisibilityPotion,
  isPoisonItem,
  isSpeedPotion
} from "./effects.js";

// Controle de instâncias abertas
const instances = new Map();
let gmInstance = null;

/**
 * Abre a interface do jogador para um personagem específico.
 * Se já estiver aberta, apenas atualiza a exibição.
 */
export function openAlchemy(actor = activeActor(), options = {}) {
  if (!actor) {
    throw new Error("Selecione um token ou atribua um personagem ao usuário.");
  }
  assertActorPermission(actor);

  let app = instances.get(actor.id);
  if (!app) {
    app = new AlchemyApp({ actor, ...options });
    instances.set(actor.id, app);
    app.addEventListener?.("close", () => instances.delete(actor.id), { once: true });
  }

  app.render({ force: true });
  return app;
}

/**
 * Abre o painel do Mestre.
 * Apenas GMs podem abrir este painel.
 */
export function openGM(options = {}) {
  if (!game.user?.isGM) {
    throw new Error("Acesso exclusivo do Mestre.");
  }

  gmInstance ??= new AlchemyGMApp(options);
  gmInstance.render({ force: true });
  return gmInstance;
}

/**
 * ============================================================
 * API PÚBLICA
 * ============================================================
 * Objeto congelado com todos os métodos públicos do módulo.
 * Outros módulos podem acessar via:
 * - game.modules.get("alchemy-system").api.METODO()
 * - globalThis.AlchemyModule.METODO()
 * ============================================================
 */
export const AlchemyAPI = Object.freeze({
  // Interface
  open: openAlchemy,
  openGM,

  // Receitas
  getRecipes,
  getRecipe: findRecipe,
  createRecipe: upsertRecipe,
  updateRecipe: upsertRecipe,
  deleteRecipe,
  getIngredientLibrary,

  // Conhecimento
  unlockRecipe: (actor, id) => unlockRecipe(actor, id, { gmOverride: game.user.isGM }),
  lockRecipe: (actor, id) => lockRecipe(actor, id, { gmOverride: game.user.isGM }),

  // Fabricação
  craftRecipe: (actor, recipeId, ingredientIds) =>
    requestCraft(actor, { recipeId, ingredientIds, experiment: false }),
  experiment: (actor, ingredientIds) =>
    requestCraft(actor, { ingredientIds, experiment: true }),

  // Inventário
  getIngredients: getActorIngredients,
  addIngredient: async (actor, data) => {
    assertActorPermission(actor);
    return actor.createEmbeddedDocuments("Item", [buildIngredientItem(data)]);
  },

  // Histórico
  getPlayerHistory: getHistory,

  // Midi-QOL
  applyPoisonToWeapon,
  midiStatus,

  // Efeitos de poções e venenos
  useAlchemyItem: async (actor, item, options = {}) => {
    assertActorPermission(actor);

    if (isHealingPotion(item)) {
      const formula = getHealingFormula(item);
      if (!formula) throw new Error("Fórmula de cura não encontrada.");

      const targets = getValidHealingTargets(actor);
      if (!targets.length) throw new Error("Nenhum alvo válido encontrado.");

      // Se houver apenas um alvo, usa diretamente
      if (targets.length === 1) {
        return await applyHealing(game.user, actor, game.actors.get(targets[0].id), item, formula);
      }

      // Caso contrário, abre diálogo de seleção
      // (implementado na interface do jogador)
      return { needTargetSelection: true, targets, formula };
    }

    if (isInvisibilityPotion(item)) {
      return await applyInvisibilityEffect(game.user, actor, item);
    }

    if (isSpeedPotion(item)) {
      return await applySpeedEffect(game.user, actor, item);
    }

    if (isPoisonItem(item)) {
      const weapons = getValidPoisonWeapons(actor);
      if (!weapons.length) throw new Error("Nenhuma arma válida encontrada.");

      // Se houver apenas uma arma, usa diretamente
      if (weapons.length === 1) {
        return await applyPoisonToWeapon(game.user, actor, item, actor.items.get(weapons[0].id));
      }

      // Caso contrário, abre diálogo de seleção
      return { needWeaponSelection: true, weapons };
    }

    throw new Error("Tipo de item não reconhecido.");
  },

  // Efeitos
  applyHealing,
  applyInvisibilityEffect,
  applySpeedEffect,
  consumeAppliedPoison,
  getHealingFormula,
  getValidHealingTargets,
  getValidPoisonWeapons,
  isHealingPotion,
  isInvisibilityPotion,
  isPoisonItem,
  isSpeedPotion
});

// ============================================================
// FIM DA API PÚBLICA
// ============================================================
// Para usar a API em outros módulos ou macros:
// - game.modules.get("alchemy-system").api.METODO()
// - globalThis.AlchemyModule.METODO()
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE API PÚBLICA
// ============================================================
// Este arquivo expõe a API pública do módulo. Outros módulos
// e macros podem usar esta API para interagir com o Sistema
// de Alquimia.
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE API
// ============================================================
// Este arquivo expõe a API pública do módulo. Outros módulos
// e macros podem usar esta API para:
// - Abrir a interface do jogador ou do Mestre
// - Criar, atualizar e excluir receitas
// - Fabricar poções e itens
// - Gerenciar conhecimento de personagens
// - Aplicar venenos a armas
// ============================================================
