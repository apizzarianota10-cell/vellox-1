import type { Pedido } from "@/types";

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const INIT      = [ESC, 0x40];
const CENTER    = [ESC, 0x61, 0x01];
const LEFT      = [ESC, 0x61, 0x00];
const BOLD_ON   = [ESC, 0x45, 0x01];
const BOLD_OFF  = [ESC, 0x45, 0x00];
const CUT       = [GS,  0x56, 0x41, 0x03];

type LayoutOpt = "classico" | "moderno" | "compacto";

// Tamanho da letra do cupom inteiro (configuracoes_print_agent.fonte) — mesmo
// mapeamento do servidor.ps1: um GS ! só, aplicado uma vez depois do INIT.
export type FonteOpt = "normal" | "grande" | "extra_grande";
const FONTE_KEY = "vellox-receipt-fonte";

export function isFonteOpt(v: unknown): v is FonteOpt {
  return v === "normal" || v === "grande" || v === "extra_grande";
}

export function getSavedFonte(): FonteOpt {
  try {
    const v = localStorage.getItem(FONTE_KEY);
    if (isFonteOpt(v)) return v;
  } catch {}
  return "grande";
}

export function saveFonte(f: FonteOpt): void {
  try { localStorage.setItem(FONTE_KEY, f); } catch {}
}

const GS_TAMANHO: Record<FonteOpt, number> = { normal: 0x00, grande: 0x01, extra_grande: 0x11 };

function getBaseColumns(): number {
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

// Quebra texto em linhas de `cols` chars sem cortar palavra ao meio
// (só quebra uma palavra isoladamente se ela sozinha já for maior que `cols`)
function wrapLines(s: string, cols: number): string[] {
  const words = s.split(" ").filter(w => w);
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

// Todas as linhas do cupom passam por aqui com a largura efetiva (W já
// dividido quando a letra é 2x de largura), então nada passa da linha.
function makeR(W: number) {
  const wrap = (s: string): number[] => {
    const out: number[] = [];
    for (const l of wrapLines(s, W)) out.push(...txt(l), LF);
    return out;
  };
  const wrapPref = (s: string, pref: string, cont: string): number[] => {
    const out: number[] = [];
    wrapLines(s, Math.max(W - pref.length, 4)).forEach((l, i) => out.push(...txt((i === 0 ? pref : cont) + l), LF));
    return out;
  };
  // Primeira variante que cabe inteira numa linha; senão quebra a última.
  const fit = (...opcoes: string[]): number[] => {
    const ok = opcoes.find(o => o.length <= W);
    return ok !== undefined ? [...txt(ok), LF] : wrap(opcoes[opcoes.length - 1]);
  };
  const sep = (char = "-"): number[] => [...txt(char.repeat(W)), LF];
  // Valor à direita na última linha do rótulo; se não couber, sozinho embaixo.
  const row = (label: string, value: string): number[] => {
    const ls = wrapLines(label, W);
    const out: number[] = [];
    ls.slice(0, -1).forEach(l => out.push(...txt(l), LF));
    const ult = ls[ls.length - 1];
    const sp = W - ult.length - value.length;
    if (sp >= 1) return [...out, ...txt(ult + " ".repeat(sp) + value), LF];
    out.push(...txt(ult), LF);
    return value.length <= W ? [...out, ...txt(" ".repeat(W - value.length) + value), LF] : [...out, ...wrap(value)];
  };
  // Duas partes juntas com " | " se couber, senão uma por linha.
  const par = (a: string, b?: string): number[] =>
    !b ? wrap(a) : `${a} | ${b}`.length <= W ? [...txt(`${a} | ${b}`), LF] : [...wrap(a), ...wrap(b)];
  return { W, wrap, wrapPref, fit, sep, row, par };
}
type R = ReturnType<typeof makeR>;

export type ItemDetalhe = { texto: string; sabor: boolean };
export type ItemParsed = { qtd: string; nome: string; detalhes: ItemDetalhe[]; preco: string };

// Identifica qual segmento do parêntese é o de sabores. O catálogo e o pedido
// manual montam "variação · Sabor1/Sabor2 · + adicional, adicional" (nessa
// ordem, cada parte opcional), então: com variação + sabores, os sabores são o
// 2º segmento que não começa com "+ "; sozinho, só dá pra afirmar que é sabor
// se tiver "/" (um único segmento sem "/" pode ser só a variação).
function indiceSabores(segs: string[]): number {
  const naoAdicionais = segs.map((s, i) => (s.startsWith("+ ") ? -1 : i)).filter(i => i >= 0);
  if (naoAdicionais.length >= 2) return naoAdicionais[1];
  if (naoAdicionais.length === 1) {
    const partes = segs[naoAdicionais[0]].split("/").map(s => s.trim());
    if (partes.length >= 2 && partes.every(s => s && !/^\d+$/.test(s))) return naoAdicionais[0];
  }
  return -1;
}

// Reconhece uma linha de item no formato "Nx Nome (detalhe · detalhe) — R$valor"
// (é assim que o catálogo e o pedido manual montam `descricao_itens`).
// Itens fora desse formato (texto livre, pedidos colados) caem no fallback.
export function parseItemLine(line: string): ItemParsed | null {
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
  const segs = detalhesRaw ? detalhesRaw.split(" · ") : [];
  const iSab = indiceSabores(segs);
  const detalhes: ItemDetalhe[] = [];
  segs.forEach((s, i) => {
    if (i === iSab) {
      for (const sab of s.split("/")) if (sab.trim()) detalhes.push({ texto: sab.trim(), sabor: true });
    } else {
      detalhes.push({ texto: s, sabor: false });
    }
  });
  return { qtd, nome, detalhes, preco };
}

// Cada item vira um bloco próprio: nome+preço, cada sabor numa linha própria
// (" - Sabor") e variação/adicionais recuados embaixo — tudo no mesmo tamanho.
function itemBlock(r: R, line: string, prefix: string): number[] {
  const parsed = parseItemLine(line);
  if (!parsed) return r.wrap(prefix + (line || " "));

  const out: number[] = [...r.row(`${prefix}${parsed.qtd}x ${parsed.nome}`, `R$${parsed.preco}`)];
  // 2+ sabores numerados, continuação recuada sob o texto — uma quebra de
  // linha nunca parece outro sabor.
  const multi = parsed.detalhes.filter(d => d.sabor).length >= 2;
  let n = 0;
  for (const d of parsed.detalhes) {
    if (!d.sabor) { out.push(...r.wrapPref(d.texto, "   ", "   ")); continue; }
    const pref = multi ? `${++n}. ` : " - ";
    out.push(...r.wrapPref(d.texto, pref, " ".repeat(pref.length)));
  }
  return out;
}

function itemsSection(r: R, descricaoItens: string | null | undefined, layout: LayoutOpt): number[] {
  const prefix = layout === "moderno" ? "- " : "";
  const linhas = (descricaoItens ?? "---").split("\n");
  const out: number[] = [];
  linhas.forEach((l, i) => {
    out.push(...itemBlock(r, l, prefix));
    if (layout !== "compacto" && i < linhas.length - 1) out.push(LF);
  });
  return out;
}

const PGTO_LABELS: Record<string, string> = {
  dinheiro:      "Dinheiro",
  cartao_credito:"Cartao Credito",
  cartao_debito: "Cartao Debito",
  pix:           "PIX",
  ja_pago:       "Ja pago",
};

const rs = (v: number) => "R$ " + v.toFixed(2).replace(".", ",");
const dataCurta = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");
const totalOpcoes = (total: number) => [`TOTAL: ${rs(total)}`, `TOTAL ${rs(total).replace(" ", "")}`];

function buildClassico(r: R, pedido: Pedido, empresaNome: string): number[] {
  const total = pedido.valor_pedido + pedido.valor_motoboy;
  const pgto  = pedido.forma_pagamento
    ? (PGTO_LABELS[pedido.forma_pagamento] ?? pedido.forma_pagamento)
    : "---";

  return [
    ...CENTER, ...BOLD_ON,
    ...r.wrap(empresaNome.toUpperCase()),
    ...BOLD_OFF,
    ...r.wrap(dataCurta(pedido.created_at)),
    ...r.sep(),
    ...LEFT, ...BOLD_ON,
    ...r.fit("PEDIDO #" + pedido.id.slice(0, 8).toUpperCase()),
    ...BOLD_OFF,
    ...r.sep(),
    ...BOLD_ON, ...r.wrap("CLIENTE: " + pedido.cliente_nome), ...BOLD_OFF,
    ...(pedido.cliente_telefone ? r.wrap("TEL: " + pedido.cliente_telefone) : []),
    ...r.sep(),
    ...BOLD_ON,
    ...r.fit(pedido.tipo_pedido === "entrega" ? "** DELIVERY **" : "** RETIRADA **"),
    ...BOLD_OFF,
    ...(pedido.tipo_pedido === "entrega"
      ? [
          ...r.wrap("END: " + pedido.endereco_entrega),
          ...(pedido.bairro ? r.wrap("BAI: " + pedido.bairro) : []),
        ]
      : []),
    ...r.sep(),
    ...BOLD_ON, ...r.fit("ITENS:"), ...BOLD_OFF,
    ...itemsSection(r, pedido.descricao_itens, "classico"),
    ...(pedido.observacoes ? r.wrap("OBS: " + pedido.observacoes) : []),
    ...r.sep(),
    ...r.row("Subtotal:", rs(pedido.valor_pedido)),
    ...(pedido.valor_motoboy > 0 ? r.row("Entrega:", rs(pedido.valor_motoboy)) : []),
    ...BOLD_ON,
    ...r.row("TOTAL:", rs(total)),
    ...BOLD_OFF,
    ...r.sep(),
    ...BOLD_ON, ...r.wrap("PGTO: " + pgto), ...BOLD_OFF,
    ...(pedido.troco_para ? r.wrap("Troco p/ " + rs(pedido.troco_para)) : []),
    ...r.sep(),
    ...CENTER,
    ...r.fit("Vellox - appvellox.online", "appvellox.online"),
  ];
}

function buildModerno(r: R, pedido: Pedido, empresaNome: string): number[] {
  const total = pedido.valor_pedido + pedido.valor_motoboy;
  const pgto  = pedido.forma_pagamento
    ? (PGTO_LABELS[pedido.forma_pagamento] ?? pedido.forma_pagamento)
    : "---";
  const tipo = pedido.tipo_pedido === "retirada" ? "RETIRADA" : pedido.forma_pagamento === "ja_pago" ? "JA PAGO" : "DELIVERY";

  return [
    ...r.sep("="),
    ...CENTER, ...BOLD_ON,
    ...r.wrap(empresaNome.toUpperCase()),
    ...BOLD_OFF,
    ...r.wrap(dataCurta(pedido.created_at)),
    ...r.sep("="),
    ...BOLD_ON,
    ...r.fit(`[ ${tipo} ]`),
    ...BOLD_OFF,
    ...r.fit("PEDIDO #" + pedido.id.slice(0, 8).toUpperCase()),
    ...r.sep("="),
    ...LEFT, ...BOLD_ON,
    ...r.wrap("> " + pedido.cliente_nome),
    ...BOLD_OFF,
    ...(pedido.cliente_telefone ? r.wrap("Tel: " + pedido.cliente_telefone) : []),
    ...r.sep(),
    ...(pedido.tipo_pedido === "entrega"
      ? r.wrap("End: " + pedido.endereco_entrega + (pedido.bairro ? `, ${pedido.bairro}` : ""))
      : [...BOLD_ON, ...CENTER, ...r.fit("*** RETIRADA NO LOCAL ***", "RETIRADA NO LOCAL"), ...LEFT, ...BOLD_OFF]),
    ...r.sep("="),
    ...BOLD_ON, ...r.fit("ITENS"), ...BOLD_OFF,
    ...itemsSection(r, pedido.descricao_itens, "moderno"),
    ...(pedido.observacoes ? [...r.sep(), ...BOLD_ON, ...r.fit("Obs:"), ...BOLD_OFF, ...r.wrap(pedido.observacoes)] : []),
    ...r.sep("="),
    ...r.row("Subtotal:", rs(pedido.valor_pedido)),
    ...(pedido.valor_motoboy > 0 ? r.row("Entrega:", rs(pedido.valor_motoboy)) : []),
    ...r.sep("="),
    ...CENTER, ...BOLD_ON,
    ...r.fit(`>> TOTAL: ${rs(total)} <<`, ...totalOpcoes(total)),
    ...BOLD_OFF,
    ...r.sep("="),
    ...LEFT,
    ...r.wrap("Pgto: " + pgto),
    ...(pedido.troco_para ? r.wrap("Troco p/ " + rs(pedido.troco_para)) : []),
    ...r.sep("="),
    ...CENTER,
    ...r.fit("appvellox.online"),
  ];
}

function buildCompacto(r: R, pedido: Pedido, empresaNome: string): number[] {
  const total = pedido.valor_pedido + pedido.valor_motoboy;
  const pgto  = pedido.forma_pagamento
    ? (PGTO_LABELS[pedido.forma_pagamento] ?? pedido.forma_pagamento)
    : "---";
  const tipo  = pedido.tipo_pedido === "retirada" ? "[RETIRADA]" : pedido.forma_pagamento === "ja_pago" ? "[JA PAGO]" : "[DELIVERY]";

  return [
    ...CENTER, ...BOLD_ON,
    ...r.wrap(empresaNome.toUpperCase()),
    ...BOLD_OFF,
    ...r.par(dataCurta(pedido.created_at), `#${pedido.id.slice(0, 8).toUpperCase()}`),
    ...r.sep(),
    ...LEFT, ...BOLD_ON,
    ...r.wrap(`${tipo} ${pedido.cliente_nome}`),
    ...BOLD_OFF,
    ...(pedido.cliente_telefone ? r.wrap(pedido.cliente_telefone) : []),
    ...(pedido.tipo_pedido === "entrega" ? r.wrap(pedido.endereco_entrega + (pedido.bairro ? `, ${pedido.bairro}` : "")) : []),
    ...r.sep(),
    ...itemsSection(r, pedido.descricao_itens, "compacto"),
    ...(pedido.observacoes ? r.wrap("Obs: " + pedido.observacoes) : []),
    ...r.sep(),
    ...r.par(`Sub: ${rs(pedido.valor_pedido)}`, pedido.valor_motoboy > 0 ? `Entr: ${rs(pedido.valor_motoboy)}` : undefined),
    ...BOLD_ON,
    ...r.fit(...totalOpcoes(total)),
    ...BOLD_OFF,
    ...r.par(`Pgto: ${pgto}`, pedido.troco_para ? `Troco p/ ${rs(pedido.troco_para)}` : undefined),
    ...r.sep(),
    ...CENTER,
    ...r.fit("appvellox.online"),
  ];
}

export function buildReceipt(
  pedido: Pedido,
  empresaNome = "PEDIDO",
  layoutOverride?: LayoutOpt,
  fonteOverride?: FonteOpt,
): Uint8Array {
  const fonte  = fonteOverride ?? getSavedFonte();
  const W      = fonte === "extra_grande" ? getBaseColumns() / 2 : getBaseColumns();
  const r      = makeR(W);
  const layout = layoutOverride ?? getLayout();

  const body = layout === "moderno" ? buildModerno(r, pedido, empresaNome)
    : layout === "compacto" ? buildCompacto(r, pedido, empresaNome)
    : buildClassico(r, pedido, empresaNome);

  // ESC @ zera o GS ! — o tamanho vem logo depois, uma vez só pro cupom todo.
  const buf: number[] = [...INIT, GS, 0x21, GS_TAMANHO[fonte], ...body, LF, LF, ...CUT];
  return new Uint8Array(buf);
}
