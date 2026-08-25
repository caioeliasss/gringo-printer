const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setupFileLogging } = require("../src/logger");

test("tee de console.log/error para o arquivo de log", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gringo-logger-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const original = console.log;
  const logger = setupFileLogging({ dir });
  assert.notStrictEqual(console.log, original);

  console.log("linha de teste");
  console.error("erro de teste");

  logger.stop();
  assert.strictEqual(console.log, original);

  const content = fs.readFileSync(logger.file, "utf8");
  assert.match(content, /\[log\] linha de teste/);
  assert.match(content, /\[error\] erro de teste/);
});

test("rotaciona para .old quando o log excede o limite", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gringo-logger-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const logger = setupFileLogging({ dir });
  logger.stop();
  fs.writeFileSync(logger.file, "x".repeat(2048));

  const rotacionado = setupFileLogging({ dir, maxBytes: 1024 });
  console.log("linha após rotação"); // arquivo novo só nasce no 1º write
  rotacionado.stop();

  assert.ok(fs.existsSync(logger.file + ".old"));
  assert.match(fs.readFileSync(logger.file, "utf8"), /linha após rotação/);
});
