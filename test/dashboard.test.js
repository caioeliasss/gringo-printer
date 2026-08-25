const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { startDashboard, buildPageHtml, statusView, isGringoInstanceAt, PREFERRED_PORT } = require("../src/dashboard");
const { createRuntime, recordCycleOk, recordCycleError, recordPrinted } = require("../src/runtime");

const CONFIG = {
  apiUrl: "http://127.0.0.1:1/api",
  token: "IMPtoken-secreto",
  printer: "",
  pollIntervalMs: 10000,
};

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: urlPath }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      })
      .on("error", reject);
  });
}

function post(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath, method: "POST" },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function postJson(port, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: urlPath,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      }
    );
    req.on("error", reject);
    req.end(payload);
  });
}

async function startOnEphemeralPort(runtime, printTest, overrides = {}) {
  // porta 0 = efêmera; passa port assim startDashboard não colide com nada
  const dash = await startDashboard({
    runtime,
    config: overrides.config || CONFIG,
    findSumatra: () => null,
    printTest,
    saveConfig: overrides.saveConfig || (() => {}),
    verifyCreds: overrides.verifyCreds || (async () => []),
    port: 0,
  });
  assert.ok(dash, "painel subiu");
  return dash;
}

test("dashboard: página HTML com pt-BR, logo e auto-refresh", async () => {
  const dash = await startOnEphemeralPort(createRuntime(), async () => {});
  try {
    const page = await get(dash.port, "/");
    assert.equal(page.status, 200);
    const html = page.body.toString("utf8");
    assert.match(html, /lang="pt-BR"/);
    assert.match(html, /gringo_1024\.png|\/logo\.png/);
    assert.match(html, /api\/status/);
    assert.match(html, /api\/test-print/);
    assert.doesNotMatch(html, /<script src=/); // sem assets externos — tudo inline
  } finally {
    dash.server.close();
  }
});

test("dashboard: /logo.png serve o PNG de public/", async () => {
  const dash = await startOnEphemeralPort(createRuntime(), async () => {});
  try {
    const res = await get(dash.port, "/logo.png");
    assert.equal(res.status, 200);
    assert.equal(res.body.subarray(0, 8).toString("hex"), "89504e470d0a1a0a"); // assinatura PNG
  } finally {
    dash.server.close();
  }
});

test("dashboard: /api/status expõe runtime + config com token mascarado", async () => {
  const runtime = createRuntime();
  recordCycleOk(runtime);
  recordPrinted(runtime, "6650000000000000000000f1", "2001");
  const dash = await startOnEphemeralPort(runtime, async () => {});
  try {
    const res = await get(dash.port, "/api/status");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body.toString("utf8"));
    assert.equal(data.status.label, "Funcionando");
    assert.equal(data.printedCount, 1);
    assert.equal(data.history[0].orderNumber, "2001");
    assert.equal(data.config.tokenMascarado, "IMPtok**********");
    assert.ok(!JSON.stringify(data).includes("token-secreto"), "token real nunca vaza");
    assert.equal(data.config.printer, "");
    assert.equal(data.config.pollIntervalMs, 10000);
  } finally {
    dash.server.close();
  }
});

test("dashboard: /api/status reflete erro de token e pendências", async () => {
  const runtime = createRuntime();
  recordCycleOk(runtime);
  recordCycleError(runtime, "token", "token inválido ou sem acesso (HTTP 401)");
  runtime.pendingCount = 2;
  const dash = await startOnEphemeralPort(runtime, async () => {});
  try {
    const data = JSON.parse((await get(dash.port, "/api/status")).body.toString("utf8"));
    assert.equal(data.status.tone, "error");
    assert.equal(data.status.label, "Token inválido");
    assert.equal(data.pendingCount, 2);
  } finally {
    dash.server.close();
  }
});

test("dashboard: POST /api/test-print retorna ok e imprime uma vez", async () => {
  let calls = 0;
  const dash = await startOnEphemeralPort(createRuntime(), async () => {
    calls += 1;
  });
  try {
    const res = await post(dash.port, "/api/test-print");
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body.toString("utf8")), { ok: true });
    assert.equal(calls, 1);

    const fail = await post(dash.port, "/api/test-print-erro-nao-existe");
    assert.equal(fail.status, 404);
  } finally {
    dash.server.close();
  }
});

test("dashboard: POST /api/test-print reporta falha sem crashar", async () => {
  const dash = await startOnEphemeralPort(createRuntime(), async () => {
    throw new Error("sem SumatraPDF");
  });
  try {
    const res = await post(dash.port, "/api/test-print");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body.toString("utf8"));
    assert.equal(data.ok, false);
    assert.equal(data.error, "sem SumatraPDF");
  } finally {
    dash.server.close();
  }
});

test("dashboard: rota desconhecida → 404", async () => {
  const dash = await startOnEphemeralPort(createRuntime(), async () => {});
  try {
    const res = await get(dash.port, "/nope");
    assert.equal(res.status, 404);
  } finally {
    dash.server.close();
  }
});

test("statusView: estados iniciando/ok/backoff/impressão", () => {
  const rt = createRuntime();
  assert.equal(statusView(rt).tone, "idle");

  recordCycleOk(rt);
  assert.equal(statusView(rt).tone, "ok");

  recordCycleError(rt, "rate-limit", "limite de requisições (429)", 60000);
  const warn = statusView(rt);
  assert.equal(warn.tone, "warn");
  assert.match(warn.detail, /~60s/);

  recordCycleError(rt, "print", "falha ao imprimir pedido x");
  assert.equal(statusView(rt).label, "Falha na impressão");

  recordCycleError(rt, "network", "fetch failed");
  assert.equal(statusView(rt).label, "Sem conexão com a API");
});

test("runtime: histórico mantém no máximo 20 entradas, mais recente primeiro", () => {
  const rt = createRuntime();
  for (let i = 1; i <= 25; i++) recordPrinted(rt, `id-${i}`, String(1000 + i));
  assert.equal(rt.history.length, 20);
  assert.equal(rt.history[0].orderNumber, "1025");
  assert.equal(rt.printedCount, 25);
});

test("dashboard: porta preferida é 8791 e buildPageHtml é estável", () => {
  assert.equal(PREFERRED_PORT, 8791);
  assert.ok(buildPageHtml().length > 1000);
});

test("dashboard: /favicon.ico serve o ícone de public/", async () => {
  const dash = await startOnEphemeralPort(createRuntime(), async () => {});
  try {
    const res = await get(dash.port, "/favicon.ico");
    assert.equal(res.status, 200);
    // assinatura ICO: 00 00 01 00
    assert.equal(res.body.subarray(0, 4).toString("hex"), "00000100");
  } finally {
    dash.server.close();
  }
});

test("dashboard: POST /api/config salva token/API, persiste e verifica", async () => {
  const config = { ...CONFIG };
  const runtime = createRuntime();
  recordCycleError(runtime, "token", "token inválido (HTTP 401)");
  const saved = [];
  const credenciais = [];
  const dash = await startOnEphemeralPort(runtime, async () => {}, {
    config,
    saveConfig: (c) => saved.push({ ...c }),
    verifyCreds: async (api, token) => {
      credenciais.push({ api, token });
      return [];
    },
  });
  try {
    const res = await postJson(dash.port, "/api/config", {
      token: "IMPNovoToken123",
      apiUrl: "http://127.0.0.1:2/api///",
    });
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body.toString("utf8"));
    assert.equal(data.ok, true);
    assert.equal(data.verificacao.valido, true);
    assert.equal(data.tokenMascarado, "IMPNov*********");
    // mutou o MESMO objeto de config (loop passa a usar na hora)
    assert.equal(config.token, "IMPNovoToken123");
    assert.equal(config.apiUrl, "http://127.0.0.1:2/api", "barra final removida");
    // persistiu
    assert.deepEqual(saved, [config]);
    assert.deepEqual(credenciais, [{ api: "http://127.0.0.1:2/api", token: "IMPNovoToken123" }]);
    // erro de token antigo foi limpo (verificação OK)
    assert.equal(runtime.lastError, null);
  } finally {
    dash.server.close();
  }
});

test("dashboard: POST /api/config sem campos → 400; URL inválida → 400", async () => {
  const dash = await startOnEphemeralPort(createRuntime(), async () => {});
  try {
    const vazio = await postJson(dash.port, "/api/config", {});
    assert.equal(vazio.status, 400);

    const urlRuim = await postJson(dash.port, "/api/config", { token: "x", apiUrl: "ftp://ruim" });
    assert.equal(urlRuim.status, 400);
    assert.match(JSON.parse(urlRuim.body.toString("utf8")).error, /http/);
  } finally {
    dash.server.close();
  }
});

test("dashboard: POST /api/config com token recusado (401) marca inválido", async () => {
  const runtime = createRuntime();
  const config = { ...CONFIG };
  const dash = await startOnEphemeralPort(runtime, async () => {}, {
    config,
    verifyCreds: async () => {
      const err = new Error("GET ready-to-print retornou 401");
      err.status = 401;
      throw err;
    },
  });
  try {
    const res = await postJson(dash.port, "/api/config", { token: "IMPRuim" });
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body.toString("utf8"));
    assert.equal(data.verificacao.valido, false);
    assert.match(data.verificacao.motivo, /401/);
    assert.equal(runtime.lastError.kind, "token");
    assert.equal(config.token, "IMPRuim", "salva mesmo assim (lojista pode rever depois)");
  } finally {
    dash.server.close();
  }
});

test("dashboard: segunda instância na mesma porta resolve alreadyRunning", async () => {
  const port = 28791; // porta de teste fixa e alta para não colidir com a padrão
  const first = await startDashboard({
    runtime: createRuntime(),
    config: CONFIG,
    findSumatra: () => null,
    printTest: async () => {},
    verifyCreds: async () => [],
    port,
  });
  assert.ok(first && !first.alreadyRunning, "primeira instância sobe");
  try {
    assert.equal(await isGringoInstanceAt(port), true, "detecta instância nossa");
    const second = await startDashboard({
      runtime: createRuntime(),
      config: CONFIG,
      findSumatra: () => null,
      printTest: async () => {},
      verifyCreds: async () => [],
      port,
    });
    assert.ok(second && second.alreadyRunning, "segunda instância detecta a primeira");
    assert.equal(second.url, first.url);
    assert.equal(second.server, null);
  } finally {
    first.server.close();
  }
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(await isGringoInstanceAt(port), false, "porta livre depois de fechar");
});
