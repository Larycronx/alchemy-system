import { MODULE_ID, MODULE_TITLE } from "./constants.js";

/** Normaliza texto para comparações de nomes e tags sem acentos. */
export function normalizeText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

export function deepClone(value) {
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return value === undefined ? undefined : structuredClone(value);
}

export function randomId(length = 16) {
  return globalThis.foundry?.utils?.randomID?.(length) ?? crypto.randomUUID().replaceAll("-", "").slice(0, length);
}

export function localize(key, fallback = key, data = null) {
  const i18n = globalThis.game?.i18n;
  if (!i18n) return fallback;
  const translated = data ? i18n.format(key, data) : i18n.localize(key);
  return translated === key ? fallback : translated;
}

export function notify(level, key, fallback, data = null) {
  const message = localize(key, fallback, data);
  if (level !== "error" && globalThis.game?.ready && getSetting("enableNotifications", true) === false) return message;
  const fn = globalThis.ui?.notifications?.[level] ?? globalThis.ui?.notifications?.info;
  fn?.call(globalThis.ui?.notifications, message);
  return message;
}

export function debug(...args) {
  try {
    if (globalThis.game?.settings?.get(MODULE_ID, "debug")) console.debug(`${MODULE_TITLE} |`, ...args);
  } catch (_error) {
    // As configurações ainda podem não estar registradas durante a inicialização.
  }
}

export function getSetting(key, fallback = undefined) {
  try {
    const value = globalThis.game?.settings?.get(MODULE_ID, key);
    return value === undefined ? fallback : value;
  } catch (_error) {
    return fallback;
  }
}

export function canOwnActor(actor, user = globalThis.game?.user) {
  if (!actor || !user) return false;
  if (user.isGM) return true;
  return Boolean(actor.testUserPermission?.(user, "OWNER") ?? actor.isOwner);
}

export function assertActorPermission(actor, user = globalThis.game?.user) {
  if (!canOwnActor(actor, user)) throw new Error(localize("ALCHEMY.Errors.Permission", "Você não possui permissão de proprietário sobre este personagem."));
}

export function activeActor() {
  const controlled = globalThis.canvas?.tokens?.controlled?.[0]?.actor;
  if (controlled && canOwnActor(controlled)) return controlled;
  const assigned = globalThis.game?.user?.character;
  if (assigned && canOwnActor(assigned)) return assigned;
  return globalThis.game?.actors?.find?.(actor => ["character", "npc"].includes(actor.type) && canOwnActor(actor)) ?? null;
}

export function escapeHTML(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

/** Envia um cartão conciso ao chat segundo a política mundial configurada. */
export async function postChat({ actor, title, result, details = "" }) {
  if (!globalThis.ChatMessage) return;
  const visibility = getSetting("chatVisibility", "all");
  if (visibility === "none") return;
  const users = Array.from(globalThis.game?.users ?? []);
  let whisper;
  if (visibility === "gm") whisper = users.filter(user => user.isGM).map(user => user.id);
  if (visibility === "owner") whisper = users.filter(user => user.isGM || actor?.testUserPermission?.(user, "OWNER")).map(user => user.id);
  const content = `<article class="alchemy-chat"><h3>${escapeHTML(title)}</h3><p><strong>${escapeHTML(actor?.name ?? "")}</strong></p><p>${escapeHTML(result)}</p>${details ? `<p>${escapeHTML(details)}</p>` : ""}</article>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker?.({ actor }) ?? {},
    content,
    whisper
  });
}

export function saveJson(data, filename) {
  const text = JSON.stringify(data, null, 2);
  if (globalThis.foundry?.utils?.saveDataToFile) return foundry.utils.saveDataToFile(text, "application/json", filename);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
}

export function clampNumber(value, min, max, fallback = min) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
