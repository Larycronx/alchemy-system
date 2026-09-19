import { MODULE_ID, REQUEST_TIMEOUT_MS, SOCKET_NAME } from "./constants.js";
import { executeCraft } from "./crafting.js";
import { debug, randomId } from "./utils.js";

const pending = new Map();

function primaryGM() {
  return Array.from(game.users ?? []).filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

async function handleRequest(message) {
  if (!game.user?.isGM || primaryGM()?.id !== game.user.id) return;
  const requester = game.users.get(message.userId);
  const actor = game.actors.get(message.actorId);
  const response = { type: "response", requestId: message.requestId, targetUserId: message.userId };
  try {
    if (!requester?.active) throw new Error("Usuário solicitante não está ativo.");
    if (!actor) throw new Error("Personagem não encontrado.");
    // Resultados forçados nunca atravessam o socket; apenas o executor GM local pode simulá-los.
    const payload = { ...message.payload, forcedOutcome: null };
    const result = await executeCraft({ ...payload, actor, requestUser: requester });
    game.socket.emit(SOCKET_NAME, { ...response, ok: true, result });
  } catch (error) {
    console.error(`${MODULE_ID} | Solicitação de fabricação falhou`, error);
    game.socket.emit(SOCKET_NAME, { ...response, ok: false, error: error.message });
  }
}

function handleResponse(message) {
  if (message.targetUserId !== game.user.id) return;
  const callback = pending.get(message.requestId);
  if (!callback) return;
  pending.delete(message.requestId);
  clearTimeout(callback.timeout);
  if (message.ok) callback.resolve(message.result); else callback.reject(new Error(message.error || "Falha remota."));
}

export function registerSocket() {
  game.socket.on(SOCKET_NAME, message => {
    if (message?.type === "craft") void handleRequest(message);
    if (message?.type === "response") handleResponse(message);
  });
}

/** Jogadores delegam ao GM ativo; o GM e mundos sem GM executam localmente. */
export async function requestCraft(actor, payload) {
  const gm = primaryGM();
  // Mesmo Mestres secundários delegam ao primeiro Mestre ativo para manter uma fila única por mundo.
  if (!gm || gm.id === game.user.id) return executeCraft({ ...payload, actor, requestUser: game.user });
  const requestId = randomId();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("O Mestre não respondeu à solicitação de alquimia a tempo."));
    }, REQUEST_TIMEOUT_MS);
    pending.set(requestId, { resolve, reject, timeout });
    debug("Enviando fabricação ao GM", requestId, gm.id);
    game.socket.emit(SOCKET_NAME, { type: "craft", requestId, userId: game.user.id, actorId: actor.id, payload });
  });
}
