/**
 * Build do exe com ícone: pkg + rcedit.
 *
 * rcedit no exe FINAL quebra o payload do pkg ("Pkg: Error reading from file."),
 * então o ícone (public/favicon.ico) é aplicado numa CÓPIA do binário base do
 * cache do pkg, e o pkg monta o exe a partir dela via PKG_NODE_PATH (é exatamente
 * o mecanismo do pkg-fetch p/ base customizado: places.js localPlace()).
 *
 * Uso: node scripts/build-exe.js  (equivalente a npm run build:exe)
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { need } = require("@yao-pkg/pkg-fetch");
const rcedit = require("rcedit");

const REPO = path.join(__dirname, "..");
const ICON = path.join(REPO, "public", "favicon.ico");
const CUSTOM_BASE_DIR = path.join(REPO, ".pkg-base");
const PKG_ARGS = [
  ".",
  "--output",
  "dist/GringoImpressora.exe",
  "--compress",
  "GZip",
  "--fallback-to-source",
];

async function patchBaseWithIcon() {
  // base pristine do cache (baixa e valida hash se necessário) — SEM PKG_NODE_PATH
  const base = await need({ nodeRange: "node22", platform: "win", arch: "x64" });
  fs.mkdirSync(CUSTOM_BASE_DIR, { recursive: true });
  const patched = path.join(CUSTOM_BASE_DIR, path.basename(base));
  fs.copyFileSync(base, patched);
  await rcedit(patched, { icon: ICON });
  console.log(`binário base com ícone: ${patched}`);
  return patched;
}

function runPkg(basePath) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["pkg", ...PKG_ARGS], {
      cwd: REPO,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, PKG_NODE_PATH: basePath },
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`pkg terminou com código ${code}`))
    );
  });
}

async function main() {
  const patched = await patchBaseWithIcon();
  await runPkg(patched);
  console.log("dist/GringoImpressora.exe gerado");
}

main().catch((err) => {
  console.error("falha no build:", err.message);
  process.exit(1);
});
