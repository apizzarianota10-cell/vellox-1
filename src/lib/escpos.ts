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

type LayoutOpt = "classico" | "moderno" | "compacto";

function getColumns(): number {
  try {
    return localStorage.getItem("vellox-paper-size") === "58mm" ? 32 : 48;
  } catch {
    return 48;
  }
}

// Lê direto do localStorage (não importa de printService.ts pra evitar
// import circular - printService já importa buildReceipt daqui).
function getLayout(): LayoutOpt {
  try {
    const v = localStorage.getItem("vellox-receipt-layout");
    if (v === "classico" || v === "moderno" || v === "compacto") return v;
  } catch {}
  return "classico";
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

// Quebra texto em linhas de `cols` chars sem cortar palavra ao meio
// (só quebra uma palavra isoladamente se ela sozinha já for maior que `cols`)
function wrapLines(s: string, cols: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (w.length > cols) {
      if (cur) { lines.push(cur); cur = ""; }
      let rest = w;
      while (rest.length > cols) { lines.push(rest.slice(0, cols)); rest = rest.slice(cols); }
      cur = rest;
      continue;
    }
    const tentative = cur ? `${cur} ${w}` : w;
    if (tentative.length > cols) { lines.push(cur); cur = w; }
    else cur = tentative;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function wrap(s: string, cols: number): number[] {
  const out: number[] = [];
  for (const l of wrapLines(s, cols)) out.push(...txt(l), LF);
  return out;
}

function sep(char = "-"): number[] { return ln(char.repeat(getColumns())); }

// Reconhece uma linha de item no formato "Nx Nome (detalhe · detalhe) — R$valor"
// (é assim que o catálogo e o pedido manual montam `descricao_itens`).
// Itens fora desse formato (texto livre, pedidos colados) caem no fallback.
function parseItemLine(line: string): { qtd: string; nome: string; detalhes: string[]; preco: string } | null {
  const m = line.match(/^(\d+)x\s+(.+?)\s+—\s+R\$\s*([\d.,]+)\s*$/);
  if (!m) return null;
  const [, qtd, nomeCompleto, preco] = m;
  let nome = nomeCompleto;
  let detalhesRaw = "";
  const parenIdx = nomeCompleto.indexOf(" (");
  if (parenIdx !== -1 && nomeCompleto.endsWith(")")) {
    nome = nomeCompleto.slice(0, parenIdx);
    detalhesRaw = nomeCompleto.slice(parenIdx + 2, -1);
  }
  return { qtd, nome, detalhes: detalhesRaw ? detalhesRaw.split(" · ") : [], preco };
}

// Cada item vira um bloco próprio: nome+preço numa linha, detalhes (sabor/borda/
// adicional) recuados embaixo. `descricao_itens` insere uma linha em branco
// entre blocos para os produtos não ficarem colados uns nos outros (exceto no
// compacto, que fica sem respiro entre eles pra caber mais no rolo).
function itemBlock(line: string, cols: number, prefix: string): number[] {
  const parsed = parseItemLine(line);
  if (!parsed) return wrap((prefix ? "• " : "") + (line || " "), cols);

  const out: number[] = [];
  const qtdNome  = `${prefix}${parsed.qtd}x ${parsed.nome}`;
  const precoTxt = `R$${parsed.preco}`;
  const pad = cols - qtdNome.length - precoTxt.length;
  if (pad >= 1) {
    out.push(...txt(qtdNome + " ".repeat(pad) + precoTxt), LF);
  } else {
    for (const l of wrapLines(qtdNome, cols)) out.push(...txt(l), LF);
    out.push(...txt(precoTxt), LF);
  }
  for (const d of parsed.detalhes) {
    for (const l of wrapLines(d, Math.max(cols - 3, 8))) out.push(...txt("   " + l), LF);
  }
  return out;
}

function itemsSection(descricaoItens: string | null | undefined, cols: number, layout: LayoutOpt): number[] {
  const prefix = layout === "moderno" ? "› " : "";
  const linhas = (descricaoItens ?? "---").split("\n");
  const out: number[] = [];
  linhas.forEach((l, i) => {
    out.push(...itemBlock(l, cols, prefix));
    if (layout !== "compacto" && i < linhas.length - 1) out.push(LF);
  });
  return out;
}

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

function buildClassico(pedido: Pedido, empresaNome: string, W: number, bigW: number): number[] {
  const data  = new Date(pedido.created_at).toLocaleString("pt-BR");
  const total = pedido.valor_pedido + pedido.valor_motoboy;
  const pgto  = pedido.forma_pagamento
    ? (PGTO_LABELS[pedido.forma_pagamento] ?? pedido.forma_pagamento)
    : "---";

  return [
    ...CENTER, ...BIG, ...BOLD_ON,
    ...ln(empresaNome.toUpperCase().slice(0, bigW)),
    ...NORMAL, ...BOLD_OFF,
    ...ln(data),
    ...sep(),
    ...LEFT, ...BOLD_ON,
    ...ln("PEDIDO #" + pedido.id.slice(0, 8).toUpperCase()),
    ...BOLD_OFF,
    ...sep(),
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
    ...itemsSection(pedido.descricao_itens, W, "classico"),
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
  ];
}

function buildModerno(pedido: Pedido, empresaNome: string, W: number, bigW: number): number[] {
  const data  = new Date(pedido.created_at).toLocaleString("pt-BR");
  const total = pedido.valor_pedido + pedido.valor_motoboy;
  const pgto  = pedido.forma_pagamento
    ? (PGTO_LABELS[pedido.forma_pagamento] ?? pedido.forma_pagamento)
    : "---";
  const tipo = pedido.tipo_pedido === "retirada" ? "RETIRADA" : pedido.forma_pagamento === "ja_pago" ? "JA PAGO" : "DELIVERY";

  return [
    ...sep("="),
    ...CENTER, ...BIG, ...BOLD_ON,
    ...ln(empresaNome.toUpperCase().slice(0, bigW)),
    ...NORMAL, ...BOLD_OFF,
    ...ln(data),
    ...sep("="),
    ...BOLD_ON,
    ...ln(`[ ${tipo} ]`),
    ...BOLD_OFF,
    ...ln("PEDIDO #" + pedido.id.slice(0, 8).toUpperCase()),
    ...sep("="),
    ...LEFT, ...BOLD_ON,
    ...wrap("> " + pedido.cliente_nome, W),
    ...BOLD_OFF,
    ...(pedido.cliente_telefone ? wrap("Tel: " + pedido.cliente_telefone, W) : []),
    ...sep(),
    ...(pedido.tipo_pedido === "entrega"
      ? wrap("End: " + pedido.endereco_entrega + (pedido.bairro ? `, ${pedido.bairro}` : ""), W)
      : [...BOLD_ON, ...CENTER, ...ln("*** RETIRADA NO LOCAL ***"), ...LEFT, ...BOLD_OFF]),
    ...sep("="),
    ...BOLD_ON, ...ln("ITENS"), ...BOLD_OFF,
    ...itemsSection(pedido.descricao_itens, W, "moderno"),
    ...(pedido.observacoes ? [...sep(), ...BOLD_ON, ...ln("Obs:"), ...BOLD_OFF, ...wrap(pedido.observacoes, W)] : []),
    ...sep("="),
    ...row("Subtotal:", "R$ " + pedido.valor_pedido.toFixed(2).replace(".", ",")),
    ...(pedido.valor_motoboy > 0
      ? row("Entrega:", "R$ " + pedido.valor_motoboy.toFixed(2).replace(".", ","))
      : []),
    ...sep("="),
    ...CENTER, ...BIG, ...BOLD_ON,
    ...ln(`>> TOTAL: R$ ${total.toFixed(2).replace(".", ",")} <<`),
    ...NORMAL, ...BOLD_OFF,
    ...sep("="),
    ...LEFT,
    ...wrap("Pgto: " + pgto, W),
    ...(pedido.troco_para ? wrap("Troco p/ R$ " + pedido.troco_para.toFixed(2).replace(".", ","), W) : []),
    ...sep("="),
    ...CENTER,
    ...ln("appvellox.online"),
  ];
}

function buildCompacto(pedido: Pedido, empresaNome: string, W: number, bigW: number): number[] {
  const total = pedido.valor_pedido + pedido.valor_motoboy;
  const pgto  = pedido.forma_pagamento
    ? (PGTO_LABELS[pedido.forma_pagamento] ?? pedido.forma_pagamento)
    : "---";
  const dataC = new Date(pedido.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  const tipo  = pedido.tipo_pedido === "retirada" ? "[RETIRADA]" : pedido.forma_pagamento === "ja_pago" ? "[JA PAGO]" : "[DELIVERY]";

  return [
    ...CENTER, ...BIG, ...BOLD_ON,
    ...ln(empresaNome.toUpperCase().slice(0, bigW)),
    ...NORMAL, ...BOLD_OFF,
    ...ln(`${dataC} | #${pedido.id.slice(0, 8).toUpperCase()}`),
    ...sep(),
    ...LEFT, ...BOLD_ON,
    ...wrap(`${tipo} ${pedido.cliente_nome}`, W),
    ...BOLD_OFF,
    ...(pedido.cliente_telefone ? wrap(pedido.cliente_telefone, W) : []),
    ...(pedido.tipo_pedido === "entrega" ? wrap(pedido.endereco_entrega + (pedido.bairro ? `, ${pedido.bairro}` : ""), W) : []),
    ...sep(),
    ...itemsSection(pedido.descricao_itens, W, "compacto"),
    ...(pedido.observacoes ? wrap("Obs: " + pedido.observacoes, W) : []),
    ...sep(),
    ...wrap(`Sub: R$ ${pedido.valor_pedido.toFixed(2).replace(".", ",")}` + (pedido.valor_motoboy > 0 ? ` | Entr: R$ ${pedido.valor_motoboy.toFixed(2).replace(".", ",")}` : ""), W),
    ...BOLD_ON,
    ...ln(`TOTAL: R$ ${total.toFixed(2).replace(".", ",")}`),
    ...BOLD_OFF,
    ...wrap(`Pgto: ${pgto}` + (pedido.troco_para ? ` | Troco p/ R$ ${pedido.troco_para.toFixed(2).replace(".", ",")}` : ""), W),
    ...sep(),
    ...CENTER,
    ...ln("appvellox.online"),
  ];
}

export function buildReceipt(pedido: Pedido, empresaNome = "PEDIDO"): Uint8Array {
  const W    = getColumns();
  const bigW = Math.floor(W / 2); // colunas em double-width mode
  const layout = getLayout();

  const body = layout === "moderno" ? buildModerno(pedido, empresaNome, W, bigW)
    : layout === "compacto" ? buildCompacto(pedido, empresaNome, W, bigW)
    : buildClassico(pedido, empresaNome, W, bigW);

  const buf: number[] = [...INIT, ...body, LF, LF, ...CUT];
  return new Uint8Array(buf);
}
