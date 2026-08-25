# AGENTS.md

Serviço Windows de impressão silenciosa de cupons 80mm (Node.js 18+, CommonJS, sem build step). Dependência única: `pdfkit`. Logs, comentários e UI em pt-BR — manter.

## Comandos

- `npm test` — único passo de verificação. Não há lint, typecheck, formatter nem CI.
- Um único arquivo: `node --test test/poll.test.js`
- O script `test` do package.json lista os arquivos explicitamente — **ao criar um novo teste, adicione o arquivo lá**.
- Os testes são herméticos: sobem mock HTTP em `127.0.0.1` e usam `state.json` em temp dir. Não dependem de API nem impressora.
- `node index.js --test` NÃO é teste unitário: envia cupom real à impressora padrão (exige SumatraPDF).

## Arquitetura

- Entrada: `index.js` → flags (`src/args`) → persiste em `config.json` (`src/config`) → loop (`src/poll`).
- `config.json` e `state.json` são arquivos locais de runtime (gitignored). `createState()` sem argumento escreve no repo root — em testes, sempre passe caminho em temp dir.
- `src/poll.js` `processOnce`: ordem deliberada — marca como impresso ANTES do PATCH `mark-as-printed`. Garantia de não-reimpressão: se o PATCH falhar, o id fica pendente em `state.json` e é reenviado no ciclo seguinte; 400/404 no reenvio descarta a pendência (o papel já saiu). Não "corrigir" essa ordem.
- Tratamento de status no loop: 401/403/404 = token inválido; 429 = backoff exponencial 30–120s.
- `src/print.js`: impressão = subprocesso SumatraPDF. Busca: env `GRINGO_SUMATRA_PATH` → `vendor/` → Program Files → PATH. `vendor/SumatraPDF.exe` é baixado por `scripts/get-sumatra.bat`, não vem do npm install.
- `src/receipt.js`: cupom PDF com fonte Courier padrão (nada embutido). É porta do `buildReceiptHTML` do painel web — mudanças visuais devem manter paridade com o painel (backend: repo `gringo_delivery-store`).

## API consumida (backend gringo_delivery-store)

- `GET /api/orders/printer/ready-to-print/:token`
- `PATCH /api/orders/printer/mark-as-printed` `{ token, orderIds }`
