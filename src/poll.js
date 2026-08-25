/**
 * Loop de polling: busca pedidos prontos na API, imprime e confirma no backend.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildReceiptPdf } = require("./receipt");
const { printPdf } = require("./print");

const REQUEST_TIMEOUT_MS = 15000;

const log = (...args) =>
  console.log(`[gringo-printer ${new Date().toISOString()}]`, ...args);

async function fetchReadyOrders(apiUrl, token) {
  const res = await fetch(
    `${apiUrl}/orders/printer/ready-to-print/${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { Accept: "application/json" } }
  );
  if (!res.ok) {
    const err = new Error(`GET ready-to-print retornou ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function markPrinted(apiUrl, token, orderIds) {
  const res = await fetch(`${apiUrl}/orders/printer/mark-as-printed`, {
    method: "PATCH",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, orderIds }),
  });
  if (!res.ok) {
    const err = new Error(`PATCH mark-as-printed retornou ${res.status}`);
    err.status = res.status;
    throw err;
  }
}

async function printOrder(order, printerName) {
  const pdfPath = path.join(os.tmpdir(), `gringo-printer-${order._id}.pdf`);
  await buildReceiptPdf(order, pdfPath);
  try {
    await printPdf(pdfPath, printerName || null);
  } finally {
    try {
      fs.unlinkSync(pdfPath);
    } catch {}
  }
}

/** Reprocessa PATCHes mark-as-printed que falharam em ciclos anteriores. */
async function flushPending({ config, state }) {
  const pending = state.getPending();
  if (pending.length === 0) return;
  try {
    await markPrinted(config.apiUrl, config.token, pending);
    pending.forEach((id) => state.clearPending(id));
    log(`mark-as-printed confirmado para ${pending.length} pedido(s)`);
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      // pedido não existe mais no backend: descarta (o cupom já saiu no papel)
      pending.forEach((id) => state.clearPending(id));
      log("mark-as-printed rejeitado (pedidos inexistentes), pendências descartadas");
      return;
    }
    log("mark-as-printed falhou, tentarei no próximo ciclo:", err.message);
  }
}

async function processOnce({ config, state, printFn = printOrder }) {
  await flushPending({ config, state });

  const orders = await fetchReadyOrders(config.apiUrl, config.token);
  const newOrders = orders.filter((o) => o && o._id && !state.isPrinted(o._id));
  log(`verificação: ${orders.length} pronto(s) para impressão, ${newOrders.length} novo(s)`);

  for (const order of newOrders) {
    try {
      await printFn(order, config.printer);
      // marca ANTES de confirmar no backend: se o PATCH falhar, não reimprime
      state.markPrinted(order._id);
      state.addPending(order._id);
      log(`impresso: pedido #${order.orderNumber || String(order._id).slice(-6)} (id ${order._id})`);
    } catch (err) {
      log(`falha ao imprimir pedido ${order._id}: ${err.message}`);
      log("interrompendo este ciclo; nova tentativa no próximo intervalo");
      break;
    }
  }

  await flushPending({ config, state });
}

/**
 * Inicia o loop. Retorna função stop().
 */
function startLoop({ config, state, printFn }) {
  let stopped = false;
  let backoffMs = 0;

  const tick = async () => {
    if (stopped) return;
    try {
      await processOnce({ config, state, printFn });
      backoffMs = 0;
    } catch (err) {
      if (err.status === 401 || err.status === 403 || err.status === 404) {
        log("TOKEN INVÁLIDO — gere um novo no painel (/impressora) e rode:");
        log('  node index.js --token NOVOTOKEN');
      } else if (err.status === 429) {
        backoffMs = Math.min(backoffMs ? backoffMs * 2 : 30000, 120000);
        log(`limite de requisições (429) — aguardando ${backoffMs / 1000}s antes da próxima tentativa`);
      } else {
        log("erro no ciclo:", err.message);
      }
    }
    if (!stopped) setTimeout(tick, backoffMs || config.pollIntervalMs);
  };

  tick();
  return () => {
    stopped = true;
  };
}

module.exports = { startLoop, processOnce, fetchReadyOrders, markPrinted };
