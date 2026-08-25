# AGENTS.md

Serviço Windows de impressão silenciosa de cupons 80mm (Node.js 18+, CommonJS). Dependência única de runtime: `pdfkit`. Logs, comentários e UI em pt-BR — manter.

## Comandos

- `npm test` — único passo de verificação. Não há lint, typecheck, formatter nem CI.
- Um único arquivo: `node --test test/poll.test.js`
- O script `test` do package.json lista os arquivos explicitamente — **ao criar um novo teste, adicione o arquivo lá**.
- Os testes são herméticos: sobem mock HTTP em `127.0.0.1` e usam `state.json` em temp dir. Não dependem de API nem impressora.
- `node index.js --test` NÃO é teste unitário: envia cupom real à impressora padrão (exige SumatraPDF).
- `npm run build:exe` — roda `scripts/build-exe.js`: gera `dist/GringoImpressora.exe` (distribuição ao lojista, `@yao-pkg/pkg`, alvo node22-win-x64 — não existe mais prebuilt de node18) já com o ícone `public/favicon.ico`. Primeiro build baixa o runtime base (~cache `~/.pkg-cache`). `--fallback-to-source` é obrigatório: bytecode do `brotli` (dep do fontkit) falha e sem a flag o arquivo é descartado.

## Arquitetura

- Entrada: `index.js` → flags (`src/args`) → persiste em `config.json` (`src/config`) → setup interativo (`src/setup.js`: 1ª execução ou `--setup`) → loop (`src/poll`).
- `src/paths.js`: quando empacotado (`process.pkg`), dados ficam em `%LOCALAPPDATA%\gringo-printer`; em dev, na raiz do repo. `config.json`/`state.json`/`SumatraPDF.exe` seguem esse diretório.
- `config.json` e `state.json` são arquivos locais de runtime (gitignored). `createState()` sem argumento escreve no data dir — em testes, sempre passe caminho em temp dir.
- `apiUrl` tem default de produção em `src/config.js` — o setup interativo só pergunta o token; API fica em "avançado". Setup roda na 1ª execução (token ausente) ou com a flag `--setup` (redefinição; Enter mantém o token atual); sempre exige TTY (`src/setup.js` `isInteractive`); sem TTY mantém help + exit 1 (tarefa oculta não pode travar em prompt).
- `src/poll.js` `processOnce`: ordem deliberada — marca como impresso ANTES do PATCH `mark-as-printed`. Garantia de não-reimpressão: se o PATCH falhar, o id fica pendente em `state.json` e é reenviado no ciclo seguinte; 400/404 no reenvio descarta a pendência (o papel já saiu). Não "corrigir" essa ordem.
- Tratamento de status no loop: 401/403/404 = token inválido; 429 = backoff exponencial 30–120s.
- `src/print.js`: impressão = subprocesso SumatraPDF. Busca: env `GRINGO_SUMATRA_PATH` → data dir → `vendor/` → Program Files. Se não achar, `src/sumatra.js` baixa o ZIP portável oficial (3.6.1, mesmo URL do `scripts/get-sumatra.bat`) e extrai via PowerShell `Expand-Archive` — sem deps npm. Falha de download vira erro com instrução manual (URL + caminho).
- `src/receipt.js`: cupom PDF com fonte Courier padrão (nada embutido). É porta do `buildReceiptHTML` do painel web — mudanças visuais devem manter paridade com o painel (backend: repo `gringo_delivery-store`).

## pkg (build do exe) — pegadinhas conhecidas

- `pkg.assets` só serve dados legíveis via fs (usado p/ os `.afm` do pdfkit e `public/**/*`); para módulo require-ável usar `pkg.scripts` — por isso `es-get-iterator` (exports map que o tracer não segue) está em `scripts`, senão o exe quebra no boot com MODULE_NOT_FOUND.
- **Ícone do exe**: `rcedit` no exe FINAL corrompe o payload do pkg ("Pkg: Error reading from file."). Solução em `scripts/build-exe.js`: aplica o ícone numa cópia do binário base e roda o pkg com `PKG_NODE_PATH` apontando p/ ela — é o mecanismo oficial do pkg-fetch p/ base custom (`places.js` `localPlace()`); atenção: `PKG_NODE_PATH` também é usado como caminho do binário, nunca setar p/ valor não-caminho (ex.: "1") senão toda a geração de bytecode cai em fallback-to-source.
- Ao mexer em dependências, validar o exe buildado: `./dist/GringoImpressora.exe --help` (boot) e, ideal, ciclo contra mock HTTP com `GRINGO_SUMATRA_PATH` apontando p/ um exe inofensivo (cmd.exe) — nunca `--test` em CI/dev, imprime de verdade. No modo empacotado o ciclo toca `%LOCALAPPDATA%\gringo-printer\config.json` — sempre backup/restore.
- `dist/` e `.pkg-base/` são gitignored; `vendor/SumatraPDF.exe` (dev) vem de `scripts/get-sumatra.bat`, não do npm install nem do build.

## Painel web local (`src/dashboard.js`)

- Sobe junto com o loop em `127.0.0.1:8791` (fallback +9 portas; `--no-dashboard` desativa). Página única inline, pt-BR, logo de `public/`, auto-refresh 5s. Rotas: `/`, `/logo.png`, `/favicon.ico`, `GET /api/status` (inclui `gringoPrinter: true`, usado p/ detectar instância própria), `POST /api/config` (token/API: valida, salva, verifica contra a API na hora e muta o objeto `config` que o loop usa), `POST /api/test-print`.
- Abrir o exe abre o navegador com o painel (`openBrowser` em `index.js`), EXCETO com `GRINGO_NO_BROWSER=1` — `scripts/start-hidden.vbs` seta isso p/ a tarefa agendada não abrir navegador a cada logon.
- Segunda instância: se a porta 8791 já tem OUTRA instância nossa, o processo só abre o painel existente e sai (`alreadyRunning`) — evita cupom impresso em duplicidade.
- `src/runtime.js`: telemetria da sessão (status, contadores, histórico ≤20) compartilhada entre loop e painel; não persiste.

## Bandeja, terminal e janela oculta

- Duplo clique no exe (win32 + empacotado + zero argumentos + já configurado) → `index.js` re-spawna a si mesmo com `windowsHide`/`GRINGO_HIDDEN=1` e sai: o app roda sem console visível, com ícone na bandeja. `GRINGO_NO_HIDE=1` desativa. Flags (`--setup`, `--test`…) sempre rodam no console visível — não re-spawne nesses casos (setup precisa de TTY).
- `src/tray.js`: bandeja via PowerShell `NotifyIcon` em processo filho (sem deps npm). Menu botão direito: Abrir painel / Ver terminal / Sair. "Sair" escreve linha `quit` no stdout do filho → `shutdown` no Node. O script observa o PID do Node via timer e se auto-encerra (dispose do ícone) quando o processo morre — não matar o filho no shutdown (kill abrupto deixa ícone fantasma). `GRINGO_NO_TRAY=1` desativa. `tray.ps1`/`open-terminal.ps1`/`tray.ico` são materializados no data dir (com BOM — PS 5.1 só lê UTF-8 com BOM; assets do pkg não são acessíveis a outros processos).
- `src/logger.js`: tee de `console.log/warn/error` para `gringo-printer.log` no data dir (rotação ~512KB → `.old`). "Ver terminal" abre PowerShell com `Get-Content -Wait` nesse arquivo. Sem isso, a sessão oculta não teria log algum.

## API consumida (backend gringo_delivery-store)

- `GET /api/orders/printer/ready-to-print/:token`
- `PATCH /api/orders/printer/mark-as-printed` `{ token, orderIds }`
