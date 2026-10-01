/**
 * ============================================================
 * PONTO DE ENTRADA DO MÓDULO
 * ============================================================
 * Este arquivo é o ponto de entrada do módulo. Ele registra:
 *
 * 1. Configurações do módulo
 * 2. API pública
 * 3. Hooks do Foundry VTT
 * 4. Socket para comunicação entre clientes
 *
 * Hooks registrados:
 * - "init": inicialização do módulo
 * - "ready": módulo pronto para uso
 * - "renderChatInput": adiciona botão de frasco no chat
 * - "getSceneControlButtons": adiciona controle de token para GM
 * - "renderActorSheetV2": adiciona botão na ficha de ator
 * - "updateItem": atualiza interface quando inventário muda
 * - "updateActor": atualiza interface quando ator muda
 * - "updateSetting": atualiza interface quando configuração muda
 * - "alchemyRecipesUpdated": atualiza interface quando receitas mudam
 * ============================================================
 */

import { MODULE_ID, MODULE_TITLE, PATHS } from "./constants.js";
import { AlchemyAPI, openAlchemy, openGM } from "./api.js";
import { initializeData } from "./data.js";
import { midiStatus } from "./midi.js";
import { registerSettings } from "./settings.js";
import { registerSocket } from "./socket.js";
import { activeActor, debug, notify } from "./utils.js";

/**
 * Atualiza todas as janelas abertas do módulo.
 * Chamado quando dados relevantes mudam.
 */
function refreshAlchemyWindows() {
  for (const app of Object.values(ui.windows ?? {})) {
    if (app?.id === "alchemy-system-player" || app?.id === "alchemy-system-gm") {
      app.render();
    }
  }
}

function patchPolyglotChatCompatibility() {
  const polyglot = game.polyglot;
  if (!polyglot || typeof globalThis.$ !== "function" || typeof polyglot.chatElement?.find === "function") return;

  Object.defineProperty(polyglot, "chatElement", {
    configurable: true,
    get() {
      const element = ui.sidebar?.popouts?.chat?.element ?? ui.chat?.element;
      return typeof element?.find === "function" ? element : globalThis.$(element);
    }
  });
}

/**
 * ============================================================
 * HOOK: init
 * ============================================================
 * Chamado quando o módulo é inicializado.
 * Registra configurações e API pública.
 * ============================================================
 */
Hooks.once("init", () => {
  registerSettings();

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = AlchemyAPI;
  }
  globalThis.AlchemyModule = AlchemyAPI;

  console.info(`${MODULE_TITLE} | Inicializado para Foundry VTT v13.`);
});

/**
 * ============================================================
 * HOOK: ready
 * ============================================================
 * Chamado quando o módulo está pronto para uso.
 * Registra socket e inicializa dados.
 * ============================================================
 */
Hooks.once("ready", async () => {
  patchPolyglotChatCompatibility();
  registerSocket();
  await initializeData();

  debug("Módulo pronto", {
    version: game.version,
    system: game.system.id,
    midi: midiStatus()
  });

  // Mostra mensagem de boas-vindas na primeira vez
  if (!game.settings.get(MODULE_ID, "tutorialSeen")) {
    notify("info", "ALCHEMY.Tutorial.Welcome", "Bem-vindo ao Sistema de Alquimia! Use o botão de frasco no chat.");
    await game.settings.set(MODULE_ID, "tutorialSeen", true);
  }
});

/**
 * ============================================================
 * HOOK: renderChatInput
 * ============================================================
 * Adiciona um botão de frasco na barra de chat.
 * O botão abre a interface do jogador.
 * ============================================================
 */
Hooks.on("renderChatInput", (_app, elements) => {
  const root = elements instanceof HTMLElement
    ? elements
    : (elements?.chat ?? elements?.textarea?.parentElement ?? Object.values(elements ?? {})[0]);
  const parent = root?.parentElement ?? root;

  if (!parent || parent.querySelector?.("[data-alchemy-chat-button]")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "ui-control icon alchemy-chat-button";
  button.dataset.alchemyChatButton = "true";
  button.dataset.tooltip = "ALCHEMY.App.Open";
  button.setAttribute("aria-label", game.i18n.localize("ALCHEMY.App.Open"));
  button.innerHTML = '<i class="fa-solid fa-flask" aria-hidden="true"></i>';

  button.addEventListener("click", () => {
    try {
      openAlchemy(activeActor());
    } catch (error) {
      notify("warn", "ALCHEMY.Notifications.NoActor", error.message);
    }
  });

  parent.append(button);
});

/**
 * ============================================================
 * HOOK: getSceneControlButtons
 * ============================================================
 * Adiciona um controle de token para o Mestre.
 * O controle abre o painel do Mestre.
 * ============================================================
 */
Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;

  const tokenControls = Array.isArray(controls)
    ? controls.find(control => control.name === "token")
    : controls?.tokens;

  if (!tokenControls?.tools) return;

  const tool = {
    name: "alchemy-system",
    title: "ALCHEMY.GM.Title",
    icon: "fa-solid fa-flask-vial",
    button: true,
    visible: true,
    onClick: () => openGM()
  };

  if (Array.isArray(tokenControls.tools)) {
    tokenControls.tools.push(tool);
  } else {
    tokenControls.tools.alchemySystem = tool;
  }
});

/**
 * ============================================================
 * HOOK: renderActorSheetV2
 * ============================================================
 * Adiciona um botão na ficha de ator.
 * O botão abre a interface do jogador.
 * ============================================================
 */
Hooks.on("renderActorSheetV2", (_sheet, element, context) => {
  const actor = context?.document ?? context?.actor;
  const header = element?.querySelector?.(".window-header");

  if (!actor || !header || header.querySelector("[data-open-alchemy]")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "header-control icon";
  button.dataset.openAlchemy = "true";
  button.dataset.tooltip = "ALCHEMY.App.Open";
  button.innerHTML = '<i class="fa-solid fa-flask"></i>';

  button.addEventListener("click", () => openAlchemy(actor));
  header.append(button);
});

/**
 * ============================================================
 * HOOK: updateItem
 * ============================================================
 * Atualiza a interface quando um item é adicionado ou
 * removido do inventário de um ator.
 * ============================================================
 */
Hooks.on("updateItem", item => {
  if (item.parent?.documentName === "Actor") {
    document.querySelector(`#alchemy-system-player`) && debug("Inventário alterado", item.name);
    refreshAlchemyWindows();
  }
});

/**
 * ============================================================
 * HOOK: updateActor
 * ============================================================
 * Atualiza a interface quando um ator é atualizado.
 * ============================================================
 */
Hooks.on("updateActor", actor => {
  if (actor) refreshAlchemyWindows();
});

/**
 * ============================================================
 * HOOK: updateSetting
 * ============================================================
 * Atualiza a interface quando uma configuração do módulo
 * é alterada.
 * ============================================================
 */
Hooks.on("updateSetting", setting => {
  if (setting?.key?.startsWith(`${MODULE_ID}.`)) {
    refreshAlchemyWindows();
  }
});

/**
 * ============================================================
 * HOOK: alchemyRecipesUpdated
 * ============================================================
 * Atualiza a interface quando a lista de receitas é
 * atualizada (criar, editar, excluir, importar).
 * ============================================================
 */
Hooks.on("alchemyRecipesUpdated", refreshAlchemyWindows);

/**
 * ============================================================
 * HOOK: afterAlchemyHealing
 * ============================================================
 * Atualiza a interface quando uma cura é aplicada.
 * ============================================================
 */
Hooks.on("afterAlchemyHealing", ({ target }) => {
  if (target) {
    target.sheet?.render();
    const tokens = canvas?.tokens?.placeables?.filter(t => t.actor?.id === target.id) ?? [];
    for (const token of tokens) token.refresh();
  }
});

/**
 * ============================================================
 * HOOK: afterAlchemyEffectApplied
 * ============================================================
 * Atualiza a interface quando um efeito é aplicado.
 * ============================================================
 */
Hooks.on("afterAlchemyEffectApplied", ({ actor }) => {
  if (actor) {
    actor.sheet?.render();
    const tokens = canvas?.tokens?.placeables?.filter(t => t.actor?.id === actor.id) ?? [];
    for (const token of tokens) token.refresh();
  }
});

/**
 * ============================================================
 * HOOK: afterAlchemyPoisonApplied
 * ============================================================
 * Atualiza a interface quando um veneno é aplicado.
 * ============================================================
 */
Hooks.on("afterAlchemyPoisonApplied", ({ actor }) => {
  if (actor) {
    actor.sheet?.render();
    const tokens = canvas?.tokens?.placeables?.filter(t => t.actor?.id === actor.id) ?? [];
    for (const token of tokens) token.refresh();
  }
});

/**
 * ============================================================
 * HOOK: afterAlchemyPoisonUse
 * ============================================================
 * Atualiza a interface quando um veneno é consumido.
 * ============================================================
 */
Hooks.on("afterAlchemyPoisonUse", ({ weaponItem }) => {
  if (weaponItem?.parent) {
    weaponItem.parent.sheet?.render();
    const tokens = canvas?.tokens?.placeables?.filter(t => t.actor?.id === weaponItem.parent.id) ?? [];
    for (const token of tokens) token.refresh();
  }
});

/**
 * ============================================================
 * HOOK: createActiveEffect
 * ============================================================
 * Atualiza a interface quando um Active Effect é criado.
 * ============================================================
 */
Hooks.on("createActiveEffect", (effect) => {
  if (effect?.parent) {
    effect.parent.sheet?.render();
  }
});

/**
 * ============================================================
 * HOOK: updateActiveEffect
 * ============================================================
 * Atualiza a interface quando um Active Effect é atualizado.
 * ============================================================
 */
Hooks.on("updateActiveEffect", (effect) => {
  if (effect?.parent) {
    effect.parent.sheet?.render();
  }
});

/**
 * ============================================================
 * HOOK: deleteActiveEffect
 * ============================================================
 * Atualiza a interface quando um Active Effect é removido.
 * ============================================================
 */
Hooks.on("deleteActiveEffect", (effect) => {
  if (effect?.parent) {
    effect.parent.sheet?.render();
  }
});

// ============================================================
// EXPORTAÇÕES
// ============================================================
// Exporta a API pública e funções úteis para outros módulos.
// ============================================================
export { AlchemyAPI, openAlchemy, openGM, PATHS };

// ============================================================
// FIM DO PONTO DE ENTRADA DO MÓDULO
// ============================================================
// Este arquivo é o ponto de entrada do módulo. Ele registra:
// - Configurações do módulo
// - API pública
// - Hooks do Foundry VTT
// - Socket para comunicação entre clientes
// ============================================================

// ============================================================
// FIM DO ARQUIVO PRINCIPAL
// ============================================================
// Este arquivo é o ponto de entrada do módulo. Ele registra
// todas as configurações, hooks e sockets necessários para o
// funcionamento do Sistema de Alquimia.
// ============================================================
