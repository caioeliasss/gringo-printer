/**
 * Gringo Printer — serviço de impressão silenciosa de cupons.
 */
const os = require("os");
const path = require("path");
const { parseArgs, formatHelp } = require("./src/args");
const { loadConfig, saveConfig } = require("./src/config");
const { buildTestReceipt } = require("./src/receipt");
const { printPdf, findSumatraPdf } = require("./src/print");
const { startLoop } = require("./src/poll");
const { createState } = require("./src/state");

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

  if (args.test) {
    const pdfPath = path.join(os.tmpdir(), "gringo-printer-teste.pdf");
    await buildTestReceipt(pdfPath);
    console.log(`Cupom de teste gerado: ${pdfPath}`);
    console.log(`SumatraPDF: ${findSumatraPdf()}`);
    await printPdf(pdfPath, config.printer || null);
    console.log("Impressão de teste enviada para a impressora padrão.");
    return;
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
  console.log(`  SumatraPDF: ${findSumatraPdf()}`);

  const stop = startLoop({ config, state: createState() });
  const shutdown = () => {
    console.log("\nEncerrando...");
    stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
