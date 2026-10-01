/**
 * ============================================================
 * FUNÇÕES UTILITÁRIAS
 * ============================================================
 * Este arquivo contém funções auxiliares usadas em todo o
 * módulo:
 *
 * - Normalização de texto (remover acentos)
 * - Clonagem profunda de objetos
 * - Geração de IDs aleatórios
 * - Localização (traduções)
 * - Notificações ao usuário
 * - Debug e logging
 * - Verificação de permissões
 * - Escape de HTML
 * - Envio de mensagens ao chat
 * - Salvamento de arquivos JSON
 * ============================================================
 */

import { MODULE_ID, MODULE_TITLE } from "./constants.js";

/**
 * Normaliza texto para comparações.
 * Remove acentos, espaços extras e converte para minúsculas.
 * Exemplo: "Água Purificada" → "agua purificada"
 */
export function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

/**
 * Cria uma cópia profunda de um valor.
 * Usa a função do Foundry quando disponível.
 */
export function deepClone(value) {
  if (globalThis.foundry?.utils?.deepClone) {
    return foundry.utils.deepClone(value);
  }
  return value === undefined ? undefined : structuredClone(value);
}

/**
 * Gera um ID aleatório.
 * Usa a função do Foundry quando disponível.
 */
export function randomId(length = 16) {
  return globalThis.foundry?.utils?.randomID?.(length) ??
    crypto.randomUUID().replaceAll("-", "").slice(0, length);
}

/**
 * Obtém uma string traduzida do arquivo de idioma.
 * Se a chave não existir, retorna o fallback.
 */
export function localize(key, fallback = key, data = null) {
  const i18n = globalThis.game?.i18n;
  if (!i18n) return fallback;

  const translated = data ? i18n.format(key, data) : i18n.localize(key);
  return translated === key ? fallback : translated;
}

/**
 * Exibe uma notificação ao usuário.
 * Respeita a configuração "enableNotifications".
 */
export function notify(level, key, fallback, data = null) {
  const message = localize(key, fallback, data);

  if (level !== "error" && globalThis.game?.ready && getSetting("enableNotifications", true) === false) {
    return message;
  }

  const fn = globalThis.ui?.notifications?.[level] ?? globalThis.ui?.notifications?.info;
  fn?.call(globalThis.ui?.notifications, message);
  return message;
}

/**
 * Exibe mensagem de debug no console.
 * Só funciona se a configuração "debug" estiver ativa.
 */
export function debug(...args) {
  try {
    if (globalThis.game?.settings?.get(MODULE_ID, "debug")) {
      console.debug(`${MODULE_TITLE} |`, ...args);
    }
  } catch (_error) {
    // As configurações ainda podem não estar registradas durante a inicialização.
  }
}

/**
 * Obtém o valor de uma configuração do módulo.
 * Retorna o fallback se a configuração não existir.
 */
export function getSetting(key, fallback = undefined) {
  try {
    const value = globalThis.game?.settings?.get(MODULE_ID, key);
    return value === undefined ? fallback : value;
  } catch (_error) {
    return fallback;
  }
}

/**
 * Verifica se um usuário possui permissão sobre um personagem.
 * GMs sempre possuem permissão.
 */
export function canOwnActor(actor, user = globalThis.game?.user) {
  if (!actor || !user) return false;
  if (user.isGM) return true;
  return Boolean(actor.testUserPermission?.(user, "OWNER") ?? actor.isOwner);
}

/**
 * Verifica se um usuário possui permissão sobre um personagem.
 * Lança erro se não possuir.
 */
export function assertActorPermission(actor, user = globalThis.game?.user) {
  if (!canOwnActor(actor, user)) {
    throw new Error(localize("ALCHEMY.Errors.Permission", "Você não possui permissão de proprietário sobre este personagem."));
  }
}

/**
 * Obtém o personagem ativo do usuário.
 * Prioriza: token controlado → personagem atribuído → primeiro personagem possuído.
 */
export function activeActor() {
  const controlled = globalThis.canvas?.tokens?.controlled?.[0]?.actor;
  if (controlled && canOwnActor(controlled)) return controlled;

  const assigned = globalThis.game?.user?.character;
  if (assigned && canOwnActor(assigned)) return assigned;

  return globalThis.game?.actors?.find?.(actor =>
    ["character", "npc"].includes(actor.type) && canOwnActor(actor)
  ) ?? null;
}

/**
 * Escapa caracteres especiais de HTML para prevenir XSS.
 */
export function escapeHTML(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

/**
 * Envia um cartão conciso ao chat.
 * Respeita a configuração "chatVisibility":
 * - "all": todos veem
 * - "owner": apenas dono e GMs
 * - "gm": apenas GMs
 * - "none": ninguém vê
 */
export async function postChat({ actor, title, result, details = "" }) {
  if (!globalThis.ChatMessage) return;

  const visibility = getSetting("chatVisibility", "all");
  if (visibility === "none") return;

  const polyglotChatElement = globalThis.game?.polyglot?.chatElement;
  if (polyglotChatElement && typeof polyglotChatElement.find !== "function") {
    console.warn(`${MODULE_TITLE}: mensagem de fabricação omitida porque o Polyglot instalado não é compatível com o hook de chat.`);
    return;
  }

  const users = Array.from(globalThis.game?.users ?? []);
  let whisper;

  if (visibility === "gm") {
    whisper = users.filter(user => user.isGM).map(user => user.id);
  }
  if (visibility === "owner") {
    whisper = users.filter(user => user.isGM || actor?.testUserPermission?.(user, "OWNER")).map(user => user.id);
  }

  const content = `<article class="alchemy-chat"><h3>${escapeHTML(title)}</h3><p><strong>${escapeHTML(actor?.name ?? "")}</strong></p><p>${escapeHTML(result)}</p>${details ? `<p>${escapeHTML(details)}</p>` : ""}</article>`;

  try {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker?.({ actor }) ?? {},
      content,
      whisper
    });
  } catch (error) {
    // Hooks de módulos externos, como versões incompatíveis do Polyglot,
    // não devem desfazer uma fabricação já concluída.
    console.warn(`${MODULE_TITLE}: falha ao publicar resultado no chat.`, error);
  }
}

/**
 * Salva dados como arquivo JSON para download.
 */
export function saveJson(data, filename) {
  const text = JSON.stringify(data, null, 2);

  if (globalThis.foundry?.utils?.saveDataToFile) {
    return foundry.utils.saveDataToFile(text, "application/json", filename);
  }

  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
}

/**
 * Limita um número dentro de um intervalo.
 * Se o valor não for um número válido, retorna o fallback.
 */
export function clampNumber(value, min, max, fallback = min) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

// ============================================================
// FIM DAS FUNÇÕES UTILITÁRIAS
// ============================================================
// Para adicionar novas funções utilitárias:
// - Use nomes descritivos em camelCase
// - Adicione comentários JSDoc explicativos
// - Exporte a função para uso em outros módulos
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE FUNÇÕES UTILITÁRIAS
// ============================================================
// Este arquivo contém funções auxiliares usadas em todo o
// módulo. Centralizar funções comuns facilita a manutenção
// e evita duplicação de código.
// ============================================================
