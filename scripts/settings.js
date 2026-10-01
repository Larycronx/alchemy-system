/**
 * ============================================================
 * CONFIGURAÇÕES DO MÓDULO
 * ============================================================
 * Este arquivo registra todas as configurações do módulo.
 * As configurações são divididas em:
 *
 * 1. Configurações internas (não configuráveis pelo usuário)
 *    - recipes: lista de receitas do mundo
 *    - gmLogs: log global do Mestre
 *    - schemaVersion: versão do schema de dados
 *
 * 2. Configurações do mundo (configuráveis pelo Mestre)
 *    - enableKnowledge: ativar sistema de conhecimento
 *    - enableExperimentation: ativar experimentação
 *    - consumeIngredients: consumir ingredientes ao fabricar
 *    - consumeOnFailure: consumir ingredientes em caso de falha
 *    - enableChecks: ativar testes de alquimia
 *    - allowFailures: permitir falhas
 *    - autoDiscover: descoberta automática de receitas
 *    - ingredientNameFallback: identificar ingredientes por nome
 *    - requireEquipment: exigir equipamento
 *    - enableNotifications: ativar notificações
 *    - gmCanReadNotes: Mestre pode ler anotações
 *    - debug: modo debug
 *    - unknownDisplay: exibição de receitas desconhecidas
 *    - failureMode: modo de falha (simple/defective)
 *    - chatVisibility: visibilidade das mensagens de chat
 *    - maxHistory: máximo de entradas no histórico
 *
 * 3. Configurações do cliente (configuráveis por cada jogador)
 *    - theme: tema visual (dark/light/parchment)
 *    - tutorialSeen: se o tutorial foi visto
 * ============================================================
 */

import { MODULE_ID } from "./constants.js";
import { DEFAULT_RECIPES } from "./data.js";
import { deepClone } from "./utils.js";

/**
 * Registra uma configuração booleana do mundo.
 */
const worldBoolean = (key, defaultValue) => game.settings.register(MODULE_ID, key, {
  name: `ALCHEMY.Settings.${key}.Name`,
  hint: `ALCHEMY.Settings.${key}.Hint`,
  scope: "world",
  config: true,
  type: Boolean,
  default: defaultValue
});

/**
 * Registra todas as configurações do módulo.
 * Chamada durante a inicialização do módulo (hook "init").
 */
export function registerSettings() {
  // Configurações internas
  game.settings.register(MODULE_ID, "recipes", {
    scope: "world",
    config: false,
    type: Object,
    default: deepClone(DEFAULT_RECIPES)
  });

  game.settings.register(MODULE_ID, "gmLogs", {
    scope: "world",
    config: false,
    type: Object,
    default: []
  });

  game.settings.register(MODULE_ID, "schemaVersion", {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  // Configurações do mundo
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
    name: "ALCHEMY.Settings.unknownDisplay.Name",
    hint: "ALCHEMY.Settings.unknownDisplay.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      silhouette: "ALCHEMY.Settings.unknownDisplay.Silhouette",
      names: "ALCHEMY.Settings.unknownDisplay.Names",
      hidden: "ALCHEMY.Settings.unknownDisplay.Hidden"
    },
    default: "silhouette"
  });

  game.settings.register(MODULE_ID, "failureMode", {
    name: "ALCHEMY.Settings.failureMode.Name",
    hint: "ALCHEMY.Settings.failureMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      simple: "ALCHEMY.Settings.failureMode.Simple",
      defective: "ALCHEMY.Settings.failureMode.Defective"
    },
    default: "simple"
  });

  game.settings.register(MODULE_ID, "chatVisibility", {
    name: "ALCHEMY.Settings.chatVisibility.Name",
    hint: "ALCHEMY.Settings.chatVisibility.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      all: "ALCHEMY.Settings.chatVisibility.All",
      owner: "ALCHEMY.Settings.chatVisibility.Owner",
      gm: "ALCHEMY.Settings.chatVisibility.GM",
      none: "ALCHEMY.Settings.chatVisibility.None"
    },
    default: "all"
  });

  game.settings.register(MODULE_ID, "maxHistory", {
    name: "ALCHEMY.Settings.maxHistory.Name",
    hint: "ALCHEMY.Settings.maxHistory.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 200,
    range: { min: 25, max: 500, step: 25 }
  });

  // Configurações do cliente
  game.settings.register(MODULE_ID, "theme", {
    name: "ALCHEMY.Settings.theme.Name",
    hint: "ALCHEMY.Settings.theme.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      parchment: "ALCHEMY.Settings.theme.Parchment",
      dark: "ALCHEMY.Settings.theme.Dark",
      light: "ALCHEMY.Settings.theme.Light"
    },
    default: "dark"
  });

  game.settings.register(MODULE_ID, "tutorialSeen", {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });
}

// ============================================================
// FIM DAS CONFIGURAÇÕES DO MÓDULO
// ============================================================
// Para adicionar novas configurações:
// - Use worldBoolean() para configurações booleanas
// - Use game.settings.register() para outros tipos
// - Defina scope "world" para configurações globais
// - Defina scope "client" para configurações locais
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE CONFIGURAÇÕES
// ============================================================
// Este arquivo registra todas as configurações do módulo.
// As configurações são divididas em:
// 1. Configurações internas (não configuráveis pelo usuário)
// 2. Configurações do mundo (configuráveis pelo Mestre)
// 3. Configurações do cliente (configuráveis por cada jogador)
// ============================================================
