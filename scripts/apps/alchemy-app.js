import { MODULE_ID, PATHS } from "../constants.js";
import { getFavorites, getHistory, getKnowledge, getNotes, getProgression, saveNotes, toggleFavorite } from "../actor-data.js";
import { getIngredientLibrary, getRecipes, recipeSearch } from "../data.js";
import { canCraftRecipe, getActorIngredients, selectIngredientsForRecipe } from "../inventory.js";
import { requestCraft } from "../socket.js";
import { activeActor, assertActorPermission, getSetting, localize, normalizeText, notify } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class AlchemyApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "alchemy-system-player",
    classes: ["alchemy-system", "alchemy-player"],
    position: { width: 880, height: 720 },
    window: { title: "ALCHEMY.App.Title", icon: "fa-solid fa-flask" },
    actions: {
      craft: AlchemyApp.craft,
      experiment: AlchemyApp.experiment,
      favorite: AlchemyApp.favorite,
      saveNotes: AlchemyApp.saveNotes,
      selectTab: AlchemyApp.selectTab,
      refresh: AlchemyApp.refresh
      ,gmAdmin: AlchemyApp.gmAdmin
    }
  };

  static PARTS = {
    main: { template: PATHS.PLAYER_TEMPLATE, scrollable: [".alchemy-scroll"] }
  };

  constructor(options = {}) {
    super(options);
    this.actor = options.actor ?? activeActor();
    this.activeTab = options.tab ?? "craft";
    this.query = "";
    this.typeFilter = "any";
    this.busy = false;
  }

  get title() {
    return this.actor ? `${localize("ALCHEMY.App.Title", "Alquimia")} — ${this.actor.name}` : localize("ALCHEMY.App.Title", "Alquimia");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (!this.actor) return { ...context, noActor: true };
    assertActorPermission(this.actor);
    const inventory = getActorIngredients(this.actor);
    const knowledge = new Set(getKnowledge(this.actor));
    const favorites = new Set(getFavorites(this.actor));
    const knowledgeEnabled = getSetting("enableKnowledge", true);
    const allRecipes = getRecipes().map(recipe => ({
      ...recipe,
      known: !knowledgeEnabled || knowledge.has(recipe.id),
      favorite: favorites.has(recipe.id),
      craftable: canCraftRecipe(recipe, inventory),
      ingredientText: recipe.ingredients.map(entry => `${entry.quantity}× ${entry.mode === "property" ? entry.properties.join(" + ") : entry.name}`).join(", "),
      typeLabel: localize(`ALCHEMY.Types.${recipe.type}`, recipe.type),
      rarityLabel: localize(`ALCHEMY.Rarities.${recipe.rarity}`, recipe.rarity)
    }));
    const filtered = allRecipes.filter(recipe => recipeSearch(recipe, this.query) && (this.typeFilter === "any" || recipe.type === this.typeFilter));
    return {
      ...context,
      actor: { id: this.actor.id, name: this.actor.name, img: this.actor.img },
      isGM: Boolean(game.user?.isGM),
      activeTab: this.activeTab,
      tabs: ["craft", "library", "ingredients", "known", "history", "notes"].map(id => ({ id, active: id === this.activeTab, label: localize(`ALCHEMY.Tabs.${id}`, id) })),
      ingredients: inventory.map(item => ({ ...item, item: undefined })),
      knownRecipes: filtered.filter(recipe => recipe.known),
      catalogRecipes: filtered.filter(recipe => recipe.known),
      ingredientLibrary: getIngredientLibrary(allRecipes).map(item => ({ ...item, owned: inventory.find(found => found.normalizedName === normalizeText(item.name))?.quantity ?? 0 })),
      allKnownCraftable: filtered.filter(recipe => recipe.known),
      history: getHistory(this.actor).map(entry => ({ ...entry, date: new Date(entry.timestamp).toLocaleString("pt-BR"), outcomeLabel: localize(`ALCHEMY.Outcomes.${entry.result}`, entry.result) })),
      notes: getNotes(this.actor),
      progression: getProgression(this.actor),
      query: this.query,
      typeFilter: this.typeFilter,
      experimentation: getSetting("enableExperimentation", true),
      midiActive: Boolean(game.modules.get("midi-qol")?.active),
      busy: this.busy,
      theme: "dark"
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const search = this.element.querySelector("[data-alchemy-search]");
    search?.addEventListener("input", event => {
      this.query = event.currentTarget.value;
      clearTimeout(this._searchTimeout);
      this._searchTimeout = setTimeout(() => this.render(), 180);
    });
    this.element.querySelectorAll("[data-type-filter]").forEach(button => button.addEventListener("click", event => {
      this.typeFilter = event.currentTarget.dataset.typeFilter || "any";
      this.render();
    }));
  }

  static async craft(_event, target) {
    if (this.busy) return;
    const recipe = getRecipes().find(entry => entry.id === target.dataset.recipeId);
    const selected = selectIngredientsForRecipe(recipe, getActorIngredients(this.actor));
    if (!selected) return notify("warn", "ALCHEMY.Notifications.Insufficient", "Ingredientes insuficientes para esta receita.");
    this.busy = true;
    await this.render();
    try {
      const result = await requestCraft(this.actor, { recipeId: recipe.id, ingredientIds: selected.map(item => item.id), experiment: false });
      notify(result.entry.success ? "info" : "warn", result.entry.success ? "ALCHEMY.Notifications.Success" : "ALCHEMY.Notifications.Failure", result.entry.success ? "Criação concluída." : "A criação falhou.");
    } catch (error) {
      console.error(`${MODULE_ID} |`, error);
      notify("error", "ALCHEMY.Notifications.Error", error.message);
    } finally {
      this.busy = false;
      await this.render();
    }
  }

  static async experiment() {
    if (this.busy) return;
    const ids = Array.from(this.element.querySelectorAll("input[name='experimentIngredient']:checked")).map(input => input.value);
    if (![2, 3].includes(ids.length)) return notify("warn", "ALCHEMY.Notifications.SelectTwoOrThree", "Selecione 2 ou 3 ingredientes.");
    this.busy = true;
    await this.render();
    try {
      const result = await requestCraft(this.actor, { ingredientIds: ids, experiment: true });
      notify(result.entry.success ? "info" : "warn", result.entry.success ? "ALCHEMY.Notifications.Discovered" : "ALCHEMY.Notifications.Failure", result.entry.success ? "Experimento concluído e receita identificada." : "O experimento não produziu uma receita válida.");
    } catch (error) {
      notify("error", "ALCHEMY.Notifications.Error", error.message);
    } finally {
      this.busy = false;
      await this.render();
    }
  }

  static async favorite(_event, target) {
    await toggleFavorite(this.actor, target.dataset.recipeId);
    await this.render();
  }

  static async saveNotes() {
    const general = this.element.querySelector("textarea[name='generalNotes']")?.value ?? "";
    const current = getNotes(this.actor);
    await saveNotes(this.actor, { ...current, general });
    notify("info", "ALCHEMY.Notifications.NotesSaved", "Anotações salvas.");
  }

  static selectTab(_event, target) {
    this.activeTab = target.dataset.tab;
    this.render();
  }

  static refresh() { this.render(); }

  static gmAdmin() {
    if (!game.user?.isGM) return;
    game.modules.get(MODULE_ID)?.api?.openGM({ actorId: this.actor.id });
  }
}
