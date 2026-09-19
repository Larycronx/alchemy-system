import { AlchemyApp } from "./apps/alchemy-app.js";
import { AlchemyGMApp } from "./apps/gm-app.js";
import { getHistory, lockRecipe, unlockRecipe } from "./actor-data.js";
import { deleteRecipe, findRecipe, getIngredientLibrary, getRecipes, upsertRecipe } from "./data.js";
import { buildIngredientItem, getActorIngredients } from "./inventory.js";
import { applyPoisonToWeapon, midiStatus } from "./midi.js";
import { requestCraft } from "./socket.js";
import { activeActor, assertActorPermission } from "./utils.js";

const instances = new Map();
let gmInstance = null;

export function openAlchemy(actor = activeActor(), options = {}) {
  if (!actor) throw new Error("Selecione um token ou atribua um personagem ao usuário.");
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

export function openGM(options = {}) {
  if (!game.user?.isGM) throw new Error("Acesso exclusivo do Mestre.");
  gmInstance ??= new AlchemyGMApp(options);
  gmInstance.render({ force: true });
  return gmInstance;
}

export const AlchemyAPI = Object.freeze({
  open: openAlchemy,
  openGM,
  getRecipes,
  getRecipe: findRecipe,
  createRecipe: upsertRecipe,
  updateRecipe: upsertRecipe,
  deleteRecipe,
  getIngredientLibrary,
  unlockRecipe: (actor, id) => unlockRecipe(actor, id, { gmOverride: game.user.isGM }),
  lockRecipe: (actor, id) => lockRecipe(actor, id, { gmOverride: game.user.isGM }),
  craftRecipe: (actor, recipeId, ingredientIds) => requestCraft(actor, { recipeId, ingredientIds, experiment: false }),
  experiment: (actor, ingredientIds) => requestCraft(actor, { ingredientIds, experiment: true }),
  getIngredients: getActorIngredients,
  addIngredient: async (actor, data) => {
    assertActorPermission(actor);
    return actor.createEmbeddedDocuments("Item", [buildIngredientItem(data)]);
  },
  getPlayerHistory: getHistory,
  applyPoisonToWeapon,
  midiStatus
});
