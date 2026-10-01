/**
 * ============================================================
 * PAINEL DO MESTRE — SISTEMA DE ALQUIMIA
 * ============================================================
 * Esta classe define a interface do Mestre para o Sistema de
 * Alquimia. Ela estende ApplicationV2 do Foundry VTT e usa
 * Handlebars para renderizar o template.
 *
 * Funcionalidades:
 * - Criar, editar, duplicar e excluir receitas
 * - Gerenciar conhecimento de personagens
 * - Visualizar logs globais
 * - Importar e exportar receitas
 * - Resetar progressão de personagens
 * ============================================================
 */

import { MODULE_ID, PATHS } from "../constants.js";
import { clearHistory, clearKnowledge, getKnowledge, getNotes, lockRecipe, resetProgression, setKnowledge } from "../actor-data.js";
import { deleteRecipe, getRecipes, saveRecipes, upsertRecipe, validateRecipe } from "../data.js";
import { deepClone, localize, notify, randomId, saveJson } from "../utils.js";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class AlchemyGMApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * Configurações padrão da aplicação
   */
  static DEFAULT_OPTIONS = {
    id: "alchemy-system-gm",
    classes: ["alchemy-system", "alchemy-gm"],
    position: { width: 1040, height: 760 },
    window: { title: "ALCHEMY.GM.Title", icon: "fa-solid fa-flask-vial" },
    actions: {
      newRecipe: AlchemyGMApp.newRecipe,
      editRecipe: AlchemyGMApp.editRecipe,
      saveRecipe: AlchemyGMApp.saveRecipe,
      duplicateRecipe: AlchemyGMApp.duplicateRecipe,
      deleteRecipe: AlchemyGMApp.deleteRecipe,
      saveKnowledge: AlchemyGMApp.saveKnowledge,
      clearKnowledge: AlchemyGMApp.clearKnowledge,
      clearHistory: AlchemyGMApp.clearHistory,
      resetProgression: AlchemyGMApp.resetProgression,
      revokeKnowledge: AlchemyGMApp.revokeKnowledge,
      selectActor: AlchemyGMApp.selectActor,
      exportData: AlchemyGMApp.exportData,
      importData: AlchemyGMApp.importData,
      resetExamples: AlchemyGMApp.resetExamples
    }
  };

  /**
   * Template Handlebars usado para renderizar a interface
   */
  static PARTS = {
    main: { template: PATHS.GM_TEMPLATE, scrollable: [".alchemy-scroll"] }
  };

  constructor(options = {}) {
    super(options);
    this.editingId = options.recipeId ?? null;
    this.actorId = options.actorId ?? null;
  }

  /**
   * Prepara os dados que serão passados ao template Handlebars.
   * Inclui receitas, atores, conhecimento, logs, etc.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    if (!game.user.isGM) {
      throw new Error("Acesso exclusivo do Mestre.");
    }

    const recipes = getRecipes();

    // Prepara receita em edição
    const editing = recipes.find(recipe => recipe.id === this.editingId) ??
      (this.editingId === "__new__" ? {
        id: "__new__",
        name: "",
        type: "potion",
        category: "Geral",
        rarity: "common",
        description: "",
        img: PATHS.POTION_ICON,
        tags: [],
        ingredients: [
          { name: "", quantity: 1, mode: "item", properties: [] },
          { name: "", quantity: 1, mode: "item", properties: [] }
        ],
        result: { name: "", type: "consumable", img: PATHS.POTION_ICON, description: "", quantity: 1, formula: "", effects: [] },
        check: { enabled: true, type: "skill", key: "arc", dc: 10, formula: "1d20" },
        discoverable: true,
        secret: false,
        craftingTime: 0,
        equipment: []
      } : null);

    // Prepara lista de atores
    const actors = Array.from(game.actors ?? [])
      .filter(actor => ["character", "npc"].includes(actor.type))
      .map(actor => ({
        id: actor.id,
        name: actor.name,
        selected: actor.id === this.actorId
      }));

    // Prepara conhecimento do ator selecionado
    const actor = game.actors.get(this.actorId) ?? null;
    const known = new Set(actor ? getKnowledge(actor) : []);

    // Prepara logs globais
    const logs = game.settings.get(MODULE_ID, "gmLogs");

    return {
      ...context,
      recipes: recipes.map(recipe => ({
        ...recipe,
        ingredientText: recipe.ingredients.map(i =>
          `${i.quantity}|${i.mode === "property" ? `@${i.properties.join("+")}` : i.name}`
        ).join("\n")
      })),
      editing: editing ? {
        ...editing,
        ingredientsEditor: editing.ingredients.map(i =>
          `${i.quantity}|${i.mode === "property" ? `@${i.properties.join("+")}` : i.name}`
        ).join("\n"),
        tagsEditor: editing.tags.join(", "),
        equipmentEditor: editing.equipment.join(", ")
      } : null,
      actors,
      selectedActor: actor ? { id: actor.id, name: actor.name } : null,
      knowledgeRecipes: recipes.map(recipe => ({
        id: recipe.id,
        name: recipe.name,
        checked: known.has(recipe.id)
      })),
      logs: (Array.isArray(logs) ? logs : []).slice().reverse().map(entry => ({
        ...entry,
        date: new Date(entry.timestamp).toLocaleString("pt-BR")
      })),
      actorNotes: actor && game.settings.get(MODULE_ID, "gmCanReadNotes") ? getNotes(actor).general : null,
      typeChoices: { potion: "Poção", poison: "Veneno", special: "Especial" },
      checkTypeChoices: { skill: "Perícia", ability: "Atributo", formula: "Fórmula" }
    };
  }

  /**
   * Cria uma nova receita
   */
  static newRecipe() {
    this.editingId = "__new__";
    this.render();
  }

  /**
   * Edita uma receita existente
   */
  static editRecipe(_event, target) {
    this.editingId = target.dataset.recipeId;
    this.render();
  }

  /**
   * Salva a receita em edição
   */
  static async saveRecipe() {
    const form = this.element.querySelector("form[data-recipe-editor]");
    if (!form) return;

    const fd = new FormData(form);

    // Processa ingredientes (formato: "quantidade|nome" ou "quantidade|@propriedade+propriedade")
    const ingredients = String(fd.get("ingredients") || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [qtyText, ...nameParts] = line.split("|");
        const raw = nameParts.join("|").trim();
        if (raw.startsWith("@")) {
          return {
            quantity: Number(qtyText || 1),
            mode: "property",
            name: "",
            properties: raw.slice(1).split("+").map(v => v.trim()).filter(Boolean)
          };
        }
        return { quantity: Number(qtyText || 1), mode: "item", name: raw, properties: [] };
      });

    const existing = getRecipes().find(recipe => recipe.id === this.editingId);

    const recipe = validateRecipe({
      ...(existing ?? {}),
      id: existing?.id ?? randomId(),
      name: fd.get("name"),
      type: fd.get("type"),
      category: fd.get("category"),
      rarity: fd.get("rarity"),
      description: fd.get("description"),
      img: fd.get("img"),
      tags: String(fd.get("tags") || "").split(",").map(v => v.trim()).filter(Boolean),
      ingredients,
      result: {
        ...(existing?.result ?? {}),
        name: fd.get("resultName"),
        type: fd.get("resultType") || "consumable",
        img: fd.get("img"),
        description: fd.get("resultDescription"),
        quantity: Number(fd.get("resultQuantity") || 1),
        formula: fd.get("formula")
      },
      check: {
        enabled: fd.get("checkEnabled") === "on",
        type: fd.get("checkType"),
        key: fd.get("checkKey"),
        dc: Number(fd.get("dc") || 10),
        formula: fd.get("checkFormula")
      },
      discoverable: fd.get("discoverable") === "on",
      secret: fd.get("secret") === "on",
      craftingTime: Number(fd.get("craftingTime") || 0),
      equipment: String(fd.get("equipment") || "").split(",").map(v => v.trim()).filter(Boolean)
    });

    await upsertRecipe(recipe);
    this.editingId = recipe.id;
    notify("info", "ALCHEMY.Notifications.RecipeSaved", "Receita salva.");
    await this.render();
  }

  /**
   * Duplica uma receita existente
   */
  static async duplicateRecipe(_event, target) {
    const source = getRecipes().find(recipe => recipe.id === target.dataset.recipeId);
    if (!source) return;

    const copy = deepClone(source);
    copy.id = randomId();
    copy.name = `${copy.name} (cópia)`;

    await upsertRecipe(copy);
    this.editingId = copy.id;
    await this.render();
  }

  /**
   * Exclui uma receita (com confirmação)
   */
  static async deleteRecipe(_event, target) {
    const confirmed = await DialogV2.confirm({
      window: { title: localize("ALCHEMY.GM.Delete", "Excluir receita") },
      content: `<p>${localize("ALCHEMY.GM.DeleteConfirm", "Esta ação removerá a receita da biblioteca global.")}</p>`,
      modal: true
    });

    if (!confirmed) return;

    await deleteRecipe(target.dataset.recipeId);
    this.editingId = null;
    await this.render();
  }

  /**
   * Limpa o conhecimento de um personagem (com confirmação)
   */
  static async clearKnowledge() {
    const actor = game.actors.get(this.actorId);
    if (!actor) return notify("warn", "ALCHEMY.Notifications.NoActor", "Selecione um personagem.");

    const confirmed = await DialogV2.confirm({
      window: { title: localize("ALCHEMY.GM.ClearKnowledge", "Limpar conhecimento") },
      content: `<p>${localize("ALCHEMY.GM.ClearKnowledgeConfirm", "Remover todas as receitas conhecidas por este personagem?")}</p>`,
      modal: true
    });

    if (!confirmed) return;

    await clearKnowledge(actor, { gmOverride: true });
    notify("info", "ALCHEMY.Notifications.KnowledgeCleared", "Conhecimento removido.");
    await this.render();
  }

  /**
   * Limpa o histórico de um personagem (com confirmação)
   */
  static async clearHistory() {
    const actor = game.actors.get(this.actorId);
    if (!actor) return notify("warn", "ALCHEMY.Notifications.NoActor", "Selecione um personagem.");

    const confirmed = await DialogV2.confirm({
      window: { title: localize("ALCHEMY.GM.ClearHistory", "Limpar histórico") },
      content: `<p>${localize("ALCHEMY.GM.ClearHistoryConfirm", "Apagar todo o histórico de fabricação deste personagem?")}</p>`,
      modal: true
    });

    if (!confirmed) return;

    await clearHistory(actor, { gmOverride: true });
    notify("info", "ALCHEMY.Notifications.HistoryCleared", "Histórico removido.");
    await this.render();
  }

  /**
   * Remove uma receita do conhecimento de um personagem
   */
  static async revokeKnowledge(_event, target) {
    const actor = game.actors.get(this.actorId);
    if (!actor) return notify("warn", "ALCHEMY.Notifications.NoActor", "Selecione um personagem.");

    await lockRecipe(actor, target.dataset.recipeId, { gmOverride: true });
    notify("info", "ALCHEMY.Notifications.KnowledgeRevoked", "Receita removida do livro do personagem.");
    await this.render();
  }

  /**
   * Reseta a progressão de um personagem (com confirmação)
   */
  static async resetProgression() {
    const actor = game.actors.get(this.actorId);
    if (!actor) return notify("warn", "ALCHEMY.Notifications.NoActor", "Selecione um personagem.");

    const confirmed = await DialogV2.confirm({
      window: { title: localize("ALCHEMY.GM.ResetProgression", "Resetar XP alquímico") },
      content: `<p>${localize("ALCHEMY.GM.ResetProgressionConfirm", "Zerar XP, retornar o nível alquímico para 1 e remover especializações deste personagem?")}</p>`,
      modal: true
    });

    if (!confirmed) return;

    await resetProgression(actor, { gmOverride: true });
    notify("info", "ALCHEMY.Notifications.ProgressionReset", "XP e progressão alquímica resetados.");
    await this.render();
  }

  /**
   * Seleciona um personagem para gerenciar conhecimento
   */
  static selectActor(_event, target) {
    this.actorId = target.value;
    this.render();
  }

  /**
   * Salva o conhecimento de um personagem
   */
  static async saveKnowledge() {
    const actor = game.actors.get(this.actorId);
    if (!actor) return notify("warn", "ALCHEMY.Notifications.NoActor", "Selecione um personagem.");

    const ids = Array.from(this.element.querySelectorAll("input[name='knowledge']:checked"))
      .map(input => input.value);

    await setKnowledge(actor, ids, { gmOverride: true });
    notify("info", "ALCHEMY.Notifications.KnowledgeSaved", "Conhecimento atualizado.");
  }

  /**
   * Exporta receitas para arquivo JSON
   */
  static exportData() {
    saveJson({
      format: "alchemy-system",
      version: 1,
      exportedAt: new Date().toISOString(),
      recipes: getRecipes()
    }, `alchemy-recipes-${Date.now()}.json`);
  }

  /**
   * Abre diálogo de importação de receitas
   */
  static importData() {
    this.element.querySelector("input[data-import-file]")?.click();
  }

  /**
   * Chamado após a renderização. Adiciona listeners para
   * seleção de ator e importação de arquivo.
   */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Listener para seleção de ator
    this.element.querySelector("select[data-actor-select]")?.addEventListener("change", event => {
      this.actorId = event.currentTarget.value;
      this.render();
    });

    // Listener para importação de arquivo
    this.element.querySelector("input[data-import-file]")?.addEventListener("change", async event => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;

      try {
        const parsed = JSON.parse(await file.text());
        if (parsed.format !== "alchemy-system" || !Array.isArray(parsed.recipes)) {
          throw new Error("Formato de importação inválido.");
        }

        await saveRecipes(parsed.recipes);
        notify("info", "ALCHEMY.Notifications.Imported", "Receitas importadas.");
        await this.render();
      } catch (error) {
        notify("error", "ALCHEMY.Notifications.Error", error.message);
      }
    });
  }

  /**
   * Restaura receitas de exemplo (padrão + expandidas)
   */
  static async resetExamples() {
    const { DEFAULT_RECIPES, EXPANDED_RECIPES } = await import("../data.js");
    await saveRecipes(deepClone([...DEFAULT_RECIPES, ...EXPANDED_RECIPES]));
    await this.render();
  }
}

// ============================================================
// FIM DO PAINEL DO MESTRE
// ============================================================
// Para adicionar novas funcionalidades:
// - Adicione métodos estáticos para ações
// - Adicione entradas ao mapa "actions" em DEFAULT_OPTIONS
// - Documente o propósito de cada método
// ============================================================

// ============================================================
// FIM DO ARQUIVO DO PAINEL DO MESTRE
// ============================================================
// Esta classe define a interface do Mestre para o Sistema de
// Alquimia. Ela estende ApplicationV2 do Foundry VTT e usa
// Handlebars para renderizar o template.
// ============================================================
