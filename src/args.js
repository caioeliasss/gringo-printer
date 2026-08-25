/**
 * Parse dos argumentos de linha de comando.
 */

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--test") args.test = true;
    else if (a === "--token") args.token = argv[++i];
    else if (a === "--api" || a === "--api-url") args.apiUrl = argv[++i];
    else if (a === "--interval") args.pollIntervalMs = Number(argv[++i]);
    else if (a === "--printer") args.printer = argv[++i];
    else args._.push(a);
  }
  return args;
}

function formatHelp() {
  return `Gringo Printer — impressão silenciosa de cupons (80mm, impressora padrão)

USO (primeira vez, para parear):
  node index.js --token IMPxxxxxxxx --api https://api.gringodelivery.com.br/api

USO (rotina, depois de configurado):
  node index.js

COMANDOS/FLAGS:
  --token IMPxxx       Token de pareamento gerado no painel (/impressora)
  --api URL            URL base da API (ex.: https://api.gringodelivery.com.br/api)
  --interval MS        Intervalo de verificação em ms (mínimo 3000, padrão 10000)
  --printer NOME       (Opcional) imprime na impressora informada; sem a flag,
                       usa a impressora PADRÃO do sistema
  --test               Imprime um cupom de teste e sai
  --help               Mostra esta ajuda

AUTO-INÍCIO COM O WINDOWS:
  scripts\\install-task.bat   (cria tarefa oculta; desinstalar com uninstall-task.bat)`;
}

module.exports = { parseArgs, formatHelp };
