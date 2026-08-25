/**
 * Caminhos de runtime: quando empacotado (pkg), config/state/SumatraPDF ficam em
 * %LOCALAPPDATA%\gringo-printer; em desenvolvimento, na raiz do repo.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");

function isPackaged() {
  return Boolean(process.pkg);
}

function getDataDir() {
  if (!isPackaged()) return REPO_ROOT;
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const dir = path.join(base, "gringo-printer");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { isPackaged, getDataDir };
