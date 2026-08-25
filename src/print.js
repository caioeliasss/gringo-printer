/**
 * Impressão silenciosa via SumatraPDF (portável, em vendor/).
 * Sempre imprime na impressora PADRÃO do sistema, salvo override --printer.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const VENDOR_DIR = path.join(__dirname, "..", "vendor");

function findSumatraPdf() {
  const fromEnv = process.env.GRINGO_SUMATRA_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  try {
    const candidate = fs
      .readdirSync(VENDOR_DIR)
      .find((f) => /^sumatrapdf.*\.exe$/i.test(f));
    if (candidate) return path.join(VENDOR_DIR, candidate);
  } catch {}

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

  return "SumatraPDF"; // último recurso: procura no PATH
}

/**
 * Imprime um PDF de forma silenciosa.
 * @param {string} pdfPath caminho do PDF
 * @param {string|null} printerName null => impressora padrão do sistema
 */
function printPdf(pdfPath, printerName) {
  const exe = findSumatraPdf();
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
