/**
 * Estado runtime (em memória) compartilhado entre o loop de impressão e o
 * painel web local. Não persiste: é só a "telemetria" da sessão atual.
 */
const MAX_HISTORY = 20;

function createRuntime() {
  return {
    startedAt: new Date().toISOString(),
    lastCheckAt: null,
    lastOkAt: null,
    lastError: null, // { message, at, kind }
    backoffMs: 0,
    printedCount: 0,
    pendingCount: 0,
    history: [], // [{ id, orderNumber, printedAt }] — mais recente primeiro
  };
}

/** Registra um ciclo concluído sem erro. */
function recordCycleOk(rt) {
  const now = new Date().toISOString();
  rt.lastCheckAt = now;
  rt.lastOkAt = now;
  rt.lastError = null;
  rt.backoffMs = 0;
}

/** Registra falha de ciclo. kind: 'token' | 'rate-limit' | 'network' | 'print' | 'other' */
function recordCycleError(rt, kind, message, backoffMs = 0) {
  rt.lastCheckAt = new Date().toISOString();
  rt.lastError = { kind, message, at: rt.lastCheckAt };
  rt.backoffMs = backoffMs;
}

/** Registra cupom impresso no histórico (mantém só os MAX_HISTORY mais recentes). */
function recordPrinted(rt, id, orderNumber) {
  rt.printedCount += 1;
  rt.history.unshift({
    id,
    orderNumber: orderNumber || String(id).slice(-6),
    printedAt: new Date().toISOString(),
  });
  if (rt.history.length > MAX_HISTORY) rt.history.length = MAX_HISTORY;
}

function snapshot(rt, extra = {}) {
  return { ...rt, history: [...rt.history], ...extra };
}

module.exports = { createRuntime, recordCycleOk, recordCycleError, recordPrinted, snapshot };
