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

## Instalação (lojista) — exe único

1. Baixe o `GringoPrinter.exe` e dê dois cliques (na 1ª vez o Windows pode
   avisar sobre app desconhecido: "Mais informações → Executar assim mesmo")
2. Cole o **token** gerado no painel (/impressora) — só isso; API fica em
   "avançado" e o padrão já é a de produção
3. Na primeira impressão o SumatraPDF (~7MB) é baixado automaticamente

Dados locais do exe em `%LOCALAPPDATA%\gringo-printer` (`config.json`,
`state.json`, `SumatraPDF.exe`). Apagar a pasta reseta tudo. Para trocar
token/API depois: `GringoPrinter.exe --setup`.

## Instalação alternativa (via Node)

```bat
1. npm install
2. scripts\get-sumatra.bat        :: baixa o SumatraPDF para vendor\
3. node index.js --test           :: imprime cupom de teste na impressora padrão
4. node index.js --token IMPxxxx --api https://api.gringodelivery.com.br/api
5. scripts\install-task.bat       :: (opcional) inicia com o Windows, oculto
```

Requisitos: Windows com Node.js 18+ e impressora definida como **padrão do
sistema**. O `--api` é opcional (default de produção); `--test` exige
`vendor\SumatraPDF.exe` ou SumatraPDF instalado.

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
| `node index.js --setup` | reconfigura via prompt: token (Enter mantém) + API em avançado |
| `node index.js --printer "Nome"` | usa impressora específica (padrão: do sistema) |
| `node index.js --interval 5000` | intervalo de polling (mín. 3000ms) |

## Bandeja do Windows (área de notificação)

Em execução, o app fica oculto perto do relógio (seta para cima, "janelas
ocultas"). Clique com o **botão direito** no ícone:

- **Abrir painel** — abre o painel local no navegador (2 cliques também)
- **Ver terminal** — janela com o log da sessão em tempo real
- **Sair** — encerra o serviço

O exe se auto-oculta: duplo clique nele (já configurado) não deixa console
aberto — o app segue em segundo plano com o ícone na bandeja. O log completo
da sessão fica em `gringo-printer.log` junto dos demais arquivos locais.

## Arquivos locais

- `config.json` — pareamento (token, API, intervalo, impressora)
- `state.json` — ids impressos + confirmações pendentes (últimos 500)
- `gringo-printer.log` — log da sessão (rotaciona em ~512KB)
- No exe: ficam em `%LOCALAPPDATA%\gringo-printer`

Ambos podem ser apagados para resetar o serviço.

## Solução de problemas

- **"TOKEN INVÁLIDO"** — gere um novo token no painel (/impressora) e rode
  `node index.js --token NOVOTOKEN` (ou `--setup`). O token antigo é
  invalidado na hora. No exe: `GringoPrinter.exe --setup`.
- **Não imprime** — rode `node index.js --test`; confira se a impressora é a
  padrão do Windows (Painel de Controle → Dispositivos e Impressoras).
- **429 (limite de requisições)** — o serviço faz backoff automático; se
  persistir, aumente `--interval`.
- **Logs** — tudo aparece no console e em `gringo-printer.log` (ver também
  "Ver terminal" na bandeja). Com a tarefa agendada, o processo `node.exe`
  aparece no Gerenciador de Tarefas.

## Desenvolvimento

```bash
npm install
npm test        # node:test (state + layout do cupom + poll + sumatra)
npm start
```

### Gerar o exe (distribuição)

```bash
npm run build:exe   # -> dist/GringoPrinter.exe (Node 22 win-x64 embutido, ~60MB)
```

- Primeiro build baixa o runtime base do pkg (cache em `~/.pkg-cache`)
- `--fallback-to-source` é necessário: `brotli` (dep do fontkit) falha na
  geração de bytecode e precisa vir como fonte
- `node22` porque o pkg não publica mais prebuilt de node18 (EOL); o app
  exige `>=18`, então o runtime embutido continua compatível

Endpoints consumidos (backend gringo_delivery-store):

- `GET  /api/orders/printer/ready-to-print/:token`
- `PATCH /api/orders/printer/mark-as-printed` `{ token, orderIds }`
