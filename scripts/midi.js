/**
 * ============================================================
 * INTEGRAÇÃO COM MIDI-QOL
 * ============================================================
 * Este arquivo gerencia a integração opcional com o módulo
 * Midi-QOL, que fornece automação avançada de itens e efeitos.
 *
 * A integração inclui:
 * 1. Detecção automática do Midi-QOL
 * 2. Decoração de itens criados com flags do Midi-QOL
 * 3. Aplicação de venenos a armas
 *
 * O módulo funciona sem o Midi-QOL, mas a automação é
 * limitada.
 * ============================================================
 */

import { MODULE_ID } from "./constants.js";
import { assertActorPermission, debug, notify } from "./utils.js";
import { consumeAppliedPoison } from "./effects.js";

/**
 * Verifica se o Midi-QOL está ativo e disponível.
 */
export function midiActive() {
  return Boolean(game.modules?.get("midi-qol")?.active && globalThis.MidiQOL);
}

/**
 * Obtém o status do Midi-QOL.
 */
export function midiStatus() {
  return {
    active: midiActive(),
    version: game.modules?.get("midi-qol")?.version ?? null
  };
}

/**
 * ============================================================
 * DECORAÇÃO DE ITENS PARA MIDI-QOL
 * ============================================================
 * Adiciona flags do Midi-QOL aos itens criados pelo sistema.
 * O próprio Midi-QOL executa o item normalmente; não há
 * dependência rígida de funções internas instáveis.
 * ============================================================
 */
export function decorateForMidi(itemData, recipe) {
  const data = foundry.utils.deepClone(itemData);
  data.flags ??= {};
  data.flags[MODULE_ID] ??= {};
  data.flags[MODULE_ID].midiReady = midiActive();

  if (midiActive() && recipe.result?.midiFlags) {
    data.flags["midi-qol"] = foundry.utils.mergeObject(
      data.flags["midi-qol"] ?? {},
      recipe.result.midiFlags,
      { inplace: false }
    );
  }

  debug("Estado Midi-QOL", midiStatus(), data.flags[MODULE_ID]);
  return data;
}

/**
 * ============================================================
 * APLICAÇÃO DE VENENO A ARMA
 * ============================================================
 * Aplica metadados de doses à arma. O Midi-QOL pode consumir
 * esses dados por macro futura.
 *
 * O veneno é consumido (quantidade reduzida em 1) e a arma
 * recebe flags com informações sobre o veneno aplicado.
 * ============================================================
 */
export async function applyPoisonToWeapon(actor, poisonItem, weaponItem) {
  assertActorPermission(actor);

  if (poisonItem?.parent?.id !== actor.id || weaponItem?.parent?.id !== actor.id) {
    throw new Error("O veneno e a arma precisam pertencer ao personagem.");
  }

  const poison = poisonItem.getFlag(MODULE_ID, "poison");
  if (!poison) {
    throw new Error("O item selecionado não contém dados de veneno alquímico.");
  }

  const quantity = Number(poisonItem.system?.quantity ?? 0);
  if (quantity < 1) {
    throw new Error("Não há doses disponíveis.");
  }

  await weaponItem.setFlag(MODULE_ID, "appliedPoison", {
    sourceItemId: poisonItem.id,
    sourceName: poisonItem.name,
    attacksRemaining: Number(poison.doses || 1),
    duration: String(poison.duration || "1 minuto"),
    damage: String(poison.damage || ""),
    save: poison.save ?? "con",
    dc: Number(poison.dc || 10),
    conditions: Array.isArray(poison.conditions) ? poison.conditions : [],
    appliedAt: Date.now()
  });

  await poisonItem.update({ "system.quantity": quantity - 1 });
  notify("info", "ALCHEMY.Notifications.PoisonApplied", `Veneno aplicado a ${weaponItem.name}.`);

  return weaponItem;
}

/**
 * ============================================================
 * INTEGRAÇÃO COM MIDI-QOL
 * ============================================================
 * Quando o Midi-QOL está ativo, esta função é chamada
 * automaticamente quando um ataque com a arma envenenada
 * acerta o alvo.
 *
 * Ela consome uma utilização do veneno e aplica o dano
 * de veneno ao alvo, se configurado.
 * ============================================================
 */
export async function handleMidiQolAttack(weaponItem, target, attackRoll) {
  if (!midiActive()) return null;

  const poison = weaponItem.getFlag(MODULE_ID, "appliedPoison") ??
    weaponItem.flags?.[MODULE_ID]?.appliedPoison;
  if (!poison) return null;

  // Consome uma utilização do veneno
  const result = await consumeAppliedPoison(weaponItem);

  // Aplica o dano de veneno se configurado
  if (poison.damage && target) {
    try {
      const roll = await new Roll(poison.damage, target.getRollData?.() ?? {}).evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: target }),
        flavor: `${poison.poisonName} — Dano de Veneno`
      });

      const currentHp = Number(target.system?.attributes?.hp?.value ?? 0);
      const newHp = Math.max(0, currentHp - Number(roll.total ?? 0));

      await target.update({
        "system.attributes.hp.value": newHp
      });

      // Verifica se o alvo precisa fazer teste de resistência
      if (poison.save && poison.dc) {
        const saveRoll = await target.rollAbilityTest(poison.save, { flavor: `Resistência a ${poison.poisonName}` });
        if (saveRoll.total < Number(poison.dc)) {
          // Falha na resistência - aplica condições
          if (poison.conditions?.length) {
            for (const condition of poison.conditions) {
              await target.toggleEffect(condition, { active: true });
            }
          }
        }
      }
    } catch (error) {
      debug("Erro ao aplicar dano de veneno", error);
    }
  }

  return result;
}

// ============================================================
// FIM DA INTEGRAÇÃO COM MIDI-QOL
// ============================================================
// Para adicionar novas integrações:
// - Verifique se o módulo está ativo antes de usar
// - Use flags do módulo para armazenar dados
// - Documente o formato das flags
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE INTEGRAÇÃO MIDI-QOL
// ============================================================
// Este arquivo gerencia a integração opcional com o módulo
// Midi-QOL, que fornece automação avançada de itens e efeitos.
// O módulo funciona sem o Midi-QOL, mas a automação é limitada.
// ============================================================
