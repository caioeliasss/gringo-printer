const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { ensureSumatra } = require("../src/sumatra");

const ZIP_BYTES = Buffer.from("PK\x03\x04conteudo-fake-do-zip");

function startZipServer() {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    res.writeHead(200, { "Content-Type": "application/zip" });
    res.end(ZIP_BYTES);
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, hits: () => hits, port: server.address().port })
    )
  );
}

test("ensureSumatra: retorna exe existente sem baixar", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gp-sumatra-"));
  const exe = path.join(dir, "SumatraPDF.exe");
  fs.writeFileSync(exe, "fake");

  const failingExtract = async () => {
    throw new Error("não deveria baixar nem extrair");
  };
  const result = await ensureSumatra(dir, {
    url: "http://127.0.0.1:1/nao-usado",
    extract: failingExtract,
  });
  assert.equal(result, exe);
});

test("ensureSumatra: baixa o ZIP da URL e repassa ao extrator", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gp-sumatra-"));
  const mock = await startZipServer();

  let seenBytes = null;
  let zipPathVisto = null;
  const extract = async (zipPath, destDir) => {
    assert.equal(destDir, dir, "extrator recebe o diretório de destino");
    zipPathVisto = zipPath;
    seenBytes = fs.readFileSync(zipPath);
    const exe = path.join(destDir, "SumatraPDF.exe");
    fs.writeFileSync(exe, "extraido");
    return exe;
  };

  const result = await ensureSumatra(dir, {
    url: `http://127.0.0.1:${mock.port}/sumatra.zip`,
    extract,
  });

  assert.equal(result, path.join(dir, "SumatraPDF.exe"));
  assert.deepEqual(seenBytes, ZIP_BYTES, "bytes baixados são os servidos pelo mock");
  assert.equal(mock.hits(), 1, "um único download");
  assert.equal(fs.existsSync(zipPathVisto), false, "ZIP temporário removido após extração");

  mock.server.close();
});

test("ensureSumatra: falha no download vira erro com instrução manual", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gp-sumatra-"));
  // porta fechada: fetch falha na conexão
  await assert.rejects(
    ensureSumatra(dir, {
      url: "http://127.0.0.1:1/sumatra.zip",
      extract: async () => {
        throw new Error("não deveria chegar aqui");
      },
    }),
    (err) => /SumatraPDF/.test(err.message) && /manualmente/.test(err.message)
  );
  assert.equal(fs.readdirSync(dir).length, 0, "nada gravado no diretório");
});
