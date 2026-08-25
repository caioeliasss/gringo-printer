const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildReceiptPdf, layoutReceipt, PAGE_WIDTH, CONTENT_WIDTH } = require("../src/receipt");

const ORDER = {
  _id: "6650000000000000000000f1",
  orderNumber: "1001",
  createdAt: "2026-08-25T12:30:00Z",
  store: { name: "Loja Teste" },
  deliveryMode: "entrega",
  customer: [
    {
      name: "Maria Silva",
      phone: "(11) 98888-7777",
      customerAddress: { address: "Rua das Flores", addressNumber: "123", bairro: "Centro" },
    },
  ],
  items: [
    { quantity: 2, productName: "X-Burguer Artesanal", price: 25.5, notes: "sem cebola" },
    {
      quantity: 1,
      productName: "Porcao de Batata",
      price: 18,
      extras: [{ quantity: 1, productName: "Cheddar", category: "Adicionais", price: 5 }],
    },
  ],
  payment: { method: "pix", change: 50 },
  total: 94,
};

function textsOf(items) {
  return items
    .filter((i) => i.type !== "rule")
    .map((i) => [i.text, i.left, i.right].filter(Boolean).join(" | "))
    .join("\n");
}

test("layout contém os dados do pedido", () => {
  const { items, height } = layoutReceipt(ORDER);
  const all = textsOf(items);
  assert.ok(all.includes("Pedido #1001"), "número do pedido");
  assert.ok(all.includes("Loja Teste"), "nome da loja");
  assert.ok(all.includes("Maria Silva"), "cliente");
  assert.ok(all.includes("2x X-Burguer Artesanal"), "item");
  assert.ok(all.includes("R$ 51.00"), "total do item (2 x 25.50)");
  assert.ok(all.includes("+ 1x Cheddar (Adicionais) - R$ 5.00"), "extra");
  assert.ok(all.includes("Obs: sem cebola"), "observação do item");
  assert.ok(all.includes("TOTAL"), "linha de total");
  assert.ok(all.includes("R$ 94.00"), "valor total");
  assert.ok(all.includes("Troco para: R$ 50.00"), "troco");
  assert.ok(all.includes("Retirada no local") === false, "é entrega, não retirada");
  assert.ok(height > 150, "altura razoável de cupom");
});

test("retirada no local quando deliveryMode != entrega", () => {
  const { items } = layoutReceipt({ ...ORDER, deliveryMode: "retirada" });
  assert.ok(textsOf(items).includes("Retirada no local"));
});

test("todas as linhas cabem na largura de 80mm", () => {
  const { items } = layoutReceipt(ORDER);
  for (const it of items) {
    if (it.type === "row" && it.right) {
      assert.ok(
        it.rightWidth + 8 <= CONTENT_WIDTH,
        `coluna direita "${it.right}" excede a largura`
      );
    }
  }
});

test("gera PDF válido em disco", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gringo-printer-receipt-"));
  const out = path.join(dir, "cupom.pdf");
  await buildReceiptPdf(ORDER, out);
  const buf = fs.readFileSync(out);
  assert.equal(buf.slice(0, 4).toString(), "%PDF");
  assert.ok(buf.length > 800, "PDF com conteúdo");
  void PAGE_WIDTH;
});
