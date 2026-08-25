/**
 * Ícone do app na área de notificação do Windows (bandeja, perto do relógio) —
 * sem deps npm, via PowerShell (System.Windows.Forms.NotifyIcon) em processo
 * filho. Menu do botão direito:
 *   - "Abrir painel"  → abre o painel local no navegador (se disponível)
 *   - "Ver terminal"  → janela de terminal exibindo o log da sessão (tail -f)
 *   - "Sair"          → encerra o serviço (linha "quit" no stdout deste filho)
 *
 * O script da bandeja observa o PID do processo principal: se ele morrer, o
 * ícone é removido sozinho (evita ícone fantasma). Os .ps1 são gravados no
 * data dir (com BOM — PowerShell 5.1 só reconhece UTF-8 com BOM) porque, no
 * exe empacotado, os assets do pkg não são acessíveis a outros processos.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { getDataDir } = require("./paths");

/** Escapa valor para literal de aspas simples no PowerShell ('' para '). */
function psq(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function buildTrayScript({ nodePid, url, iconPath, viewerPath }) {
  return (
    [
      "$ErrorActionPreference = 'Stop'",
      `$script:nodePid = ${Number(nodePid)}`,
      `$script:url = ${psq(url || "")}`,
      `$script:iconPath = ${psq(iconPath)}`,
      `$script:viewer = ${psq(viewerPath)}`,
      "Add-Type -AssemblyName System.Windows.Forms",
      "Add-Type -AssemblyName System.Drawing",
      "$script:tray = New-Object System.Windows.Forms.NotifyIcon",
      "if (Test-Path -LiteralPath $script:iconPath) {",
      "  $script:tray.Icon = New-Object System.Drawing.Icon($script:iconPath)",
      "} else {",
      "  $script:tray.Icon = [System.Drawing.SystemIcons]::Application",
      "}",
      "$script:tray.Text = 'Gringo Printer'",
      "$script:tray.Visible = $true",
      "$script:menu = New-Object System.Windows.Forms.ContextMenu",
      ...(url
        ? [
            "$mi = New-Object System.Windows.Forms.MenuItem('Abrir painel')",
            "$mi.add_Click({ Start-Process $script:url })",
            "$script:menu.MenuItems.Add($mi) | Out-Null",
            "$script:tray.add_DoubleClick({ Start-Process $script:url })",
          ]
        : []),
      "$mi = New-Object System.Windows.Forms.MenuItem('Ver terminal')",
      "$mi.add_Click({ Start-Process 'powershell.exe' -ArgumentList ('-NoProfile -NoExit -ExecutionPolicy Bypass -File \"' + $script:viewer + '\"') })",
      "$script:menu.MenuItems.Add($mi) | Out-Null",
      "$mi = New-Object System.Windows.Forms.MenuItem('Sair')",
      "$mi.add_Click({",
      "  try { [Console]::Out.WriteLine('quit'); [Console]::Out.Flush() } catch {}",
      "})",
      "$script:menu.MenuItems.Add($mi) | Out-Null",
      "$script:tray.ContextMenu = $script:menu",
      "# encerra a bandeja se o processo principal morrer (evita ícone fantasma)",
      "$script:watch = New-Object System.Windows.Forms.Timer",
      "$script:watch.Interval = 2000",
      "$script:watch.add_Tick({",
      "  if (-not (Get-Process -Id $script:nodePid -ErrorAction SilentlyContinue)) {",
      "    $script:watch.Stop()",
      "    $script:tray.Visible = $false",
      "    $script:tray.Dispose()",
      "    [System.Windows.Forms.Application]::Exit()",
      "  }",
      "})",
      "$script:watch.Start()",
      "[System.Windows.Forms.Application]::Run()",
    ].join("\r\n") + "\r\n"
  );
}

/** Janela aberta pela opção "Ver terminal": tail do log da sessão. */
function buildViewerScript({ logFile }) {
  return (
    [
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
      "$host.UI.RawUI.WindowTitle = 'Gringo Printer — Terminal'",
      "Write-Host 'Gringo Printer — terminal da sessão (feche a janela para sair)'",
      `Get-Content -LiteralPath ${psq(logFile)} -Tail 200 -Wait -Encoding UTF8`,
    ].join("\r\n") + "\r\n"
  );
}

/** Grava texto em UTF-8 com BOM (PowerShell 5.1 exige BOM p/ acentos). */
function writePs1(file, content) {
  fs.writeFileSync(file, "\uFEFF" + content, "utf8");
}

/**
 * Sobe o ícone na bandeja (apenas Windows; GRINGO_NO_TRAY=1 desativa).
 * @param {{url?: string, logFile: string, onQuit?: () => void}} opts
 * @returns {{child: import("child_process").ChildProcess}|null}
 */
function startTray({ url = "", logFile, onQuit }) {
  if (process.platform !== "win32" || process.env.GRINGO_NO_TRAY) return null;

  let dataDir;
  try {
    dataDir = getDataDir();
  } catch {
    return null;
  }
  const trayScript = path.join(dataDir, "tray.ps1");
  const viewerScript = path.join(dataDir, "open-terminal.ps1");
  const iconPath = path.join(dataDir, "tray.ico");

  try {
    writePs1(trayScript, buildTrayScript({ nodePid: process.pid, url, iconPath, viewerPath: viewerScript }));
    writePs1(viewerScript, buildViewerScript({ logFile }));
    // no exe empacotado o asset vive dentro do binário: materializa no data dir
    try {
      fs.writeFileSync(iconPath, fs.readFileSync(path.join(__dirname, "..", "public", "favicon.ico")));
    } catch {}
  } catch (err) {
    console.warn("[gringo-printer] bandeja indisponível:", err.message);
    return null;
  }

  let child;
  try {
    child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", trayScript],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch (err) {
    console.warn("[gringo-printer] bandeja indisponível:", err.message);
    return null;
  }

  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line === "quit" && onQuit) onQuit();
    }
  });
  child.on("error", () => {});
  return { child };
}

module.exports = { startTray, buildTrayScript, buildViewerScript, psq };
