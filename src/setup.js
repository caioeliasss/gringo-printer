/**
 * Setup interativo da primeira execução: só pergunta o token;
 * API fica em "avançado" (Enter mantém o default de produção).
 */
const readline = require("node:readline/promises");

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function runInteractiveSetup(config) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const mask = (t) => t.slice(0, 6) + "*".repeat(Math.max(0, t.length - 6));
    const atual = config.token ? ` [atual: ${mask(config.token)}]` : "";
    console.log("\nConfiguração — gere o token no painel da loja (página Impressora).");
    if (config.token) console.log("Enter mantém o valor atual.");
    let token = "";
    while (!token) {
      token = (await rl.question(`Token de pareamento${atual}: `)).trim();
      if (!token && config.token) token = config.token;
      if (!token) console.log("Token obrigatório — gerado no painel /impressora.");
    }
    config.token = token;

    const adv = (await rl.question("Configurações avançadas? (s/N): ")).trim().toLowerCase();
    if (adv === "s" || adv === "sim") {
      const api = (await rl.question(`URL da API [${config.apiUrl}]: `))
        .trim()
        .replace(/\/+$/, "");
      if (api) config.apiUrl = api;
    }
    return config;
  } finally {
    rl.close();
  }
}

module.exports = { runInteractiveSetup, isInteractive };
