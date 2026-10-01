/**
 * ============================================================
 * COMUNICAÇÃO VIA SOCKET
 * ============================================================
 * Este arquivo gerencia a comunicação entre jogadores e
 * Mestre via socket. Quando um jogador tenta fabricar uma
 * poção, a solicitação é enviada ao Mestre, que executa a
 * fabricação localmente.
 *
 * Isso é necessário porque:
 * 1. Apenas o Mestre pode modificar o inventário de atores
 * 2. O Mestre pode forçar resultados de testes
 * 3. O Mestre pode cancelar fabricações
 *
 * O protocolo de comunicação é:
 * - Jogador envia: { type: "craft", requestId, userId, actorId, payload }
 * - Mestre responde: { type: "response", requestId, targetUserId, ok, result/error }
 * ============================================================
 */

import { MODULE_ID, REQUEST_TIMEOUT_MS, SOCKET_NAME } from "./constants.js";
import { executeCraft } from "./crafting.js";
import { debug, randomId } from "./utils.js";

// Mapa de solicitações pendentes
const pending = new Map();

/**
 * Obtém o Mestre primário (primeiro Mestre ativo ordenado por ID).
 * Se não houver Mestre ativo, retorna null.
 */
function primaryGM() {
  return Array.from(game.users ?? [])
    .filter(user => user.active && user.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

/**
 * Processa uma solicitação de fabricação recebida do jogador.
 * Apenas o Mestre primário processa solicitações.
 */
async function handleRequest(message) {
  if (!game.user?.isGM || primaryGM()?.id !== game.user.id) return;

  const requester = game.users.get(message.userId);
  const actor = game.actors.get(message.actorId);
  const response = {
    type: "response",
    requestId: message.requestId,
    targetUserId: message.userId
  };

  try {
    if (!requester?.active) throw new Error("Usuário solicitante não está ativo.");
    if (!actor) throw new Error("Personagem não encontrado.");

    // Resultados forçados nunca atravessam o socket
    const payload = { ...message.payload, forcedOutcome: null };
    const result = await executeCraft({ ...payload, actor, requestUser: requester });

    game.socket.emit(SOCKET_NAME, { ...response, ok: true, result });
  } catch (error) {
    console.error(`${MODULE_ID} | Solicitação de fabricação falhou`, error);
    game.socket.emit(SOCKET_NAME, { ...response, ok: false, error: error.message });
  }
}

/**
 * Processa uma resposta recebida do Mestre.
 * Resolve ou rejeita a Promise correspondente.
 */
function handleResponse(message) {
  if (message.targetUserId !== game.user.id) return;

  const callback = pending.get(message.requestId);
  if (!callback) return;

  pending.delete(message.requestId);
  clearTimeout(callback.timeout);

  if (message.ok) {
    callback.resolve(message.result);
  } else {
    callback.reject(new Error(message.error || "Falha remota."));
  }
}

/**
 * Registra o listener de socket.
 * Chamado durante a inicialização do módulo (hook "ready").
 */
export function registerSocket() {
  game.socket.on(SOCKET_NAME, message => {
    if (message?.type === "craft") void handleRequest(message);
    if (message?.type === "response") handleResponse(message);
  });
}

/**
 * Solicita fabricação de uma poção.
 * Jogadores delegam ao Mestre ativo; o GM e mundos sem GM
 * executam localmente.
 */
export async function requestCraft(actor, payload) {
  const gm = primaryGM();

  // Se não há GM ou o usuário é o GM, executa localmente
  if (!gm || gm.id === game.user.id) {
    return executeCraft({ ...payload, actor, requestUser: game.user });
  }

  // Envia solicitação ao GM
  const requestId = randomId();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("O Mestre não respondeu à solicitação de alquimia a tempo."));
    }, REQUEST_TIMEOUT_MS);

    pending.set(requestId, { resolve, reject, timeout });
    debug("Enviando fabricação ao GM", requestId, gm.id);

    game.socket.emit(SOCKET_NAME, {
      type: "craft",
      requestId,
      userId: game.user.id,
      actorId: actor.id,
      payload
    });
  });
}

// ============================================================
// FIM DA COMUNICAÇÃO VIA SOCKET
// ============================================================
// Para adicionar novas mensagens ao protocolo:
// - Defina um novo tipo de mensagem
// - Adicione um handler correspondente
// - Documente o formato da mensagem
// ============================================================

// ============================================================
// FIM DO ARQUIVO DE SOCKET
// ============================================================
// Este arquivo gerencia a comunicação entre jogadores e
// Mestre via socket. Quando um jogador tenta fabricar uma
// poção, a solicitação é enviada ao Mestre, que executa a
// fabricação localmente.
// ============================================================
