import { MODULE_ID } from "./constants.js";
import { DEFAULT_RECIPES } from "./data.js";
import { deepClone } from "./utils.js";

const worldBoolean = (key, defaultValue) => game.settings.register(MODULE_ID, key, {
  name: `ALCHEMY.Settings.${key}.Name`, hint: `ALCHEMY.Settings.${key}.Hint`, scope: "world", config: true, type: Boolean, default: defaultValue
});

export function registerSettings() {
  game.settings.register(MODULE_ID, "recipes", { scope: "world", config: false, type: Object, default: deepClone(DEFAULT_RECIPES) });
  game.settings.register(MODULE_ID, "gmLogs", { scope: "world", config: false, type: Object, default: [] });
  game.settings.register(MODULE_ID, "schemaVersion", { scope: "world", config: false, type: Number, default: 0 });

  worldBoolean("enableKnowledge", true);
  worldBoolean("enableExperimentation", true);
  worldBoolean("consumeIngredients", true);
  worldBoolean("consumeOnFailure", false);
  worldBoolean("enableChecks", true);
  worldBoolean("allowFailures", true);
  worldBoolean("autoDiscover", true);
  worldBoolean("ingredientNameFallback", true);
  worldBoolean("requireEquipment", false);
  worldBoolean("enableNotifications", true);
  worldBoolean("gmCanReadNotes", false);
  worldBoolean("debug", false);

  game.settings.register(MODULE_ID, "unknownDisplay", {
    name: "ALCHEMY.Settings.unknownDisplay.Name", hint: "ALCHEMY.Settings.unknownDisplay.Hint", scope: "world", config: true, type: String,
    choices: { silhouette: "ALCHEMY.Settings.unknownDisplay.Silhouette", names: "ALCHEMY.Settings.unknownDisplay.Names", hidden: "ALCHEMY.Settings.unknownDisplay.Hidden" }, default: "silhouette"
  });
  game.settings.register(MODULE_ID, "failureMode", {
    name: "ALCHEMY.Settings.failureMode.Name", hint: "ALCHEMY.Settings.failureMode.Hint", scope: "world", config: true, type: String,
    choices: { simple: "ALCHEMY.Settings.failureMode.Simple", defective: "ALCHEMY.Settings.failureMode.Defective" }, default: "simple"
  });
  game.settings.register(MODULE_ID, "chatVisibility", {
    name: "ALCHEMY.Settings.chatVisibility.Name", hint: "ALCHEMY.Settings.chatVisibility.Hint", scope: "world", config: true, type: String,
    choices: { all: "ALCHEMY.Settings.chatVisibility.All", owner: "ALCHEMY.Settings.chatVisibility.Owner", gm: "ALCHEMY.Settings.chatVisibility.GM", none: "ALCHEMY.Settings.chatVisibility.None" }, default: "all"
  });
  game.settings.register(MODULE_ID, "maxHistory", {
    name: "ALCHEMY.Settings.maxHistory.Name", hint: "ALCHEMY.Settings.maxHistory.Hint", scope: "world", config: true, type: Number, default: 200, range: { min: 25, max: 500, step: 25 }
  });
  game.settings.register(MODULE_ID, "theme", {
    name: "ALCHEMY.Settings.theme.Name", hint: "ALCHEMY.Settings.theme.Hint", scope: "client", config: true, type: String,
    choices: { parchment: "ALCHEMY.Settings.theme.Parchment", dark: "ALCHEMY.Settings.theme.Dark", light: "ALCHEMY.Settings.theme.Light" }, default: "dark"
  });
  game.settings.register(MODULE_ID, "tutorialSeen", { scope: "client", config: false, type: Boolean, default: false });
}
