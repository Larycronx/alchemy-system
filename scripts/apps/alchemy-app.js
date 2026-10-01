/**
 * ============================================================
 * INTERFACE DO JOGADOR — SISTEMA DE ALQUIMIA
 * ============================================================
 * Esta classe define a interface principal do jogador para
 * o Sistema de Alquimia. Ela estende ApplicationV2 do Foundry
 * VTT e usa Handlebars para renderizar o template.
 *
 * Funcionalidades:
 * - Visualizar receitas conhecidas e desconhecidas
 * - Fabricar poções, venenos e itens especiais
 * - Experimentar combinações de ingredientes
 * - Gerenciar favoritos e anotações
 * - Visualizar histórico de fabricação
 * ============================================================
 */

import { MODULE_ID, PATHS } from "../constants.js";
import { getFavorites, getHistory, getKnowledge, getNotes, getProgression, saveNotes, toggleFavorite } from "../actor-data.js";
import { getIngredientLibrary, getRecipes, recipeSearch } from "../data.js";
import { canCraftRecipe, getActorIngredients, selectIngredientsForRecipe } from "../inventory.js";
import { requestCraft } from "../socket.js";
import { activeActor, assertActorPermission, getSetting, localize, normalizeText, notify } from "../utils.js";
import {
  applyHealing,
  applyInvisibilityEffect,
  applySpeedEffect,
  getHealingFormula,
  getValidHealingTargets,
  getValidPoisonWeapons,
  isHealingPotion,
  isInvisibilityPotion,
  isPoisonItem,
  isSpeedPotion
} from "../effects.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class AlchemyApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * Configurações padrão da aplicação
   * - id: identificador único da janela
   * - classes: classes CSS aplicadas
   * - position: dimensões iniciais
   * - window: título e ícone da janela
   * - actions: mapeamento de ações para métodos estáticos
   */
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
      refresh: AlchemyApp.refresh,
      gmAdmin: AlchemyApp.gmAdmin,
      useItem: AlchemyApp.useItem
    }
  };

  /**
   * Template Handlebars usado para renderizar a interface
   */
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
    return this.actor
      ? `${localize("ALCHEMY.App.Title", "Alquimia")} — ${this.actor.name}`
      : localize("ALCHEMY.App.Title", "Alquimia");
  }

  /**
   * Prepara os dados que serão passados ao template Handlebars.
   * Inclui receitas, ingredientes, histórico, anotações, etc.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    if (!this.actor) return { ...context, noActor: true };

    assertActorPermission(this.actor);

    // Obtém dados do personagem
    const inventory = getActorIngredients(this.actor);
    const knowledge = new Set(getKnowledge(this.actor));
    const favorites = new Set(getFavorites(this.actor));
    const knowledgeEnabled = getSetting("enableKnowledge", true);

    // Prepara receitas com informações adicionais
    const allRecipes = getRecipes().map(recipe => ({
      ...recipe,
      known: !knowledgeEnabled || knowledge.has(recipe.id),
      favorite: favorites.has(recipe.id),
      craftable: canCraftRecipe(recipe, inventory),
      ingredientText: recipe.ingredients.map(entry =>
        `${entry.quantity}× ${entry.mode === "property" ? entry.properties.join(" + ") : entry.name}`
      ).join(", "),
      typeLabel: localize(`ALCHEMY.Types.${recipe.type}`, recipe.type),
      rarityLabel: localize(`ALCHEMY.Rarities.${recipe.rarity}`, recipe.rarity)
    }));

    // Filtra receitas por busca e tipo
    const filtered = allRecipes.filter(recipe =>
      recipeSearch(recipe, this.query) &&
      (this.typeFilter === "any" || recipe.type === this.typeFilter)
    );

    return {
      ...context,
      actor: { id: this.actor.id, name: this.actor.name, img: this.actor.img },
      isGM: Boolean(game.user?.isGM),
      activeTab: this.activeTab,
      tabs: ["craft", "library", "ingredients", "known", "history", "notes"].map(id => ({
        id,
        active: id === this.activeTab,
        label: localize(`ALCHEMY.Tabs.${id}`, id)
      })),
      ingredients: inventory.map(item => ({ ...item, item: undefined })),
      knownRecipes: filtered.filter(recipe => recipe.known),
      catalogRecipes: filtered.filter(recipe => recipe.known),
      ingredientLibrary: getIngredientLibrary(allRecipes).map(item => {
        const owned = inventory
          .filter(found => found.normalizedName === normalizeText(item.name))
          .reduce((total, found) => total + Number(found.quantity || 0), 0);
        return {
          ...item,
          owned,
          missing: owned <= 0
        };
      }),
      allKnownCraftable: filtered.filter(recipe => recipe.known),
      history: getHistory(this.actor).map(entry => ({
        ...entry,
        date: new Date(entry.timestamp).toLocaleString("pt-BR"),
        outcomeLabel: localize(`ALCHEMY.Outcomes.${entry.result}`, entry.result)
      })),
      notes: getNotes(this.actor),
      progression: getProgression(this.actor),
      query: this.query,
      typeFilter: this.typeFilter,
      experimentation: getSetting("enableExperimentation", true),
      midiActive: Boolean(game.modules.get("midi-qol")?.active),
      busy: this.busy,
      theme: getSetting("theme", "dark")
    };
  }

  /**
   * Chamado após a renderização. Adiciona listeners para
   * busca e filtros de tipo.
   */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Listener para campo de busca
    const search = this.element.querySelector("[data-alchemy-search]");
    search?.addEventListener("input", event => {
      this.query = event.currentTarget.value;
      const cursorPosition = event.currentTarget.selectionStart ?? this.query.length;
      clearTimeout(this._searchTimeout);
      this._searchTimeout = setTimeout(async () => {
        await this.render();
        const nextSearch = this.element.querySelector("[data-alchemy-search]");
        if (!nextSearch) return;

        nextSearch.focus();
        const nextPosition = Math.min(cursorPosition, nextSearch.value.length);
        nextSearch.setSelectionRange(nextPosition, nextPosition);
      }, 180);
    });

    // Listeners para filtros de tipo
    this.element.querySelectorAll("[data-type-filter]").forEach(button =>
      button.addEventListener("click", event => {
        this.typeFilter = event.currentTarget.dataset.typeFilter || "any";
        this.render();
      })
    );
  }

  /**
   * ============================================================
   * FABRICAÇÃO DE RECEITA CONHECIDA
   * ============================================================
   * Este método é chamado quando o jogador clica no botão
   * "Criar" em um card de receita. O fluxo é:
   *
   * 1. Verifica se já existe fabricação em andamento
   * 2. Encontra a receita pelo ID
   * 3. Seleciona ingredientes do inventário
   * 4. Envia solicitação de fabricação (via socket ou local)
   * 5. Exibe notificação de sucesso ou falha
   * ============================================================
   */
  static async craft(_event, target) {
    if (this.busy) return;

    const recipe = getRecipes().find(entry => entry.id === target.dataset.recipeId);
    const selected = selectIngredientsForRecipe(recipe, getActorIngredients(this.actor));

    if (!selected) {
      return notify("warn", "ALCHEMY.Notifications.Insufficient", "Ingredientes insuficientes para esta receita.");
    }

    this.busy = true;
    await this.render();

    try {
      const result = await requestCraft(this.actor, {
        recipeId: recipe.id,
        ingredientIds: selected.map(item => item.id),
        experiment: false
      });

      notify(
        result.entry.success ? "info" : "warn",
        result.entry.success ? "ALCHEMY.Notifications.Success" : "ALCHEMY.Notifications.Failure",
        result.entry.success ? "Criação concluída." : "A criação falhou."
      );
    } catch (error) {
      console.error(`${MODULE_ID} |`, error);
      notify("error", "ALCHEMY.Notifications.Error", error.message);
    } finally {
      this.busy = false;
      await this.render();
    }
  }

  /**
   * ============================================================
   * EXPERIMENTAÇÃO COM INGREDIENTES
   * ============================================================
   * Este método é chamado quando o jogador seleciona 2-3
   * ingredientes e clica no botão "Experimentar". O fluxo é:
   *
   * 1. Verifica se já existe fabricação em andamento
   * 2. Obtém IDs dos ingredientes selecionados
   * 3. Valida número de ingredientes (2 ou 3)
   * 4. Envia solicitação de experimentação (via socket ou local)
   * 5. Exibe notificação de descoberta ou falha
   *
   * Se o experimento for bem-sucedido e a receita for
   * "discoverable", o personagem aprende automaticamente.
   * ============================================================
   */
  static async experiment() {
    if (this.busy) return;

    const ids = Array.from(this.element.querySelectorAll("input[name='experimentIngredient']:checked"))
      .map(input => input.value);

    if (![2, 3].includes(ids.length)) {
      return notify("warn", "ALCHEMY.Notifications.SelectTwoOrThree", "Selecione 2 ou 3 ingredientes.");
    }

    this.busy = true;
    await this.render();

    try {
      const result = await requestCraft(this.actor, {
        ingredientIds: ids,
        experiment: true
      });

      notify(
        result.entry.success ? "info" : "warn",
        result.entry.success ? "ALCHEMY.Notifications.Discovered" : "ALCHEMY.Notifications.Failure",
        result.entry.success
          ? "Experimento concluído e receita identificada."
          : "O experimento não produziu uma receita válida."
      );
    } catch (error) {
      notify("error", "ALCHEMY.Notifications.Error", error.message);
    } finally {
      this.busy = false;
      await this.render();
    }
  }

  /**
   * Alterna o status de favorito de uma receita.
   * Receitas favoritas aparecem destacadas na interface.
   */
  static async favorite(_event, target) {
    await toggleFavorite(this.actor, target.dataset.recipeId);
    await this.render();
  }

  /**
   * Salva as anotações gerais do jogador.
   * As anotações são armazenadas em flags do ator.
   */
  static async saveNotes() {
    const general = this.element.querySelector("textarea[name='generalNotes']")?.value ?? "";
    const current = getNotes(this.actor);
    await saveNotes(this.actor, { ...current, general });
    notify("info", "ALCHEMY.Notifications.NotesSaved", "Anotações salvas.");
  }

  /**
   * Seleciona uma aba na interface.
   * Abas disponíveis: craft, library, ingredients, known, history, notes.
   */
  static selectTab(_event, target) {
    this.activeTab = target.dataset.tab;
    this.render();
  }

  /**
   * Atualiza a interface.
   * Útil após mudanças no inventário ou receitas.
   */
  static refresh() {
    this.render();
  }

  /**
   * Abre o painel do Mestre (apenas para GMs).
   * Permite gerenciar receitas, conhecimento e logs.
   */
  static gmAdmin() {
    if (!game.user?.isGM) return;
    game.modules.get(MODULE_ID)?.api?.openGM({ actorId: this.actor?.id });
  }

  /**
   * ============================================================
   * USO DE ITENS DE ALQUIMIA
   * ============================================================
   * Este método é chamado quando o jogador clica no botão
   * "Usar" em um card de receita. O fluxo é:
   *
   * 1. Verifica se já existe fabricação em andamento
   * 2. Encontra a receita pelo ID
   * 3. Verifica se o item é uma poção de cura, invisibilidade,
   *    velocidade ou veneno
   * 4. Para poções de cura, abre diálogo de seleção de alvo
   * 5. Para venenos, abre diálogo de seleção de arma
   * 6. Para outros efeitos, aplica diretamente
   * 7. Exibe notificação de sucesso ou falha
   * ============================================================
   */
  static async useItem(_event, target) {
    if (this.busy) return;

    const recipeId = target.dataset.recipeId;
    const recipe = getRecipes().find(entry => entry.id === recipeId);

    if (!recipe) {
      return notify("error", "ALCHEMY.Notifications.Error", "Receita não encontrada.");
    }

    // Encontra o item no inventário
    const item = this.actor.items.find(item => {
      const itemRecipeId = item.getFlag(MODULE_ID, "recipeId") ?? item.flags?.[MODULE_ID]?.recipeId;
      return itemRecipeId === recipeId;
    });

    if (!item) {
      return notify("warn", "ALCHEMY.Notifications.Error", "Item não encontrado no inventário.");
    }

    const quantity = Number(item.system?.quantity ?? 0);
    if (quantity < 1) {
      return notify("warn", "ALCHEMY.Notifications.NoQuantity", "O item não tem quantidade disponível.");
    }

    this.busy = true;
    await this.render();

    try {
      // Poção de cura
      if (isHealingPotion(item)) {
        const formula = getHealingFormula(item);
        if (!formula) {
          throw new Error("Fórmula de cura não encontrada.");
        }

        const targets = getValidHealingTargets(this.actor);
        if (!targets.length) {
          throw new Error("Nenhum alvo válido encontrado.");
        }

        // Se houver apenas um alvo, usa diretamente
        if (targets.length === 1) {
          const targetActor = game.actors.get(targets[0].id);
          const result = await applyHealing(game.user, this.actor, targetActor, item, formula);
          if (result.success) {
            notify("info", "ALCHEMY.Notifications.ItemUsed", "Cura aplicada com sucesso.");
          }
        } else {
          // Abre diálogo de seleção de alvo
          const targetId = await this._selectTarget(targets);
          if (targetId) {
            const targetActor = game.actors.get(targetId);
            const result = await applyHealing(game.user, this.actor, targetActor, item, formula);
            if (result.success) {
              notify("info", "ALCHEMY.Notifications.ItemUsed", "Cura aplicada com sucesso.");
            }
          }
        }
      }
      // Poção de invisibilidade
      else if (isInvisibilityPotion(item)) {
        const result = await applyInvisibilityEffect(game.user, this.actor, item);
        if (result.success) {
          notify("info", "ALCHEMY.Notifications.EffectApplied", "Invisibilidade ativada.");
        }
      }
      // Poção de velocidade
      else if (isSpeedPotion(item)) {
        const result = await applySpeedEffect(game.user, this.actor, item);
        if (result.success) {
          notify("info", "ALCHEMY.Notifications.EffectApplied", "Velocidade ativada.");
        }
      }
      // Veneno
      else if (isPoisonItem(item)) {
        const weapons = getValidPoisonWeapons(this.actor);
        if (!weapons.length) {
          throw new Error("Nenhuma arma válida encontrada.");
        }

        // Se houver apenas uma arma, usa diretamente
        if (weapons.length === 1) {
          const weapon = this.actor.items.get(weapons[0].id);
          const result = await game.modules.get(MODULE_ID)?.api?.applyPoisonToWeapon(game.user, this.actor, item, weapon);
          if (result?.success) {
            notify("info", "ALCHEMY.Notifications.PoisonApplied", `Veneno aplicado a ${weapon.name}.`);
          }
        } else {
          // Abre diálogo de seleção de arma
          const weaponId = await this._selectWeapon(weapons);
          if (weaponId) {
            const weapon = this.actor.items.get(weaponId);
            const result = await game.modules.get(MODULE_ID)?.api?.applyPoisonToWeapon(game.user, this.actor, item, weapon);
            if (result?.success) {
              notify("info", "ALCHEMY.Notifications.PoisonApplied", `Veneno aplicado a ${weapon.name}.`);
            }
          }
        }
      }
      else {
        throw new Error("Tipo de item não reconhecido.");
      }
    } catch (error) {
      console.error(`${MODULE_ID} |`, error);
      notify("error", "ALCHEMY.Notifications.Error", error.message);
    } finally {
      this.busy = false;
      await this.render();
    }
  }

  /**
   * Abre diálogo para seleção de alvo de cura.
   */
  static async _selectTarget(targets) {
    return new Promise(resolve => {
      const options = targets.map(t =>
        `<option value="${t.id}">${t.name}${t.type === "token" ? " (token)" : ""}</option>`
      ).join("");

      new Dialog({
        title: localize("ALCHEMY.Dialog.SelectTarget", "Selecionar Alvo"),
        content: `<p>${localize("ALCHEMY.Dialog.SelectTargetHint", "Escolha o personagem que receberá o efeito:")}</p>
                  <select name="target" style="width:100%">${options}</select>`,
        buttons: {
          confirm: {
            label: localize("ALCHEMY.Actions.Use", "Usar"),
            callback: html => resolve(html.find("select[name='target']").val())
          },
          cancel: {
            label: localize("ALCHEMY.Actions.Cancel", "Cancelar"),
            callback: () => resolve(null)
          }
        },
        default: "confirm",
        close: () => resolve(null)
      }).render(true);
    });
  }

  /**
   * Abre diálogo para seleção de arma para aplicação de veneno.
   */
  static async _selectWeapon(weapons) {
    return new Promise(resolve => {
      const options = weapons.map(w =>
        `<option value="${w.id}">${w.name}${w.isDagger ? " (adaga)" : ""}${w.hasPoison ? " (já envenenada)" : ""}</option>`
      ).join("");

      new Dialog({
        title: localize("ALCHEMY.Dialog.SelectWeapon", "Selecionar Arma"),
        content: `<p>${localize("ALCHEMY.Dialog.SelectWeaponHint", "Escolha a arma que receberá o veneno:")}</p>
                  <select name="weapon" style="width:100%">${options}</select>`,
        buttons: {
          confirm: {
            label: localize("ALCHEMY.Actions.ApplyPoison", "Aplicar Veneno"),
            callback: html => resolve(html.find("select[name='weapon']").val())
          },
          cancel: {
            label: localize("ALCHEMY.Actions.Cancel", "Cancelar"),
            callback: () => resolve(null)
          }
        },
        default: "confirm",
        close: () => resolve(null)
      }).render(true);
    });
  }
}

// ============================================================
// FIM DA INTERFACE DO JOGADOR
// ============================================================
// Para adicionar novas funcionalidades:
// - Adicione métodos estáticos para ações
// - Adicione entradas ao mapa "actions" em DEFAULT_OPTIONS
// - Documente o propósito de cada método
// ============================================================

// ============================================================
// FIM DO ARQUIVO DA INTERFACE DO JOGADOR
// ============================================================
// Esta classe define a interface principal do jogador para
// o Sistema de Alquimia. Ela estende ApplicationV2 do Foundry
// VTT e usa Handlebars para renderizar o template.
// ============================================================
