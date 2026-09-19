import { MODULE_ID } from "./constants.js";
import { assertActorPermission, debug, notify } from "./utils.js";

export function midiActive() {
  return Boolean(game.modules?.get("midi-qol")?.active && globalThis.MidiQOL);
}

export function midiStatus() {
  return { active: midiActive(), version: game.modules?.get("midi-qol")?.version ?? null };
}

/**
 * Mantém os dados de automação no item criado. O próprio Midi-QOL executa o item
 * normalmente; não há dependência rígida de funções internas instáveis.
 */
export function decorateForMidi(itemData, recipe) {
  const data = foundry.utils.deepClone(itemData);
  data.flags ??= {};
  data.flags[MODULE_ID] ??= {};
  data.flags[MODULE_ID].midiReady = midiActive();
  if (midiActive() && recipe.result?.midiFlags) {
    data.flags["midi-qol"] = foundry.utils.mergeObject(data.flags["midi-qol"] ?? {}, recipe.result.midiFlags, { inplace: false });
  }
  debug("Estado Midi-QOL", midiStatus(), data.flags[MODULE_ID]);
  return data;
}

/** Aplica metadados de doses à arma; Midi-QOL pode consumi-los por macro futura. */
export async function applyPoisonToWeapon(actor, poisonItem, weaponItem) {
  assertActorPermission(actor);
  if (poisonItem?.parent?.id !== actor.id || weaponItem?.parent?.id !== actor.id) throw new Error("O veneno e a arma precisam pertencer ao personagem.");
  const poison = poisonItem.getFlag(MODULE_ID, "poison");
  if (!poison) throw new Error("O item selecionado não contém dados de veneno alquímico.");
  const quantity = Number(poisonItem.system?.quantity ?? 0);
  if (quantity < 1) throw new Error("Não há doses disponíveis.");
  await weaponItem.setFlag(MODULE_ID, "appliedPoison", {
    sourceItemId: poisonItem.id, sourceName: poisonItem.name, attacksRemaining: Number(poison.doses || 1),
    duration: String(poison.duration || "1 minuto"), damage: String(poison.damage || ""), save: poison.save ?? "con",
    dc: Number(poison.dc || 10), conditions: Array.isArray(poison.conditions) ? poison.conditions : [], appliedAt: Date.now()
  });
  await poisonItem.update({ "system.quantity": quantity - 1 });
  notify("info", "ALCHEMY.Notifications.PoisonApplied", `Veneno aplicado a ${weaponItem.name}.`);
  return weaponItem;
}
