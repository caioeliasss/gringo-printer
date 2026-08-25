const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createState, MAX_PRINTED_IDS } = require("../src/state");

function tmpStateFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gringo-printer-state-"));
  return path.join(dir, "state.json");
}

test("markPrinted persiste entre instâncias", () => {
  const file = tmpStateFile();
  const s1 = createState(file);
  s1.markPrinted("abc123");
  const s2 = createState(file);
  assert.equal(s2.isPrinted("abc123"), true);
  assert.equal(s2.isPrinted("outro"), false);
});

test("markPrinted não duplica ids", () => {
  const s = createState(tmpStateFile());
  s.markPrinted("x1");
  s.markPrinted("x1");
  s.markPrinted("x1");
  assert.equal(s.isPrinted("x1"), true);
});

test("limite de 500 ids impressos (descarta os mais antigos)", () => {
  const file = tmpStateFile();
  const s = createState(file);
  for (let i = 0; i < 520; i++) s.markPrinted(`id-${i}`);
  const s2 = createState(file);
  assert.equal(s2.isPrinted("id-0"), false);
  assert.equal(s2.isPrinted("id-19"), false);
  assert.equal(s2.isPrinted("id-20"), true);
  assert.equal(s2.isPrinted("id-519"), true);
  void MAX_PRINTED_IDS;
});

test("pendências: add, get e clear", () => {
  const file = tmpStateFile();
  const s = createState(file);
  s.addPending("p1");
  s.addPending("p2");
  s.addPending("p1"); // não duplica
  assert.deepEqual(s.getPending(), ["p1", "p2"]);

  const s2 = createState(file); // persiste
  assert.deepEqual(s2.getPending(), ["p1", "p2"]);

  s2.clearPending("p1");
  assert.deepEqual(s2.getPending(), ["p2"]);
  s2.clearPending("inexistente"); // não lança erro
  assert.deepEqual(s2.getPending(), ["p2"]);
});
