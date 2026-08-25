/**
 * Download automático do SumatraPDF portável.
 * Mesma versão/URL do scripts/get-sumatra.bat (3.6.1, 64 bits).
 * Extração via PowerShell Expand-Archive (presente em todo Windows) — sem deps npm.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SUMATRA_URL = "https://www.sumatrapdfreader.org/dl/rel/3.6.1/SumatraPDF-3.6.1-64.zip";
const DOWNLOAD_TIMEOUT_MS = 120000;

function findSumatraExe(dir) {
  try {
    const candidate = fs.readdirSync(dir).find((f) => /^sumatrapdf.*\.exe$/i.test(f));
    return candidate ? path.join(dir, candidate) : null;
  } catch {
    return null;
  }
}

async function downloadZip(url, zipPath) {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`download retornou ${res.status}`);
  fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
}

/** Escapa aspas simples para uso dentro de strings PowerShell (''). */
const ps = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Extrai o ZIP com Expand-Archive e move o SumatraPDF.exe para dir. */
function extractZip(zipPath, dir) {
  const tmpDir = path.join(dir, "sumatra-extract-tmp");
  const exeDest = path.join(dir, "SumatraPDF.exe");
  const script = [
    `Expand-Archive -Force ${ps(zipPath)} ${ps(tmpDir)}`,
    `$exe = Get-ChildItem -Recurse -Filter 'SumatraPDF*.exe' ${ps(tmpDir)} | Select-Object -First 1`,
    `if ($exe) { Move-Item -Force $exe.FullName ${ps(exeDest)} }`,
    `Remove-Item -Recurse -Force ${ps(tmpDir)} -ErrorAction SilentlyContinue`,
    `if ($exe) { exit 0 } else { exit 1 }`,
  ].join("; ");
  return new Promise((resolve, reject) => {
    const child = spawn("powershell", ["-NoProfile", "-Command", script], {
      windowsHide: true,
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("close", () => {
      const exe = findSumatraExe(dir);
      if (exe) resolve(exe);
      else reject(new Error("falha ao extrair o SumatraPDF do ZIP"));
    });
  });
}

/**
 * Garante que exista um SumatraPDF.exe em dir. Retorna o caminho do executável.
 * Na primeira vez baixa o ZIP oficial portável e extrai com PowerShell.
 */
async function ensureSumatra(dir, opts = {}) {
  const existing = findSumatraExe(dir);
  if (existing) return existing;

  const url = opts.url || SUMATRA_URL;
  const extract = opts.extract || extractZip;
  const zipPath = path.join(os.tmpdir(), `gringo-sumatra-${Date.now()}.zip`);

  try {
    await downloadZip(url, zipPath);
  } catch (err) {
    throw new Error(
      `não foi possível baixar o SumatraPDF (${err.message}). Baixe manualmente ${url} ` +
        `e coloque o SumatraPDF.exe em ${dir}`
    );
  }
  try {
    return await extract(zipPath, dir);
  } finally {
    try {
      fs.unlinkSync(zipPath);
    } catch {}
  }
}

module.exports = { ensureSumatra, SUMATRA_URL };
