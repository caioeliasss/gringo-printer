/**
 * Painel web local (monitoramento, cupom de teste e reconfiguração de token/API).
 * Servidor node:http em 127.0.0.1 — sem deps npm, página única inline.
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { snapshot, recordCycleOk, recordCycleError } = require("./runtime");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const LOGO_FILE = path.join(PUBLIC_DIR, "gringo_1024.png");
const FAVICON_FILE = path.join(PUBLIC_DIR, "favicon.ico");
const PREFERRED_PORT = 8791;
const MAX_PORT_ATTEMPTS = 10;

const mask = (t) => t.slice(0, 6) + "*".repeat(Math.max(0, t.length - 6));

function statusView(rt) {
  if (!rt.lastCheckAt) return { label: "Iniciando…", tone: "idle", detail: "Aguardando o primeiro ciclo" };
  const err = rt.lastError;
  if (!err) {
    return {
      label: "Funcionando",
      tone: "ok",
      detail: `Última verificação: ${new Date(rt.lastCheckAt).toLocaleString("pt-BR")}`,
    };
  }
  const at = new Date(err.at).toLocaleTimeString("pt-BR");
  if (err.kind === "token")
    return { label: "Token inválido", tone: "error", detail: `${err.message} — ${at}. Gere um novo no painel da loja.` };
  if (err.kind === "rate-limit")
    return {
      label: "Aguardando",
      tone: "warn",
      detail: `${err.message} — retoma em ~${Math.round(rt.backoffMs / 1000)}s (${at})`,
    };
  if (err.kind === "print") return { label: "Falha na impressão", tone: "error", detail: `${err.message} (${at})` };
  return { label: "Sem conexão com a API", tone: "error", detail: `${err.message} (${at})` };
}

function buildPageHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gringo Printer — Painel</title>
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" href="/logo.png">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px 48px;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    background: #f4f5f7; color: #1f2430;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
  header img { width: 52px; height: 52px; border-radius: 12px; }
  header h1 { font-size: 20px; margin: 0; }
  header p { margin: 2px 0 0; color: #6b7280; font-size: 13px; }
  .card {
    background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
    padding: 16px; margin-bottom: 14px;
  }
  .status-line { display: flex; align-items: center; gap: 10px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
  .dot.ok { background: #16a34a; box-shadow: 0 0 0 4px #dcfce7; }
  .dot.error { background: #dc2626; box-shadow: 0 0 0 4px #fee2e2; }
  .dot.warn { background: #d97706; box-shadow: 0 0 0 4px #fef3c7; }
  .dot.idle { background: #9ca3af; box-shadow: 0 0 0 4px #f3f4f6; }
  .status-label { font-weight: 600; font-size: 15px; }
  .status-detail { color: #6b7280; font-size: 13px; margin-top: 4px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; margin: 0 0 10px; }
  .kv { display: grid; grid-template-columns: 130px 1fr; gap: 6px 12px; font-size: 13px; }
  .kv dt { color: #6b7280; margin: 0; }
  .kv dd { margin: 0; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #f1f2f4; }
  th { color: #6b7280; font-weight: 600; }
  tr:last-child td { border-bottom: none; }
  .empty { color: #9ca3af; font-size: 13px; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    background: #fef3c7; color: #92400e; font-size: 12px; font-weight: 600;
  }
  button {
    background: #1f2430; color: #fff; border: none; border-radius: 8px;
    padding: 9px 16px; font-size: 14px; cursor: pointer;
  }
  button:disabled { opacity: .55; cursor: wait; }
  #test-msg { font-size: 13px; margin-left: 10px; }
  #test-msg.ok { color: #16a34a; }
  #test-msg.erro { color: #dc2626; }
  form { display: grid; gap: 10px; }
  form label { font-size: 13px; color: #374151; display: grid; gap: 4px; }
  form input {
    width: 100%; padding: 8px 10px; font-size: 14px;
    border: 1px solid #d1d5db; border-radius: 8px; background: #fff;
  }
  form input:focus { outline: 2px solid #93c5fd; border-color: #2563eb; }
  #cfg-msg { font-size: 13px; margin-left: 10px; }
  #cfg-msg.ok { color: #16a34a; }
  #cfg-msg.erro { color: #dc2626; }
  #cfg-msg.aviso { color: #d97706; }
  footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 8px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <img src="/logo.png" alt="Gringo Delivery">
    <div>
      <h1>Gringo Printer</h1>
      <p>Impressão silenciosa de cupons 80mm</p>
    </div>
  </header>

  <div class="card">
    <div class="status-line">
      <span class="dot idle" id="dot"></span>
      <span class="status-label" id="status-label">Carregando…</span>
      <span class="badge" id="pending-badge" hidden>pendências</span>
    </div>
    <div class="status-detail" id="status-detail"></div>
  </div>

  <div class="card">
    <h2>Cupons impressos</h2>
    <table>
      <thead><tr><th>Pedido</th><th>Impresso em</th></tr></thead>
      <tbody id="historico"><tr><td colspan="2" class="empty">Nenhum cupom nesta sessão.</td></tr></tbody>
    </table>
    <p class="empty" id="total-sessao" style="margin:10px 0 0"></p>
  </div>

  <div class="card">
    <h2>Configuração</h2>
    <dl class="kv" id="config"></dl>
  </div>

  <div class="card">
    <h2>Pareamento (token e API)</h2>
    <form id="form-config">
      <label>Token de pareamento <input id="in-token" type="text" autocomplete="off" spellcheck="false" placeholder="atual: —"></label>
      <label>URL da API <input id="in-api" type="text" autocomplete="off" spellcheck="false"></label>
      <div>
        <button type="submit" id="btn-config">Salvar e verificar</button>
        <span id="cfg-msg"></span>
      </div>
    </form>
  </div>

  <div class="card">
    <h2>Teste</h2>
    <button id="btn-teste">Imprimir cupom de teste</button>
    <span id="test-msg"></span>
  </div>

  <footer>Atualiza a cada 5s — Gringo Printer</footer>
</div>
<script>
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hora = (iso) => { const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleString("pt-BR"); };

  async function refresh() {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error();
      render(await res.json());
    } catch {
      $("status-label").textContent = "Painel offline";
      $("status-detail").textContent = "O serviço foi encerrado.";
      $("dot").className = "dot error";
    }
  }

  function render(s) {
    $("dot").className = "dot " + s.status.tone;
    $("status-label").textContent = s.status.label;
    $("status-detail").textContent = s.status.detail;
    const badge = $("pending-badge");
    if (s.pendingCount > 0) { badge.hidden = false; badge.textContent = s.pendingCount + " confirmação(ões) pendente(s)"; }
    else badge.hidden = true;

    const h = s.history || [];
    $("historico").innerHTML = h.length
      ? h.map((r) => "<tr><td>#" + esc(r.orderNumber) + "</td><td>" + hora(r.printedAt) + "</td></tr>").join("")
      : '<tr><td colspan="2" class="empty">Nenhum cupom nesta sessão.</td></tr>';
    $("total-sessao").textContent = s.printedCount > 0 ? s.printedCount + " cupom(ns) impresso(s) nesta sessão" : "";

    $("config").innerHTML = [
      ["Token", esc(s.config.tokenMascarado || "—")],
      ["API", esc(s.config.apiUrl)],
      ["Impressora", esc(s.config.printer || "padrão do sistema")],
      ["Intervalo", Math.round(s.config.pollIntervalMs / 1000) + "s"],
      ["SumatraPDF", esc(s.config.sumatra || "baixado na 1ª impressão")],
      ["Em execução desde", hora(s.startedAt)],
    ].map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("");

    // não sobrescreve campo que o lojista está digitando
    const inApi = $("in-api"), inToken = $("in-token");
    if (document.activeElement !== inApi) inApi.value = s.config.apiUrl || "";
    if (document.activeElement !== inToken) {
      inToken.placeholder = s.config.tokenMascarado
        ? "atual: " + s.config.tokenMascarado + " (deixe vazio p/ manter)"
        : "gere no painel da loja (/impressora)";
    }
  }

  $("form-config").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("btn-config"), msg = $("cfg-msg");
    btn.disabled = true; msg.className = ""; msg.textContent = "salvando…";
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: $("in-token").value.trim(), apiUrl: $("in-api").value.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        msg.className = "erro";
        msg.textContent = data.error || "não foi possível salvar";
        return;
      }
      const v = data.verificacao;
      if (v && v.valido === true) { msg.className = "ok"; msg.textContent = "salvo — token verificado na API"; }
      else if (v && v.valido === false) { msg.className = "erro"; msg.textContent = "salvo, mas " + v.motivo; }
      else if (v) { msg.className = "aviso"; msg.textContent = v.motivo; }
      else { msg.className = "ok"; msg.textContent = "salvo"; }
      $("in-token").value = "";
      refresh();
    } catch (e2) {
      msg.className = "erro"; msg.textContent = "falhou: " + e2.message;
    } finally {
      btn.disabled = false;
    }
  });

  $("btn-teste").addEventListener("click", async () => {
    const btn = $("btn-teste"), msg = $("test-msg");
    btn.disabled = true; msg.className = ""; msg.textContent = "enviando…";
    try {
      const res = await fetch("/api/test-print", { method: "POST" });
      const data = await res.json();
      msg.className = data.ok ? "ok" : "erro";
      msg.textContent = data.ok ? "cupom enviado à impressora" : "falhou: " + (data.error || "erro desconhecido");
    } catch (e) {
      msg.className = "erro"; msg.textContent = "falhou: " + e.message;
    } finally { btn.disabled = false; }
  });

  refresh();
  setInterval(refresh, 5000);
</script>
</body>
</html>`;
}

function sendJson(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("corpo muito grande"), { code: "badrequest" }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(Object.assign(new Error("JSON inválido"), { code: "badrequest" }));
      }
    });
    req.on("error", reject);
  });
}

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), ms))]);

/** Verifica se a porta responde como uma instância nossa do painel. */
async function isGringoInstanceAt(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data && data.gringoPrinter === true;
  } catch {
    return false;
  }
}

/**
 * Sobe o painel em 127.0.0.1. Tenta PREFERRED_PORT..(+9).
 * - Porta ocupada por OUTRA instância nossa → resolve { alreadyRunning: true }
 *   (o chamador deve abrir o painel existente e encerrar — evita impressão duplicada).
 * - Portas esgotadas/erro → resolve null (o serviço segue sem painel).
 * @returns {Promise<{server, port, url, alreadyRunning?}|null>}
 */
function startDashboard({
  runtime,
  config,
  printTest,
  findSumatra,
  saveConfig = () => {},
  verifyCreds = async () => {},
  port = PREFERRED_PORT,
}) {
  return new Promise((resolve) => {
    const tryListen = (attempt) => {
      if (attempt >= MAX_PORT_ATTEMPTS) {
        console.log("[gringo-printer] painel indisponível: portas ocupadas (continuando sem painel)");
        return resolve(null);
      }
      const server = http.createServer(handler);
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE" && port > 0) {
          const wanted = port + attempt;
          isGringoInstanceAt(wanted).then((ours) => {
            if (ours) {
              resolve({
                server: null,
                port: wanted,
                url: `http://127.0.0.1:${wanted}`,
                alreadyRunning: true,
              });
            } else {
              tryListen(attempt + 1);
            }
          });
        } else {
          console.log("[gringo-printer] painel indisponível:", err.message);
          resolve(null);
        }
      });
      server.listen(port > 0 ? port + attempt : 0, "127.0.0.1", () => {
        const actualPort = server.address().port;
        resolve({ server, port: actualPort, url: `http://127.0.0.1:${actualPort}` });
      });
    };

    const handler = async (req, res) => {
      try {
        const url = (req.url || "/").split("?")[0];
        if (req.method === "GET" && (url === "/" || url === "/index.html")) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(buildPageHtml());
        } else if (req.method === "GET" && url === "/favicon.ico") {
        fs.readFile(FAVICON_FILE, (err, buf) => {
          if (err) {
            res.writeHead(404);
            res.end();
            return;
          }
          res.writeHead(200, { "Content-Type": "image/x-icon", "Cache-Control": "no-cache" });
          res.end(buf);
        });
      } else if (req.method === "GET" && (url === "/logo.png" || url === "/favicon.png")) {
          fs.readFile(LOGO_FILE, (err, buf) => {
            if (err) {
              res.writeHead(404);
              res.end();
              return;
            }
            res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
            res.end(buf);
          });
        } else if (req.method === "GET" && url === "/api/status") {
          const data = snapshot(runtime, {
            gringoPrinter: true,
            status: statusView(runtime),
            config: {
              tokenMascarado: config.token ? mask(config.token) : "",
              apiUrl: config.apiUrl,
              printer: config.printer || "",
              pollIntervalMs: config.pollIntervalMs,
              sumatra: findSumatra ? findSumatra() || "" : "",
            },
          });
          sendJson(res, 200, data);
        } else if (req.method === "POST" && url === "/api/config") {
          const body = await readJson(req);
          const nextToken = typeof body.token === "string" ? body.token.trim() : "";
          const nextApi = typeof body.apiUrl === "string" ? body.apiUrl.trim().replace(/\/+$/, "") : "";
          if (!nextToken && !nextApi) {
            sendJson(res, 400, { ok: false, error: "informe o token ou a URL da API" });
            return;
          }
          if (nextApi && !/^https?:\/\//i.test(nextApi)) {
            sendJson(res, 400, { ok: false, error: "URL da API deve começar com http:// ou https://" });
            return;
          }
          // muta o MESMO objeto que o loop usa: próximo ciclo já usa as novas credenciais
          if (nextToken) config.token = nextToken;
          if (nextApi) config.apiUrl = nextApi;
          saveConfig(config);

          // verificação imediata das credenciais contra a API
          let verificacao;
          try {
            await withTimeout(verifyCreds(config.apiUrl, config.token), 8000);
            verificacao = { valido: true };
            recordCycleOk(runtime);
          } catch (err) {
            if (err.status === 401 || err.status === 403 || err.status === 404) {
              verificacao = { valido: false, motivo: `token recusado pela API (HTTP ${err.status})` };
              recordCycleError(runtime, "token", verificacao.motivo);
            } else {
              verificacao = { valido: null, motivo: `salvo, mas a API não respondeu (${err.message})` };
              recordCycleError(runtime, "network", err.message);
            }
          }
          sendJson(res, 200, {
            ok: true,
            tokenMascarado: mask(config.token),
            apiUrl: config.apiUrl,
            verificacao,
          });
        } else if (req.method === "POST" && url === "/api/test-print") {
          try {
            await printTest();
            sendJson(res, 200, { ok: true });
          } catch (err) {
            sendJson(res, 200, { ok: false, error: err.message });
          }
        } else {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("não encontrado");
        }
      } catch (err) {
        sendJson(res, err.code === "badrequest" ? 400 : 500, { ok: false, error: err.message });
      }
    };

    tryListen(0);
  });
}

module.exports = {
  startDashboard,
  buildPageHtml,
  statusView,
  isGringoInstanceAt,
  PREFERRED_PORT,
};
