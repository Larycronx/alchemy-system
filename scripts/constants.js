/**
 * ============================================================
 * CONSTANTES DO MÓDULO
 * ============================================================
 * Este arquivo define todas as constantes usadas no módulo.
 * Centralizar constantes facilita a manutenção e evita
 * erros de digitação.
 * ============================================================
 */

/** ID único do módulo (usado em flags, settings, etc) */
export const MODULE_ID = "alchemy-system";

/** Nome exibido do módulo */
export const MODULE_TITLE = "Sistema de Alquimia";

/** Versão do schema de dados (para migrações) */
export const SCHEMA_VERSION = 4;

/** Nome do socket para comunicação entre clientes */
export const SOCKET_NAME = `module.${MODULE_ID}`;

/**
 * Chaves de flags usadas para armazenar dados dos atores.
 * Todas as flags são armazenadas em flags[MODULE_ID][CHAVE].
 */
export const FLAG_KEYS = Object.freeze({
  KNOWLEDGE: "knowledge",      // Receitas conhecidas
  HISTORY: "history",          // Histórico de fabricação
  NOTES: "notes",              // Anotações do laboratório
  FAVORITES: "favorites",      // Receitas favoritas
  LOCK: "craftLock",           // Bloqueio de fabricação
  PROGRESSION: "progression"   // XP e nível alquímico
});

/**
 * Caminhos de templates e assets.
 * Usados para carregar templates Handlebars e imagens.
 */
export const PATHS = Object.freeze({
  PLAYER_TEMPLATE: `modules/${MODULE_ID}/templates/alchemy-main.hbs`,
  GM_TEMPLATE: `modules/${MODULE_ID}/templates/gm-panel.hbs`,
  ICON: `modules/${MODULE_ID}/assets/alchemy.svg`,
  POTION_ICON: `modules/${MODULE_ID}/assets/potion.svg`,
  POISON_ICON: `modules/${MODULE_ID}/assets/poison.svg`,
  INGREDIENT_ICON: `modules/${MODULE_ID}/assets/ingredient.svg`
});

/** Limite máximo de entradas no histórico (hard limit) */
export const MAX_HISTORY_HARD_LIMIT = 500;

/** Tempo de vida do bloqueio de fabricação (30 segundos) */
export const LOCK_TTL_MS = 30_000;

/** Tempo máximo de espera para resposta do socket (30 segundos) */
export const REQUEST_TIMEOUT_MS = 30_000;

// ============================================================
// FIM DAS CONSTANTES
// ============================================================
// Para adicionar novas constantes, siga o padrão existente:
// - Use UPPER_SNAKE_CASE
// - Adicione comentários explicativos
// - Agrupe constantes relacionadas
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE CONSTANTES
// ============================================================
// Este arquivo define todas as constantes usadas no módulo.
// Centralizar constantes facilita a manutenção e evita
// erros de digitação.
// ============================================================
