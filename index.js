/**
 * Gringo Printer — serviço de impressão silenciosa de cupons.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { parseArgs, formatHelp } = require("./src/args");
const { loadConfig, saveConfig } = require("./src/config");
const { buildTestReceipt } = require("./src/receipt");
const { printPdf, findSumatraPdf } = require("./src/print");
const { startLoop, fetchReadyOrders } = require("./src/poll");
const { createState } = require("./src/state");
const { runInteractiveSetup, isInteractive } = require("./src/setup");
const { isPackaged, getDataDir } = require("./src/paths");
const { createRuntime } = require("./src/runtime");
const { startDashboard } = require("./src/dashboard");

/** Abre o navegador padrão no Windows (usado para abrir o painel junto com o exe). */
function openBrowser(url) {
  if (process.platform !== "win32") {
    console.log(`  Abra o painel no navegador: ${url}`);
    return;
  }
  const child = spawn("cmd", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(formatHelp());
    return;
  }

  const config = loadConfig();
  let dirty = false;
  if (args.token) {
    config.token = args.token;
    dirty = true;
  }
  if (args.apiUrl) {
    config.apiUrl = args.apiUrl.replace(/\/+$/, "");
    dirty = true;
  }
  if (args.pollIntervalMs) {
    config.pollIntervalMs = Math.max(3000, args.pollIntervalMs);
    dirty = true;
  }
  if (args.printer !== undefined) {
    config.printer = args.printer;
    dirty = true;
  }
  if (dirty) saveConfig(config);

  if (args.setup) {
    if (!isInteractive()) {
      console.log("ERRO: --setup precisa de terminal interativo (janela aberta).");
      process.exitCode = 1;
      return;
    }
    await runInteractiveSetup(config);
    saveConfig(config);
  }

  if (args.test) {
    const pdfPath = path.join(os.tmpdir(), "gringo-printer-teste.pdf");
    await buildTestReceipt(pdfPath);
    console.log(`Cupom de teste gerado: ${pdfPath}`);
    console.log(`SumatraPDF: ${findSumatraPdf() || "será baixado automaticamente"}`);
    await printPdf(pdfPath, config.printer || null);
    console.log("Impressão de teste enviada para a impressora padrão.");
    return;
  }

  if ((!config.token || !config.apiUrl) && isInteractive()) {
    await runInteractiveSetup(config);
    saveConfig(config);
  }

  if (!config.token || !config.apiUrl) {
    console.log(formatHelp());
    console.log(
      "\nERRO: token e API ainda não configurados. Rode com --token e --api na primeira vez."
    );
    process.exitCode = 1;
    return;
  }

  console.log("Gringo Printer iniciado");
  console.log(`  API: ${config.apiUrl}`);
  console.log(`  Token: ${config.token.slice(0, 6)}${"*".repeat(Math.max(0, config.token.length - 6))}`);
  console.log(`  Intervalo: ${config.pollIntervalMs}ms | Impressora: ${config.printer || "padrão do sistema"}`);
  console.log(`  SumatraPDF: ${findSumatraPdf() || "baixado automaticamente na 1ª impressão"}`);
  if (isPackaged()) console.log(`  Dados: ${getDataDir()}`);

  const runtime = createRuntime();
  let dashboard = null;
  if (!args.noDashboard) {
    dashboard = await startDashboard({
      runtime,
      config,
      findSumatra: findSumatraPdf,
      saveConfig,
      // verificação imediata ao salvar token/API no painel (lança com .status 401/403/404)
      verifyCreds: (apiUrl, token) => fetchReadyOrders(apiUrl, token),
      printTest: async () => {
        const pdfPath = path.join(os.tmpdir(), "gringo-printer-teste.pdf");
        await buildTestReceipt(pdfPath);
        try {
          await printPdf(pdfPath, config.printer || null);
        } finally {
          try {
            fs.unlinkSync(pdfPath);
          } catch {}
        }
      },
    });
    if (dashboard && dashboard.alreadyRunning) {
      console.log("Gringo Printer já está em execução — abrindo o painel existente.");
      openBrowser(dashboard.url);
      process.exit(0);
    }
    if (dashboard) {
      console.log(`  Painel: ${dashboard.url}`);
      // tarefa oculta do Windows (GRINGO_NO_BROWSER=1) não abre navegador no boot
      if (!process.env.GRINGO_NO_BROWSER) openBrowser(dashboard.url);
    }
  }

  const stop = startLoop({ config, state: createState(), runtime });
  const shutdown = () => {
    console.log("\nEncerrando...");
    stop();
    if (dashboard) dashboard.server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
