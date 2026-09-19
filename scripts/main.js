import { MODULE_ID, MODULE_TITLE, PATHS } from "./constants.js";
import { AlchemyAPI, openAlchemy, openGM } from "./api.js";
import { initializeData } from "./data.js";
import { midiStatus } from "./midi.js";
import { registerSettings } from "./settings.js";
import { registerSocket } from "./socket.js";
import { activeActor, debug, notify } from "./utils.js";

function refreshAlchemyWindows() {
  for (const app of Object.values(ui.windows ?? {})) {
    if (app?.id === "alchemy-system-player" || app?.id === "alchemy-system-gm") app.render();
  }
}

Hooks.once("init", () => {
  registerSettings();
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = AlchemyAPI;
  globalThis.AlchemyModule = AlchemyAPI;
  console.info(`${MODULE_TITLE} | Inicializado para Foundry VTT v13.`);
});

Hooks.once("ready", async () => {
  registerSocket();
  await initializeData();
  debug("Módulo pronto", { version: game.version, system: game.system.id, midi: midiStatus() });
  if (!game.settings.get(MODULE_ID, "tutorialSeen")) {
    notify("info", "ALCHEMY.Tutorial.Welcome", "Bem-vindo ao Sistema de Alquimia! Use o botão de frasco no chat.");
    await game.settings.set(MODULE_ID, "tutorialSeen", true);
  }
});

/** Foundry v13 fornece um mapa de elementos adotados pelo ChatLog. */
Hooks.on("renderChatInput", (_app, elements) => {
  const root = elements instanceof HTMLElement ? elements : (elements?.chat ?? elements?.textarea?.parentElement ?? Object.values(elements ?? {})[0]);
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
    try { openAlchemy(activeActor()); } catch (error) { notify("warn", "ALCHEMY.Notifications.NoActor", error.message); }
  });
  parent.append(button);
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;
  const tokenControls = Array.isArray(controls) ? controls.find(control => control.name === "token") : controls?.tokens;
  if (!tokenControls?.tools) return;
  const tool = {
    name: "alchemy-system", title: "ALCHEMY.GM.Title", icon: "fa-solid fa-flask-vial", button: true, visible: true,
    onClick: () => openGM()
  };
  if (Array.isArray(tokenControls.tools)) tokenControls.tools.push(tool);
  else tokenControls.tools.alchemySystem = tool;
});

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

Hooks.on("updateItem", item => {
  if (item.parent?.documentName === "Actor") {
    document.querySelector(`#alchemy-system-player`) && debug("Inventário alterado", item.name);
    refreshAlchemyWindows();
  }
});

Hooks.on("updateActor", actor => {
  if (actor) refreshAlchemyWindows();
});

Hooks.on("updateSetting", setting => {
  if (setting?.key?.startsWith(`${MODULE_ID}.`)) refreshAlchemyWindows();
});

Hooks.on("alchemyRecipesUpdated", refreshAlchemyWindows);

export { AlchemyAPI, openAlchemy, openGM, PATHS };
