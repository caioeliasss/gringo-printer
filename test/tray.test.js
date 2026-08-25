const test = require("node:test");
const assert = require("node:assert");
const { buildTrayScript, buildViewerScript, psq } = require("../src/tray");

test("psq escapa aspas simples para literal do PowerShell", () => {
  assert.strictEqual(psq(""), "''");
  assert.strictEqual(psq("C:\\dir d'o teste"), "'C:\\dir d''o teste'");
});

test("script da bandeja tem menu completo quando há painel", () => {
  const script = buildTrayScript({
    nodePid: 4242,
    url: "http://127.0.0.1:8791",
    iconPath: "C:\\dados\\tray.ico",
    viewerPath: "C:\\dados\\open-terminal.ps1",
  });
  assert.match(script, /Abrir painel/);
  assert.match(script, /Ver terminal/);
  assert.match(script, /Sair/);
  assert.match(script, /\$script:nodePid = 4242/);
  assert.match(script, /'http:\/\/127\.0\.0\.1:8791'/);
  assert.match(script, /'C:\\dados\\open-terminal\.ps1'/);
});

test("sem painel, menu fica só com terminal e sair", () => {
  const script = buildTrayScript({
    nodePid: 1,
    url: "",
    iconPath: "C:\\dados\\tray.ico",
    viewerPath: "C:\\dados\\open-terminal.ps1",
  });
  assert.doesNotMatch(script, /Abrir painel/);
  assert.match(script, /Ver terminal/);
  assert.match(script, /Sair/);
});

test("janela do terminal faz tail do log", () => {
  const script = buildViewerScript({ logFile: "C:\\dados com espaço\\gringo-printer.log" });
  assert.match(script, /Get-Content -LiteralPath 'C:\\dados com espaço\\gringo-printer\.log' -Tail 200 -Wait/);
});
