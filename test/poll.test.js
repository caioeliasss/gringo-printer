const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { processOnce } = require("../src/poll");
const { createState } = require("../src/state");

const ORDER = {
  _id: "6650000000000000000000f1",
  orderNumber: "2001",
  status: "confirmado",
  customer: [{ name: "Mock", phone: "11999" }],
  items: [{ quantity: 1, productName: "Item", price: 10 }],
  total: 10,
};

function startMockApi() {
  const patches = [];
  let readyOrders = [ORDER];
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url.includes("/ready-to-print/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(readyOrders));
    } else if (req.method === "PATCH" && req.url.includes("/mark-as-printed")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        patches.push(JSON.parse(body));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, patches, setReady: (o) => (readyOrders = o) })
    );
  });
}

test("processOnce: imprime novo pedido, confirma no backend e não repete", async () => {
  const mock = await startMockApi();
  const { port } = mock.server.address();
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gp-poll-")), "state.json");
  const state = createState(stateFile);
  const config = { apiUrl: `http://127.0.0.1:${port}/api`, token: "TOK", printer: "" };

  const printed = [];
  const fakePrint = async (order) => printed.push(order._id);

  await processOnce({ config, state, printFn: fakePrint });
  assert.deepEqual(printed, [ORDER._id], "imprimiu o pedido novo");
  assert.equal(mock.patches.length, 1, "um PATCH mark-as-printed");
  assert.deepEqual(mock.patches[0], { token: "TOK", orderIds: [ORDER._id] });
  assert.deepEqual(state.getPending(), [], "sem pendências após confirmação");

  // segundo ciclo: mesmo pedido disponível, mas já impresso localmente
  await processOnce({ config, state, printFn: fakePrint });
  assert.deepEqual(printed, [ORDER._id], "não reimprimiu");

  mock.server.close();
});

test("processOnce: PATCH com falha deixa pendência e não reimprime", async () => {
  const mock = await startMockApi();
  const { port } = mock.server.address();
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gp-poll-")), "state.json");
  const state = createState(stateFile);
  const config = { apiUrl: `http://127.0.0.1:${port}/api`, token: "TOK", printer: "" };

  const printed = [];
  const fakePrint = async (order) => printed.push(order._id);

  // PATCH sempre falha (500)
  mock.server.close();
  const failing = http.createServer((req, res) => {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([ORDER]));
    } else {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise((r) => failing.listen(port, "127.0.0.1", r));

  await processOnce({ config, state, printFn: fakePrint });
  assert.deepEqual(printed, [ORDER._id]);
  assert.deepEqual(state.getPending(), [ORDER._id], "id ficou pendente");

  await processOnce({ config, state, printFn: fakePrint });
  assert.deepEqual(printed, [ORDER._id], "não reimprimiu mesmo com PATCH falhando");

  failing.close();
});
