/**
 * Impressão silenciosa via SumatraPDF.
 * Sempre imprime na impressora PADRÃO do sistema, salvo override --printer.
 * Se o SumatraPDF não for encontrado, baixa automaticamente (src/sumatra.js).
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { getDataDir } = require("./paths");
const { ensureSumatra } = require("./sumatra");

const VENDOR_DIR = path.join(__dirname, "..", "vendor");

function findInDir(dir) {
  try {
    const candidate = fs
      .readdirSync(dir)
      .find((f) => /^sumatrapdf.*\.exe$/i.test(f));
    if (candidate) return path.join(dir, candidate);
  } catch {}
  return null;
}

function findSumatraPdf() {
  const fromEnv = process.env.GRINGO_SUMATRA_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const local = findInDir(getDataDir()) || findInDir(VENDOR_DIR);
  if (local) return local;

  const common = [
    path.join(process.env.ProgramFiles || "C:\\Program Files", "SumatraPDF", "SumatraPDF.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "SumatraPDF", "SumatraPDF.exe"),
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "SumatraPDF", "SumatraPDF.exe")
      : null,
  ].filter(Boolean);
  for (const c of common) {
    if (fs.existsSync(c)) return c;
  }

  return null;
}

/**
 * Imprime um PDF de forma silenciosa.
 * @param {string} pdfPath caminho do PDF
 * @param {string|null} printerName null => impressora padrão do sistema
 */
async function printPdf(pdfPath, printerName) {
  let exe = findSumatraPdf();
  if (!exe) {
    console.log("[gringo-printer] SumatraPDF não encontrado — baixando automaticamente...");
    exe = await ensureSumatra(getDataDir());
    console.log(`[gringo-printer] SumatraPDF instalado em ${exe}`);
  }
  const args = printerName ? ["-print-to", printerName] : ["-print-to-default"];
  args.push("-silent", "-exit-when-done", pdfPath);

  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, stdio: "ignore" });
    child.on("error", (err) =>
      reject(new Error(`não foi possível executar o SumatraPDF (${exe}): ${err.message}`))
    );
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`SumatraPDF terminou com código ${code}`));
    });
  });
}

module.exports = { printPdf, findSumatraPdf };
