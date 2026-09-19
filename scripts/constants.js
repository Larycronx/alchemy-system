export const MODULE_ID = "alchemy-system";
export const MODULE_TITLE = "Sistema de Alquimia";
export const SCHEMA_VERSION = 3;
export const SOCKET_NAME = `module.${MODULE_ID}`;
export const FLAG_KEYS = Object.freeze({
  KNOWLEDGE: "knowledge",
  HISTORY: "history",
  NOTES: "notes",
  FAVORITES: "favorites",
  LOCK: "craftLock",
  PROGRESSION: "progression"
});
export const PATHS = Object.freeze({
  PLAYER_TEMPLATE: `modules/${MODULE_ID}/templates/alchemy-main.hbs`,
  GM_TEMPLATE: `modules/${MODULE_ID}/templates/gm-panel.hbs`,
  ICON: `modules/${MODULE_ID}/assets/alchemy.svg`,
  POTION_ICON: `modules/${MODULE_ID}/assets/potion.svg`,
  POISON_ICON: `modules/${MODULE_ID}/assets/poison.svg`,
  INGREDIENT_ICON: `modules/${MODULE_ID}/assets/ingredient.svg`
});
export const MAX_HISTORY_HARD_LIMIT = 500;
export const LOCK_TTL_MS = 30_000;
export const REQUEST_TIMEOUT_MS = 30_000;
