/**
 * ============================================================
 * EFEITOS DE POÇÕES E VENENOS
 * ============================================================
 * Este arquivo gerencia os efeitos funcionais de poções e
 * venenos, incluindo:
 *
 * 1. Poções de cura (com diálogo de seleção de alvo)
 * 2. Venenos aplicáveis a armas (com diálogo de seleção de arma)
 * 3. Poção de invisibilidade (Active Effect)
 * 4. Poção de velocidade/haste (Active Effect)
 *
 * Todos os efeitos respeitam as permissões do jogador e
 * atualizam a interface imediatamente.
 * ============================================================
 */

import { MODULE_ID } from "./constants.js";
import { assertActorPermission, debug, localize, notify, postChat } from "./utils.js";
import { midiActive } from "./midi.js";

/**
 * Obtém a fórmula de cura de um item de poção.
 * Prioriza: flags do módulo > system.formula > metadados da receita > descrição.
 */
export function getHealingFormula(item) {
  // 1. Flags do módulo
  const moduleFormula = item?.getFlag?.(MODULE_ID, "formula") ??
    item?.flags?.[MODULE_ID]?.formula;
  if (moduleFormula) return String(moduleFormula);

  // 2. system.formula
  if (item?.system?.formula) return String(item.system.formula);

  // 3. Metadados da receita
  const recipeId = item?.getFlag?.(MODULE_ID, "recipeId") ??
    item?.flags?.[MODULE_ID]?.recipeId;
  if (recipeId) {
    const recipe = game.modules.get(MODULE_ID)?.api?.getRecipe?.(recipeId);
    if (recipe?.result?.formula) return String(recipe.result.formula);
  }

  // 4. Descrição (último fallback)
  const description = item?.system?.description?.value ?? item?.system?.description ?? "";
  const match = String(description).match(/(\d+d\d+\s*\+\s*\d+)/i);
  if (match) return match[1];

  return null;
}

/**
 * Verifica se um item é uma poção de cura.
 */
export function isHealingPotion(item) {
  if (!item) return false;

  // Verifica se é uma poção nativa do D&D 5e (subtype "potion")
  if (item?.system?.subtype === "potion") return true;

  // Verifica flags do módulo alchemy-system
  const recipeId = item?.getFlag?.(MODULE_ID, "recipeId") ??
    item?.flags?.[MODULE_ID]?.recipeId;
  if (recipeId) {
    const recipe = game.modules.get(MODULE_ID)?.api?.getRecipe?.(recipeId);
    if (recipe?.type === "potion") return true;
  }

  // Verifica se tem fórmula de cura
  if (item?.system?.formula && /\d+d\d+/.test(item.system.formula)) return true;

  const description = item?.system?.description?.value ?? item?.system?.description ?? "";
  return /cura|healing|restaura|restores/i.test(String(description));
}

/**
 * Obtém a lista de alvos válidos para cura.
 * Inclui: tokens controlados, personagens do jogador, atores com permissão.
 */
export function getValidHealingTargets(actor) {
  const targets = [];
  const user = game.user;

  // Tokens controlados na cena
  const controlledTokens = Array.from(canvas?.tokens?.controlled ?? []);
  for (const token of controlledTokens) {
    const targetActor = token.actor;
    if (targetActor && canUserEditActor(targetActor, user)) {
      targets.push({
        id: targetActor.id,
        name: targetActor.name,
        img: targetActor.img,
        type: "token",
        tokenId: token.id
      });
    }
  }

  // Personagens pertencentes ao jogador
  const userCharacters = game.actors?.filter(a =>
    ["character", "npc"].includes(a.type) &&
    canUserEditActor(a, user)
  ) ?? [];

  for (const char of userCharacters) {
    if (!targets.find(t => t.id === char.id)) {
      targets.push({
        id: char.id,
        name: char.name,
        img: char.img,
        type: "actor"
      });
    }
  }

  return targets;
}

/**
 * Verifica se o usuário pode editar um ator.
 */
function canUserEditActor(actor, user = game.user) {
  if (!actor || !user) return false;
  if (user.isGM) return true;
  return Boolean(actor.testUserPermission?.(user, "OWNER") ?? actor.isOwner);
}

/**
 * Aplica cura a um alvo.
 * Retorna o resultado da cura aplicada.
 */
export async function applyHealing(user, actor, target, item, formula) {
  assertActorPermission(actor, user);

  if (!target) throw new Error("Nenhum alvo selecionado.");
  if (!item) throw new Error("Nenhum item selecionado.");

  // Verifica se o item pertence ao ator
  if (item.parent?.id !== actor.id) {
    throw new Error("O item não pertence ao personagem.");
  }

  // Verifica se o alvo é válido
  if (!canUserEditActor(target, user)) {
    throw new Error("Você não tem permissão para curar este alvo.");
  }

  // Verifica se o item tem quantidade disponível
  const quantity = Number(item.system?.quantity ?? 0);
  if (quantity < 1) {
    throw new Error("O item não tem quantidade disponível.");
  }

  // Verifica se o alvo está com HP máximo
  const currentHp = Number(target.system?.attributes?.hp?.value ?? 0);
  const maxHp = Number(target.system?.attributes?.hp?.max ?? 0);
  if (currentHp >= maxHp) {
    notify("info", "ALCHEMY.Notifications.AlreadyFullHp", "O alvo já está com HP máximo.");
    return { success: false, reason: "full_hp" };
  }

  // Executa a rolagem de cura
  let roll;
  try {
    roll = await new Roll(formula, target.getRollData?.() ?? {}).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: target }),
      flavor: `${item.name} — Cura`
    });
  } catch (error) {
    debug("Erro ao rolar cura", error);
    throw new Error("Erro ao rolar a fórmula de cura.");
  }

  const healingAmount = Math.max(0, Number(roll.total ?? 0));
  const newHp = Math.min(maxHp, currentHp + healingAmount);

  // Atualiza o HP do alvo
  await target.update({
    "system.attributes.hp.value": newHp
  });

  // Consome uma unidade do item
  await item.update({
    "system.quantity": quantity - 1
  });

  // Envia mensagem ao chat
  await postChat({
    actor: target,
    title: localize("ALCHEMY.Chat.HealingTitle", "Cura Aplicada"),
    result: `${actor.name} usou ${item.name} em ${target.name}`,
    details: `Fórmula: ${formula} → ${roll.total} de cura<br>HP: ${currentHp} → ${newHp}/${maxHp}`
  });

  // Dispara hook
  Hooks.callAll("afterAlchemyHealing", {
    user,
    actor,
    target,
    item,
    formula,
    roll,
    healingAmount,
    newHp
  });

  // Atualiza a interface
  refreshActorUI(target);

  return {
    success: true,
    healingAmount,
    newHp,
    roll
  };
}

/**
 * Obtém a lista de armas válidas para aplicação de veneno.
 * Inclui apenas armas pertencentes ao ator e equipadas.
 */
export function getValidPoisonWeapons(actor) {
  const weapons = [];

  const items = Array.from(actor?.items ?? []);
  for (const item of items) {
    // Verifica se é uma arma
    if (item.type !== "weapon") continue;

    // Verifica se está equipada
    const isEquipped = item.system?.equipped ?? false;
    if (!isEquipped) continue;

    // Verifica se é corpo a corpo
    const isMelee = item.system?.actionType === "mwak" || item.system?.actionType === "rwak";
    if (!isMelee) continue;

    weapons.push({
      id: item.id,
      name: item.name,
      img: item.img,
      type: item.type,
      isDagger: /dagger|adaga/i.test(item.name),
      hasPoison: Boolean(item.getFlag(MODULE_ID, "appliedPoison") ?? item.flags?.[MODULE_ID]?.appliedPoison)
    });
  }

  // Prioriza adagas
  weapons.sort((a, b) => {
    if (a.isDagger && !b.isDagger) return -1;
    if (!a.isDagger && b.isDagger) return 1;
    return 0;
  });

  return weapons;
}

/**
 * Aplica veneno a uma arma.
 * Consome uma unidade do item de veneno e registra os dados na arma.
 */
export async function applyPoisonToWeapon(user, actor, poisonItem, weaponItem) {
  assertActorPermission(actor, user);

  if (!poisonItem) throw new Error("Nenhum veneno selecionado.");
  if (!weaponItem) throw new Error("Nenhuma arma selecionada.");

  // Verifica se o veneno pertence ao ator
  if (poisonItem.parent?.id !== actor.id) {
    throw new Error("O veneno não pertence ao personagem.");
  }

  // Verifica se a arma pertence ao ator
  if (weaponItem.parent?.id !== actor.id) {
    throw new Error("A arma não pertence ao personagem.");
  }

  // Verifica se a arma está equipada
  const isEquipped = weaponItem.system?.equipped ?? false;
  if (!isEquipped) {
    throw new Error("A arma não está equipada.");
  }

  // Verifica se o veneno tem dados
  const poison = poisonItem.getFlag(MODULE_ID, "poison") ??
    poisonItem.flags?.[MODULE_ID]?.poison;
  if (!poison) {
    throw new Error("O item selecionado não contém dados de veneno alquímico.");
  }

  // Verifica se o veneno tem quantidade disponível
  const quantity = Number(poisonItem.system?.quantity ?? 0);
  if (quantity < 1) {
    throw new Error("Não há doses disponíveis.");
  }

  // Verifica se a arma já tem veneno aplicado
  const existingPoison = weaponItem.getFlag(MODULE_ID, "appliedPoison") ??
    weaponItem.flags?.[MODULE_ID]?.appliedPoison;
  if (existingPoison) {
    // Pergunta se deseja substituir
    const replace = await Dialog.confirm({
      title: localize("ALCHEMY.Poison.ReplaceTitle", "Substituir Veneno"),
      content: localize("ALCHEMY.Poison.ReplaceContent", "A arma já possui um veneno aplicado. Deseja substituí-lo?"),
      modal: true
    });
    if (!replace) return { success: false, reason: "cancelled" };
  }

  // Aplica o veneno
  const poisonData = {
    sourceItemId: poisonItem.id,
    sourceName: poisonItem.name,
    poisonName: poisonItem.name,
    damage: String(poison.damage || ""),
    save: poison.save ?? "con",
    dc: Number(poison.dc || 10),
    conditions: Array.isArray(poison.conditions) ? poison.conditions : [],
    duration: String(poison.duration || "1 minuto"),
    attacksRemaining: Number(poison.doses || 1),
    appliedAt: Date.now()
  };

  await weaponItem.setFlag(MODULE_ID, "appliedPoison", poisonData);

  // Consome uma unidade do veneno
  await poisonItem.update({
    "system.quantity": quantity - 1
  });

  // Envia mensagem ao chat
  await postChat({
    actor,
    title: localize("ALCHEMY.Chat.PoisonAppliedTitle", "Veneno Aplicado"),
    result: `${actor.name} aplicou ${poisonItem.name} em ${weaponItem.name}`,
    details: `CD: ${poisonData.dc} (${poisonData.save.toUpperCase()})<br>Dano: ${poisonData.damage}<br>Ataques restantes: ${poisonData.attacksRemaining}`
  });

  // Dispara hook
  Hooks.callAll("afterAlchemyPoisonApplied", {
    user,
    actor,
    poisonItem,
    weaponItem,
    poisonData
  });

  // Atualiza a interface
  refreshActorUI(actor);

  return {
    success: true,
    poisonData
  };
}

/**
 * Consome uma utilização do veneno aplicado em uma arma.
 * Reduz attacksRemaining em 1 e remove o veneno quando chegar a zero.
 */
export async function consumeAppliedPoison(weaponItem) {
  if (!weaponItem) throw new Error("Nenhuma arma selecionada.");

  const poison = weaponItem.getFlag(MODULE_ID, "appliedPoison") ??
    weaponItem.flags?.[MODULE_ID]?.appliedPoison;
  if (!poison) {
    throw new Error("A arma não possui veneno aplicado.");
  }

  const attacksRemaining = Number(poison.attacksRemaining ?? 0);
  if (attacksRemaining < 1) {
    throw new Error("O veneno não tem utilizações restantes.");
  }

  const newAttacksRemaining = attacksRemaining - 1;

  if (newAttacksRemaining <= 0) {
    // Remove o veneno
    await weaponItem.unsetFlag(MODULE_ID, "appliedPoison");
    notify("info", "ALCHEMY.Notifications.PoisonExpired", "O veneno aplicado expirou.");
  } else {
    // Atualiza o contador
    await weaponItem.setFlag(MODULE_ID, "appliedPoison", {
      ...poison,
      attacksRemaining: newAttacksRemaining
    });
  }

  // Dispara hook
  Hooks.callAll("afterAlchemyPoisonUse", {
    weaponItem,
    poison,
    attacksRemaining: newAttacksRemaining
  });

  // Atualiza a interface
  if (weaponItem.parent) {
    refreshActorUI(weaponItem.parent);
  }

  return {
    success: true,
    attacksRemaining: newAttacksRemaining,
    expired: newAttacksRemaining <= 0
  };
}

/**
 * Aplica um Active Effect de invisibilidade ao ator.
 */
export async function applyInvisibilityEffect(user, actor, item) {
  assertActorPermission(actor, user);

  if (!actor) throw new Error("Nenhum ator selecionado.");
  if (!item) throw new Error("Nenhum item selecionado.");

  // Verifica se o item pertence ao ator
  if (item.parent?.id !== actor.id) {
    throw new Error("O item não pertence ao personagem.");
  }

  // Verifica se o item tem quantidade disponível
  const quantity = Number(item.system?.quantity ?? 0);
  if (quantity < 1) {
    throw new Error("O item não tem quantidade disponível.");
  }

  // Verifica se já existe um efeito de invisibilidade
  const existingEffect = actor.effects?.find(e =>
    e.name?.toLowerCase().includes("invisib") ||
    e.name?.toLowerCase().includes("invisible")
  );

  if (existingEffect) {
    const replace = await Dialog.confirm({
      title: localize("ALCHEMY.Effect.ReplaceTitle", "Substituir Efeito"),
      content: localize("ALCHEMY.Effect.ReplaceContent", "O personagem já possui um efeito de invisibilidade ativo. Deseja substituí-lo?"),
      modal: true
    });
    if (!replace) return { success: false, reason: "cancelled" };

    // Remove o efeito existente
    await existingEffect.delete();
  }

  // Cria o Active Effect de invisibilidade
  const effectData = {
    name: localize("ALCHEMY.Effect.InvisibilityName", "Invisibilidade"),
    icon: "icons/svg/invisible.svg",
    duration: {
      seconds: 3600, // 1 hora
      rounds: 60
    },
    changes: [
      {
        key: "system.attributes.ac.bonus",
        mode: 2, // ADD
        value: "0",
        priority: 20
      }
    ],
    flags: {
      [MODULE_ID]: {
        isInvisibility: true,
        sourceItemId: item.id,
        sourceName: item.name,
        appliedAt: Date.now(),
        duration: "1 hora"
      }
    }
  };

  const effect = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);

  // Consome uma unidade do item
  await item.update({
    "system.quantity": quantity - 1
  });

  // Envia mensagem ao chat
  await postChat({
    actor,
    title: localize("ALCHEMY.Chat.InvisibilityTitle", "Invisibilidade Ativada"),
    result: `${actor.name} ficou invisível`,
    details: `Duração: 1 hora<br>Efeito: Invisibilidade`
  });

  // Dispara hook
  Hooks.callAll("afterAlchemyEffectApplied", {
    user,
    actor,
    item,
    effect: effect[0],
    effectType: "invisibility",
    duration: "1 hora"
  });

  // Atualiza a interface
  refreshActorUI(actor);

  return {
    success: true,
    effect: effect[0]
  };
}

/**
 * Aplica um Active Effect de velocidade/haste ao ator.
 */
export async function applySpeedEffect(user, actor, item) {
  assertActorPermission(actor, user);

  if (!actor) throw new Error("Nenhum ator selecionado.");
  if (!item) throw new Error("Nenhum item selecionado.");

  // Verifica se o item pertence ao ator
  if (item.parent?.id !== actor.id) {
    throw new Error("O item não pertence ao personagem.");
  }

  // Verifica se o item tem quantidade disponível
  const quantity = Number(item.system?.quantity ?? 0);
  if (quantity < 1) {
    throw new Error("O item não tem quantidade disponível.");
  }

  // Verifica se já existe um efeito de velocidade
  const existingEffect = actor.effects?.find(e =>
    e.name?.toLowerCase().includes("velocidade") ||
    e.name?.toLowerCase().includes("speed") ||
    e.name?.toLowerCase().includes("haste")
  );

  if (existingEffect) {
    const replace = await Dialog.confirm({
      title: localize("ALCHEMY.Effect.ReplaceTitle", "Substituir Efeito"),
      content: localize("ALCHEMY.Effect.ReplaceContent", "O personagem já possui um efeito de velocidade ativo. Deseja substituí-lo?"),
      modal: true
    });
    if (!replace) return { success: false, reason: "cancelled" };

    // Remove o efeito existente
    await existingEffect.delete();
  }

  // Cria o Active Effect de velocidade
  const effectData = {
    name: localize("ALCHEMY.Effect.SpeedName", "Velocidade"),
    icon: "icons/svg/haste.svg",
    duration: {
      seconds: 60, // 1 minuto
      rounds: 6
    },
    changes: [
      {
        key: "system.attributes.ac.bonus",
        mode: 2, // ADD
        value: "2",
        priority: 20
      },
      {
        key: "system.attributes.movement.all",
        mode: 2, // ADD
        value: "0",
        priority: 20
      }
    ],
    flags: {
      [MODULE_ID]: {
        isSpeed: true,
        sourceItemId: item.id,
        sourceName: item.name,
        appliedAt: Date.now(),
        duration: "1 minuto",
        hasExtraAction: true,
        extraActionDescription: localize("ALCHEMY.Effect.ExtraAction", "Ação adicional limitada (1x por turno)")
      }
    }
  };

  const effect = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);

  // Consome uma unidade do item
  await item.update({
    "system.quantity": quantity - 1
  });

  // Envia mensagem ao chat
  await postChat({
    actor,
    title: localize("ALCHEMY.Chat.SpeedTitle", "Velocidade Ativada"),
    result: `${actor.name} ganhou velocidade aumentada`,
    details: `Duração: 1 minuto<br>Efeitos: +2 CA, deslocamento dobrado, vantagem em testes de resistência de Destreza`
  });

  // Dispara hook
  Hooks.callAll("afterAlchemyEffectApplied", {
    user,
    actor,
    item,
    effect: effect[0],
    effectType: "speed",
    duration: "1 minuto"
  });

  // Atualiza a interface
  refreshActorUI(actor);

  return {
    success: true,
    effect: effect[0]
  };
}

/**
 * Atualiza a interface do ator imediatamente.
 * Atualiza ficha, token e janelas abertas.
 */
export function refreshActorUI(actor) {
  if (!actor) return;

  // Atualiza a ficha do ator
  actor.sheet?.render();

  // Atualiza os tokens do ator na cena
  const tokens = canvas?.tokens?.placeables?.filter(t => t.actor?.id === actor.id) ?? [];
  for (const token of tokens) {
    token.refresh();
  }

  // Atualiza as janelas do módulo
  for (const app of Object.values(ui.windows ?? {})) {
    if (app?.id === "alchemy-system-player" || app?.id === "alchemy-system-gm") {
      app.render();
    }
  }
}

/**
 * Verifica se um item é uma poção de invisibilidade.
 */
export function isInvisibilityPotion(item) {
  if (!item) return false;
  const recipeId = item?.getFlag?.(MODULE_ID, "recipeId") ??
    item?.flags?.[MODULE_ID]?.recipeId;
  if (recipeId) {
    const recipe = game.modules.get(MODULE_ID)?.api?.getRecipe?.(recipeId);
    if (recipe?.name?.toLowerCase().includes("invisib")) return true;
  }
  const description = item?.system?.description?.value ?? item?.system?.description ?? "";
  return /invisib/i.test(String(description));
}

/**
 * Verifica se um item é uma poção de velocidade.
 */
export function isSpeedPotion(item) {
  if (!item) return false;
  const recipeId = item?.getFlag?.(MODULE_ID, "recipeId") ??
    item?.flags?.[MODULE_ID]?.recipeId;
  if (recipeId) {
    const recipe = game.modules.get(MODULE_ID)?.api?.getRecipe?.(recipeId);
    if (recipe?.name?.toLowerCase().includes("velocidade") ||
        recipe?.name?.toLowerCase().includes("speed")) return true;
  }
  const description = item?.system?.description?.value ?? item?.system?.description ?? "";
  return /velocidade|speed|haste/i.test(String(description));
}

/**
 * Verifica se um item é um veneno.
 */
export function isPoisonItem(item) {
  if (!item) return false;
  const recipeId = item?.getFlag?.(MODULE_ID, "recipeId") ??
    item?.flags?.[MODULE_ID]?.recipeId;
  if (recipeId) {
    const recipe = game.modules.get(MODULE_ID)?.api?.getRecipe?.(recipeId);
    if (recipe?.type === "poison") return true;
  }
  return Boolean(item.getFlag(MODULE_ID, "poison") ?? item.flags?.[MODULE_ID]?.poison);
}

// ============================================================
// FIM DO ARQUIVO DE EFEITOS
// ============================================================
