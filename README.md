# Gringo Printer

Serviço de impressão silenciosa de cupons (80mm) do Gringo Delivery. Roda no
computador da loja, na **impressora padrão do sistema** — sem navegador, sem
flags do Chrome, sem selecionar impressora.

## Como funciona

1. Loop a cada 10s: `GET {api}/orders/printer/ready-to-print/{token}`
2. Para cada pedido novo: gera o cupom em PDF e imprime via SumatraPDF
   (portável, em `vendor/`) na impressora padrão
3. Confirma no backend: `PATCH {api}/orders/printer/mark-as-printed` com
   `{ token, orderIds: [...] }`
4. Se o PATCH falhar, o id fica pendente em `state.json` e é reenviado no
   próximo ciclo — **sem reimprimir o cupom**

O token de pareamento é gerado no painel da loja, página **Impressora**.

## Requisitos

- Windows com Node.js 18+ (`node --version`)
- Impressora térmica instalada e definida como **padrão do sistema**
- `vendor\SumatraPDF.exe` (veja instalação abaixo)

## Instalação (lojista)

```bat
1. npm install
2. scripts\get-sumatra.bat        :: baixa o SumatraPDF para vendor\
3. node index.js --test           :: imprime cupom de teste na impressora padrão
4. node index.js --token IMPxxxx --api https://api.gringodelivery.com.br/api
5. scripts\install-task.bat       :: (opcional) inicia com o Windows, oculto
```

Se `get-sumatra.bat` falhar, baixe o SumatraPDF portável em
<https://www.sumatrapdfreader.org/download-free-pdf-viewer> e coloque o
executável em `vendor\SumatraPDF.exe`.

## Comandos

| Comando | Efeito |
|---|---|
| `node index.js --token X --api Y` | salva o pareamento e inicia (primeira vez) |
| `node index.js` | inicia o serviço (usa `config.json`) |
| `node index.js --test` | imprime cupom de teste e sai |
| `node index.js --token X` | troca o token (gerado no painel /impressora) |
| `node index.js --printer "Nome"` | usa impressora específica (padrão: do sistema) |
| `node index.js --interval 5000` | intervalo de polling (mín. 3000ms) |

## Arquivos locais

- `config.json` — pareamento (token, API, intervalo, impressora)
- `state.json` — ids impressos + confirmações pendentes (últimos 500)

Ambos podem ser apagados para resetar o serviço.

## Solução de problemas

- **"TOKEN INVÁLIDO"** — gere um novo token no painel (/impressora) e rode
  `node index.js --token NOVOTOKEN`. O token antigo é invalidado na hora.
- **Não imprime** — rode `node index.js --test`; confira se a impressora é a
  padrão do Windows (Painel de Controle → Dispositivos e Impressoras).
- **429 (limite de requisições)** — o serviço faz backoff automático; se
  persistir, aumente `--interval`.
- **Logs** — tudo aparece no console; com a tarefa agendada, veja o processo
  `node.exe` no Gerenciador de Tarefas. Para depurar, rode `node index.js`
  numa janela aberta.

## Desenvolvimento

```bash
npm install
npm test        # node:test (state + layout do cupom)
npm start
```

Endpoints consumidos (backend gringo_delivery-store):

- `GET  /api/orders/printer/ready-to-print/:token`
- `PATCH /api/orders/printer/mark-as-printed` `{ token, orderIds }`
