/**
 * Geração do cupom 80mm em PDF (porta do buildReceiptHTML do painel web).
 * Usa apenas as fontes Courier/Courier-Bold (padrão do PDF, sem embutir nada).
 */
const fs = require("fs");
const PDFDocument = require("pdfkit");

const PAGE_WIDTH = (80 / 25.4) * 72; // ~226.77pt
const MARGIN = (2 / 25.4) * 72; // ~5.67pt
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const FONT = "Courier-Bold";
const FONT_BOLD = "Courier-Bold";
const SIZE_HEADER = 14;
const SIZE_BODY = 11;
const SIZE_SMALL = 9.5;

function lineHeight(size) {
  return Math.ceil(size * 1.35);
}

function money(n) {
  return `R$ ${Number(n || 0).toFixed(2)}`;
}

function firstCustomer(order) {
  if (Array.isArray(order.customer)) return order.customer[0] || {};
  return order.customer || {};
}

/**
 * Monta a lista de operações do cupom:
 * { type: "text", text, size?, bold?, align?, indent?, gapBefore? }
 * { type: "row",  left, right, size?, bold?, gapBefore? }
 * { type: "rule", gapBefore? }
 */
function buildOps(order) {
  const ops = [];
  const text = (t, o = {}) => ops.push({ type: "text", text: String(t ?? ""), ...o });
  const rule = (gapBefore = 4) => ops.push({ type: "rule", gapBefore });

  const storeName = order.store?.name || "Gringo Delivery";
  const date = new Date(order.createdAt || Date.now()).toLocaleString("pt-BR");
  const customer = firstCustomer(order);

  text(storeName, { bold: true, size: SIZE_HEADER, align: "center", gapBefore: 0 });
  text(`Pedido #${order.orderNumber || String(order._id || "").slice(-6)}`, { align: "center", gapBefore: 2 });
  text(date, { size: SIZE_SMALL, align: "center", gapBefore: 1 });
  rule();

  text(`Cliente: ${customer.name || "—"}`, { gapBefore: 3 });
  text(`Tel: ${customer.phone || "—"}`, { size: SIZE_SMALL });

  text("Endereco:", { bold: true, gapBefore: 3 });
  if (order.deliveryMode === "entrega") {
    const a = customer.customerAddress || {};
    const linha1 = [a.address, a.addressNumber].filter(Boolean).join(", ");
    text(linha1 || "Endereço não informado", { size: SIZE_SMALL });
    if (a.bairro) text(a.bairro, { size: SIZE_SMALL });
  } else {
    text("Retirada no local", { size: SIZE_SMALL });
  }
  rule();

  for (const item of order.items || []) {
    ops.push({
      type: "row",
      left: `${item.quantity}x ${item.productName}`,
      right: money(item.price * item.quantity),
      gapBefore: 3,
    });
    for (const extra of Array.isArray(item.extras) ? item.extras : []) {
      const qty = extra.quantity || 1;
      let t = `+ ${qty}x ${extra.productName}`;
      if (extra.category) t += ` (${extra.category})`;
      if (extra.price != null) t += ` - ${money(extra.price * qty)}`;
      text(t, { size: SIZE_SMALL, indent: 12 });
    }
    if (item.notes) text(`Obs: ${item.notes}`, { size: SIZE_SMALL, indent: 8 });
  }
  rule();

  if (order.notes) {
    text(`Obs: ${order.notes}`, { size: SIZE_SMALL, gapBefore: 3 });
    rule();
  }

  ops.push({ type: "row", left: "TOTAL", right: money(order.total), bold: true, size: SIZE_BODY + 1, gapBefore: 4 });
  text(`Pagamento: ${order.payment?.method || "—"}`, { gapBefore: 2 });
  if (order.payment?.change != null) text(`Troco para: ${money(order.payment.change)}`);
  rule(6);
  text("*** Gringo Delivery ***", { size: SIZE_SMALL, align: "center", gapBefore: 6 });

  return ops;
}

/**
 * Mede e posiciona as operações, devolvendo itens renderizáveis
 * e a altura total da página (cupom de altura variável).
 */
function layoutOps(ops) {
  const scratch = new PDFDocument({ size: "A4", compress: true });
  const widthOf = (t, size, bold) => {
    scratch.font(bold ? FONT_BOLD : FONT).fontSize(size);
    return scratch.widthOfString(String(t));
  };

  const items = [];
  let y = MARGIN + 2;

  const wrapWords = (str, size, bold, maxWidth) => {
    const words = String(str).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (widthOf(cand, size, bold) <= maxWidth || !line) line = cand;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines.length > 0 ? lines : [""];
  };

  for (const op of ops) {
    y += op.gapBefore || 0;

    if (op.type === "rule") {
      items.push({ type: "rule", y });
      y += 4;
    } else if (op.type === "text") {
      const size = op.size || SIZE_BODY;
      const lines = wrapWords(op.text, size, op.bold, CONTENT_WIDTH - (op.indent || 0));
      for (const ln of lines) {
        items.push({
          type: "text",
          text: ln,
          size,
          bold: !!op.bold,
          align: op.align || "left",
          indent: op.indent || 0,
          y,
          width: widthOf(ln, size, op.bold),
        });
        y += lineHeight(size);
      }
    } else if (op.type === "row") {
      const size = op.size || SIZE_BODY;
      const rightText = op.right != null ? String(op.right) : "";
      const rightWidth = rightText ? widthOf(rightText, size, op.bold) : 0;
      const leftMax = CONTENT_WIDTH - rightWidth - 8;
      const lines = wrapWords(op.left, size, op.bold, leftMax);
      lines.forEach((ln, i) => {
        items.push({
          type: "row",
          left: ln,
          right: i === 0 ? rightText : "",
          size,
          bold: !!op.bold,
          y,
          rightWidth: i === 0 ? rightWidth : 0,
        });
        y += lineHeight(size);
      });
    }
  }

  return { items, height: Math.ceil(y + MARGIN + 4) };
}

function layoutReceipt(order) {
  return layoutOps(buildOps(order));
}

async function renderPdf(items, height, outPath) {
  const doc = new PDFDocument({
    size: [PAGE_WIDTH, Math.max(height, 80)],
    margin: 0,
    compress: true,
  });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  for (const it of items) {
    doc.fillColor("#000");
    if (it.type === "rule") {
      doc.lineWidth(0.7).moveTo(MARGIN, it.y).lineTo(PAGE_WIDTH - MARGIN, it.y).stroke();
    } else if (it.type === "text") {
      doc.font(it.bold ? FONT_BOLD : FONT).fontSize(it.size);
      let x;
      if (it.align === "center") x = (PAGE_WIDTH - it.width) / 2;
      else if (it.align === "right") x = PAGE_WIDTH - MARGIN - it.width;
      else x = MARGIN + it.indent;
      doc.text(it.text, x, it.y, { lineBreak: false });
    } else if (it.type === "row") {
      doc.font(it.bold ? FONT_BOLD : FONT).fontSize(it.size);
      doc.text(it.left, MARGIN, it.y, { lineBreak: false });
      if (it.right) {
        doc.text(it.right, PAGE_WIDTH - MARGIN - it.rightWidth, it.y, { lineBreak: false });
      }
    }
  }

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function buildReceiptPdf(order, outPath) {
  const { items, height } = layoutReceipt(order);
  await renderPdf(items, height, outPath);
  return outPath;
}

function buildTestOrder() {
  return {
    _id: "test00000001",
    orderNumber: "TESTE",
    createdAt: new Date().toISOString(),
    store: { name: "TESTE DE IMPRESSAO - Gringo" },
    deliveryMode: "entrega",
    customer: [
      {
        name: "Cliente Teste",
        phone: "(11) 99999-9999",
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
}

async function buildTestReceipt(outPath) {
  return buildReceiptPdf(buildTestOrder(), outPath);
}

module.exports = {
  buildReceiptPdf,
  buildTestReceipt,
  buildOps,
  layoutReceipt,
  PAGE_WIDTH,
  CONTENT_WIDTH,
};
