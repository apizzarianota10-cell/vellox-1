import type { Pedido } from "@/types";

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const INIT      = [ESC, 0x40];
const CENTER    = [ESC, 0x61, 0x01];
const LEFT      = [ESC, 0x61, 0x00];
const BOLD_ON   = [ESC, 0x45, 0x01];
const BOLD_OFF  = [ESC, 0x45, 0x00];
const BIG       = [ESC, 0x21, 0x30]; // double width + height
const NORMAL    = [ESC, 0x21, 0x00];
const CUT       = [GS,  0x56, 0x41, 0x03];

function getColumns(): number {
  try {
    return localStorage.getItem("vellox-paper-size") === "58mm" ? 32 : 48;
  } catch {
    return 48;
  }
}

function txt(s: string): number[] {
  const bytes: number[] = [];
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0x3F;
    bytes.push(code < 256 ? code : 0x3F);
  }
  return bytes;
}

function ln(s = ""): number[] { return [...txt(s), LF]; }

// Quebra texto em linhas de `cols` chars para não transbordar o papel
function wrap(s: string, cols: number): number[] {
  const out: number[] = [];
  while (s.length > cols) {
    out.push(...txt(s.slice(0, cols)), LF);
    s = s.slice(cols);
  }
  if (s.length > 0) out.push(...txt(s), LF);
  return out;
}

function sep(): number[] { return ln("-".repeat(getColumns())); }

function row(label: string, value: string): number[] {
  const W   = getColumns();
  const pad = W - value.length;
  return ln(label.padEnd(pad < 1 ? 1 : pad).slice(0, pad < 1 ? 1 : pad) + value);
}

const PGTO_LABELS: Record<string, string> = {
  dinheiro:      "Dinheiro",
  cartao_credito:"Cartao Credito",
  cartao_debito: "Cartao Debito",
  pix:           "PIX",
  ja_pago:       "Ja pago",
};

export function buildReceipt(pedido: Pedido, empresaNome = "PEDIDO"): Uint8Array {
  const data  = new Date(pedido.created_at).toLocaleString("pt-BR");
  const total = pedido.valor_pedido + pedido.valor_motoboy;
  const pgto  = pedido.forma_pagamento
    ? (PGTO_LABELS[pedido.forma_pagamento] ?? pedido.forma_pagamento)
    : "---";

  const W    = getColumns();
  const bigW = Math.floor(W / 2); // colunas em double-width mode

  const buf: number[] = [
    ...INIT,
    // Nome da empresa em BIG (double-width): limite bigW chars
    ...CENTER, ...BIG, ...BOLD_ON,
    ...ln(empresaNome.toUpperCase().slice(0, bigW)),
    ...NORMAL, ...BOLD_OFF,
    ...ln(data),
    ...sep(),
    ...LEFT, ...BOLD_ON,
    ...ln("PEDIDO #" + pedido.id.slice(0, 8).toUpperCase()),
    ...BOLD_OFF,
    ...sep(),
    // Cliente e telefone com wrap automatico
    ...wrap("CLIENTE: " + pedido.cliente_nome, W),
    ...(pedido.cliente_telefone ? wrap("TEL: " + pedido.cliente_telefone, W) : []),
    ...sep(),
    ...BOLD_ON,
    ...ln(pedido.tipo_pedido === "entrega" ? "** DELIVERY **" : "** RETIRADA **"),
    ...BOLD_OFF,
    ...(pedido.tipo_pedido === "entrega"
      ? [
          ...wrap("END: " + pedido.endereco_entrega, W),
          ...(pedido.bairro ? wrap("BAI: " + pedido.bairro, W) : []),
        ]
      : []),
    ...sep(),
    ...BOLD_ON, ...ln("ITENS:"), ...BOLD_OFF,
    // Itens: cada linha com wrap
    ...(pedido.descricao_itens ?? "---").split("\n").flatMap(l => wrap(l || " ", W)),
    ...(pedido.observacoes ? wrap("OBS: " + pedido.observacoes, W) : []),
    ...sep(),
    ...row("Subtotal:", "R$ " + pedido.valor_pedido.toFixed(2).replace(".", ",")),
    ...(pedido.valor_motoboy > 0
      ? row("Entrega:", "R$ " + pedido.valor_motoboy.toFixed(2).replace(".", ","))
      : []),
    ...BOLD_ON,
    ...row("TOTAL:", "R$ " + total.toFixed(2).replace(".", ",")),
    ...BOLD_OFF,
    ...sep(),
    ...BOLD_ON, ...wrap("PGTO: " + pgto, W), ...BOLD_OFF,
    ...(pedido.troco_para
      ? wrap("Troco p/ R$ " + pedido.troco_para.toFixed(2).replace(".", ","), W)
      : []),
    ...sep(),
    ...CENTER,
    ...ln("Vellox - appvellox.online"),
    LF, LF,
    ...CUT,
  ];

  return new Uint8Array(buf);
}
