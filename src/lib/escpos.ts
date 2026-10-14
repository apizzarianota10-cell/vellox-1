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
// mapeamento do servidor.ps1, aplicado uma vez depois do INIT.
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

// normal = Fonte A 1x; grande = Fonte B (9 pontos de largura) em 2x2 — letra
// mais alta e proporcional, sem esticar, com 2/3 das colunas; extra_grande =
// Fonte A 2x2. Altura dupla sozinha (GS ! 1) esticava a letra e ficava feia.
// `esp` = ESC 3 (espaço entre linhas) proporcional à altura da letra.
const FONTES: Record<FonteOpt, { fontB: number; gs: number; esp: number; cols: (base: number) => number }> = {
  normal:       { fontB: 0, gs: 0x00, esp: 0,  cols: b => b },
  grande:       { fontB: 1, gs: 0x11, esp: 44, cols: b => Math.floor(b * 2 / 3) },
  extra_grande: { fontB: 0, gs: 0x11, esp: 60, cols: b => b / 2 },
};

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

// Acento e pontuação tipográfica viram ASCII antes de ir pra impressora (mesma
// regra do servidor.ps1): a codepage da térmica varia e byte > 127 sai errado.
const ESPECIAIS: Record<string, string> = {
  "—": "-", "–": "-", "‘": "'", "’": "'", "“": '"', "”": '"',
  "…": "...", "·": ".", "•": "-", "º": "o", "ª": "a", "°": "o",
};
export function fold(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFD")) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x300 && code <= 0x36F) continue;
    out += code < 128 ? ch : (ESPECIAIS[ch] ?? "?");
  }
  return out;
}

function txt(s: string): number[] {
  const bytes: number[] = [];
  for (const ch of fold(s)) bytes.push(ch.charCodeAt(0));
  return bytes;
}

// Quebra texto em linhas de `cols` chars sem cortar palavra ao meio
// (só quebra uma palavra isoladamente se ela sozinha já for maior que `cols`)
function wrapLines(s: string, cols: number): string[] {
  const words = fold(s).split(" ").filter(w => w);
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
// reduzido quando a letra é mais larga), então nada passa da linha.
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
    const ok = opcoes.find(o => fold(o).length <= W);
    return ok !== undefined ? [...txt(ok), LF] : wrap(opcoes[opcoes.length - 1]);
  };
  const sep = (char = "-"): number[] => [...txt(char.repeat(W)), LF];
  // Separador com título centralizado: "------ ITENS ------".
  const titulo = (t: string, char = "-"): number[] => {
    const s = ` ${t} `;
    if (s.length >= W) return fit(t);
    const esq = Math.floor((W - s.length) / 2);
    return [...txt(char.repeat(esq) + s + char.repeat(W - s.length - esq)), LF];
  };
  // Valor à direita na última linha do rótulo; se não couber, sozinho embaixo.
  const row = (label: string, value: string): number[] => {
    const ls = wrapLines(label, W);
    value = fold(value);
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
    !b ? wrap(a) : fold(`${a} | ${b}`).length <= W ? [...txt(`${a} | ${b}`), LF] : [...wrap(a), ...wrap(b)];
  return { W, wrap, wrapPref, fit, sep, titulo, row, par };
}
type R = ReturnType<typeof makeR>;

export type ItemParsed = {
  qtd: string; nome: string; preco: string;
  detalhes: string[];   // variação e outros segmentos que não são sabor nem adicional
  sabores: string[];
  adicionais: string[];
  pizza: boolean;       // nome parece pizza → sabores em frações ("1/2 Calabresa")
};

// "/" só separa sabores quando colado em letra dos dois lados: "Frango c/
// Catupiry", "s/ cebola", "1/2" e "c/Catupiry" (abreviação de uma letra) ficam
// inteiros — o catálogo junta os sabores com "/" sem espaço.
export function splitSabores(seg: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (ch === "/") {
      const prev = seg[i - 1] ?? " ";
      const next = seg[i + 1] ?? " ";
      const abrev = /[A-Za-z]/.test(prev) && (i < 2 || /\s/.test(seg[i - 2]));
      const corta = !/\s/.test(prev) && !/\s/.test(next) && !(/\d/.test(prev) && /\d/.test(next)) && !abrev;
      if (corta) { out.push(cur); cur = ""; continue; }
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}

// O bloco de detalhes é o ÚLTIMO "(...)" da linha, casado parêntese a
// parêntese — assim "Pizza (G) (Grande · Calabresa/Mussarela)" mantém o "(G)"
// no nome e um sabor "Calabresa (sem cebola)" não quebra nada.
function separaDetalhes(nomeCompleto: string): [string, string] {
  if (!nomeCompleto.endsWith(")")) return [nomeCompleto, ""];
  let depth = 0;
  for (let i = nomeCompleto.length - 1; i >= 0; i--) {
    const ch = nomeCompleto[i];
    if (ch === ")") depth++;
    else if (ch === "(") {
      depth--;
      if (depth === 0) {
        if (i > 0 && nomeCompleto[i - 1] === " ") return [nomeCompleto.slice(0, i).trimEnd(), nomeCompleto.slice(i + 1, -1)];
        break;
      }
    }
  }
  return [nomeCompleto, ""];
}

// O tamanho (variação) já está no nome do produto? "Pizza Grande"+"Grande" ou
// "Pizza G"/"Pizza (G)"+"Grande" — aí a linha do tamanho só repete o nome. Se
// o nome não diz o tamanho ("Pizza"+"Grande"), a linha continua (a cozinha
// precisa dela).
function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
export function detalheRepeteNome(detalhe: string, nome: string): boolean {
  const d = semAcento(detalhe).trim();
  const n = semAcento(nome);
  if (!d) return true;
  const tokens = n.split(/[^a-z0-9]+/).filter(Boolean);
  if (` ${tokens.join(" ")} `.includes(` ${d.split(/[^a-z0-9]+/).filter(Boolean).join(" ")} `)) return true;
  return !/\s/.test(d) && tokens.some(t => t.length === 1 && t === d[0]);
}

// Reconhece uma linha de item no formato "Nx Nome (variação · Sabor1/Sabor2 ·
// + adicional, adicional) — R$valor" (é assim que o catálogo e o pedido manual
// montam `descricao_itens`; cada parte do parêntese é opcional). Com variação
// e sabores, os sabores são o 2º segmento que não começa com "+ "; sozinho, só
// é sabor se tiver "/" (um segmento único sem "/" pode ser só a variação).
// Itens fora desse formato (texto livre, pedidos colados) caem no fallback.
export function parseItemLine(line: string): ItemParsed | null {
  const m = line.trim().match(/^(\d+)\s*x\s+(.+?)\s+—\s+R\$\s*([\d.,]+)$/);
  if (!m) return null;
  const [, qtd, nomeCompleto, preco] = m;
  const [nome, detalhesRaw] = separaDetalhes(nomeCompleto);
  const segs = detalhesRaw ? detalhesRaw.split(" · ").map(s => s.trim()).filter(Boolean) : [];
  const adicionais: string[] = [];
  const outros: string[] = [];
  for (const s of segs) {
    if (s.startsWith("+ ")) adicionais.push(...s.slice(2).split(", ").map(a => a.trim()).filter(Boolean));
    else outros.push(s);
  }
  let sabores: string[] = [];
  let detalhes = outros;
  if (outros.length >= 2) {
    sabores = splitSabores(outros[1]);
    detalhes = [outros[0], ...outros.slice(2)];
  } else if (outros.length === 1) {
    const partes = splitSabores(outros[0]);
    if (partes.length >= 2) { sabores = partes; detalhes = []; }
  }
  detalhes = detalhes.filter(d => !detalheRepeteNome(d, nome));
  return { qtd, nome, preco, detalhes, sabores, adicionais, pizza: /pizza|brotinho/i.test(nome) };
}

// Título do bloco de sabores e marcador de cada linha — o pizzaiolo lê
// "MEIO A MEIO: 1/2 Calabresa / 1/2 Mussarela" de relance.
export function tituloSabores(p: ItemParsed): string {
  const n = p.sabores.length;
  return n === 1 ? "SABOR:" : p.pizza && n === 2 ? "MEIO A MEIO:" : `${n} SABORES:`;
}
export function marcaSabor(p: ItemParsed, i: number): string {
  const n = p.sabores.length;
  return n === 1 ? "- " : p.pizza ? `1/${n} ` : `${i + 1}. `;
}

// Cada item vira um bloco próprio: nome+preço, variação recuada, bloco de
// sabores com título, adicionais um por linha com "+ " — tudo no mesmo tamanho.
function itemBlock(r: R, line: string): number[] {
  const p = parseItemLine(line);
  if (!p) return r.wrap(line || " ");

  const out: number[] = [...r.row(`${p.qtd}x ${p.nome}`, `R$${p.preco}`)];
  for (const d of p.detalhes) out.push(...r.wrapPref(d, "  ", "  "));
  if (p.sabores.length) {
    out.push(...r.wrapPref(tituloSabores(p), "  ", "  "));
    p.sabores.forEach((s, i) => {
      const pref = "  " + marcaSabor(p, i);
      out.push(...r.wrapPref(s, pref, " ".repeat(pref.length)));
    });
  }
  for (const a of p.adicionais) out.push(...r.wrapPref(a, "  + ", "    "));
  return out;
}

function itemsSection(r: R, descricaoItens: string | null | undefined, layout: LayoutOpt): number[] {
  const linhas = (descricaoItens ?? "---").split("\n").map(l => l.trim()).filter(Boolean);
  const out: number[] = [];
  linhas.forEach((l, i) => {
    out.push(...itemBlock(r, l));
    if (layout !== "compacto" && i < linhas.length - 1) out.push(LF);
  });
  return out;
}

const PGTO_LABELS: Record<string, string> = {
  dinheiro:      "Dinheiro",
  cartao_credito:"Cartao de Credito",
  cartao_debito: "Cartao de Debito",
  pix:           "PIX",
  ja_pago:       "Ja pago",
};

const rs = (v: number) => "R$ " + v.toFixed(2).replace(".", ",");
const dataCurta = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");
const totalOpcoes = (total: number) => [`TOTAL: ${rs(total)}`, `TOTAL ${rs(total).replace(" ", "")}`];

type Comum = { total: number; pgto: string; tipo: string; loja: string; numero: string; endereco: string; troco: string };
function comum(pedido: Pedido, empresaNome: string): Comum {
  return {
    total:    pedido.valor_pedido + pedido.valor_motoboy,
    pgto:     pedido.forma_pagamento ? (PGTO_LABELS[pedido.forma_pagamento] ?? pedido.forma_pagamento) : "---",
    // Mesma prioridade do cupom HTML: retirada vence, depois já pago, senão delivery.
    tipo:     pedido.tipo_pedido === "retirada" ? "RETIRADA" : pedido.forma_pagamento === "ja_pago" ? "JA PAGO" : "DELIVERY",
    loja:     (empresaNome || "PEDIDO").toUpperCase(),
    numero:   "PEDIDO #" + pedido.id.slice(0, 8).toUpperCase(),
    endereco: pedido.endereco_entrega + (pedido.bairro ? `, ${pedido.bairro}` : ""),
    troco:    pedido.troco_para ? `Troco p/ ${rs(pedido.troco_para)}` : "",
  };
}

const retiradaCentro = (r: R) => [...CENTER, ...r.fit("*** RETIRADA NO LOCAL ***", "RETIRADA NO LOCAL"), ...LEFT];

function buildClassico(r: R, pedido: Pedido, c: Comum): number[] {
  const headerText = pedido.forma_pagamento === "ja_pago" ? "* JA PAGO *" : pedido.tipo_pedido === "retirada" ? "-- RETIRADA --" : "- DELIVERY -";
  return [
    ...CENTER,
    ...r.wrap(c.loja),
    ...r.wrap(dataCurta(pedido.created_at)),
    ...r.sep("="),
    ...r.fit(headerText),
    ...r.fit(c.numero),
    ...LEFT,
    ...r.sep("="),
    ...r.wrap("Cliente: " + pedido.cliente_nome),
    ...(pedido.cliente_telefone ? r.wrap("Tel: " + pedido.cliente_telefone) : []),
    ...(pedido.tipo_pedido === "entrega"
      ? [...r.wrap("End: " + pedido.endereco_entrega), ...(pedido.bairro ? r.wrap("Bairro: " + pedido.bairro) : [])]
      : retiradaCentro(r)),
    ...r.titulo("ITENS", "-"),
    ...itemsSection(r, pedido.descricao_itens, "classico"),
    ...(pedido.observacoes ? [...r.sep("-"), ...r.wrap("Obs: " + pedido.observacoes)] : []),
    ...r.sep("="),
    ...r.row("Subtotal:", rs(pedido.valor_pedido)),
    ...(pedido.valor_motoboy > 0 ? r.row("Entrega:", rs(pedido.valor_motoboy)) : []),
    ...r.row("TOTAL:", rs(c.total)),
    ...r.sep("="),
    ...r.wrap("Pgto: " + c.pgto),
    ...(c.troco ? r.wrap(c.troco) : []),
    ...r.sep("="),
    ...CENTER,
    ...r.fit("appvellox.online"),
  ];
}

function buildModerno(r: R, pedido: Pedido, c: Comum): number[] {
  return [
    ...r.sep("="),
    ...CENTER,
    ...r.wrap(c.loja),
    ...r.wrap(dataCurta(pedido.created_at)),
    ...r.sep("="),
    ...r.fit(`[ ${c.tipo} ]`),
    ...r.fit(c.numero),
    ...LEFT,
    ...r.sep("="),
    ...r.wrap("> " + pedido.cliente_nome),
    ...(pedido.cliente_telefone ? r.wrap("Tel: " + pedido.cliente_telefone) : []),
    ...r.sep("-"),
    ...(pedido.tipo_pedido === "entrega"
      ? [...r.wrap("End: " + pedido.endereco_entrega), ...(pedido.bairro ? r.wrap("Bairro: " + pedido.bairro) : [])]
      : retiradaCentro(r)),
    ...r.titulo("ITENS", "="),
    ...itemsSection(r, pedido.descricao_itens, "moderno"),
    ...(pedido.observacoes ? [...r.sep("-"), ...r.wrap("Obs: " + pedido.observacoes)] : []),
    ...r.sep("="),
    ...r.row("Subtotal:", rs(pedido.valor_pedido)),
    ...(pedido.valor_motoboy > 0 ? r.row("Entrega:", rs(pedido.valor_motoboy)) : []),
    ...r.sep("="),
    ...CENTER,
    ...r.fit(`>> TOTAL: ${rs(c.total)} <<`, ...totalOpcoes(c.total)),
    ...LEFT,
    ...r.sep("="),
    ...r.wrap("Pgto: " + c.pgto),
    ...(c.troco ? r.wrap(c.troco) : []),
    ...r.sep("="),
    ...CENTER,
    ...r.fit("appvellox.online"),
  ];
}

function buildCompacto(r: R, pedido: Pedido, c: Comum): number[] {
  return [
    ...CENTER,
    ...r.wrap(c.loja),
    ...r.par(dataCurta(pedido.created_at), `#${pedido.id.slice(0, 8).toUpperCase()}`),
    ...LEFT,
    ...r.sep("-"),
    ...r.wrap(`[${c.tipo}] ${pedido.cliente_nome}`),
    ...(pedido.cliente_telefone ? r.wrap(pedido.cliente_telefone) : []),
    ...(pedido.tipo_pedido === "entrega" ? r.wrap(c.endereco) : []),
    ...r.sep("-"),
    ...itemsSection(r, pedido.descricao_itens, "compacto"),
    ...(pedido.observacoes ? r.wrap("Obs: " + pedido.observacoes) : []),
    ...r.sep("-"),
    ...r.par(`Sub: ${rs(pedido.valor_pedido)}`, pedido.valor_motoboy > 0 ? `Entr: ${rs(pedido.valor_motoboy)}` : undefined),
    ...r.fit(...totalOpcoes(c.total)),
    ...r.par(`Pgto: ${c.pgto}`, c.troco || undefined),
    ...r.sep("-"),
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
  const f      = FONTES[fonte];
  const r      = makeR(f.cols(getBaseColumns()));
  const layout = layoutOverride ?? getLayout();
  const c      = comum(pedido, empresaNome);

  const body = layout === "moderno" ? buildModerno(r, pedido, c)
    : layout === "compacto" ? buildCompacto(r, pedido, c)
    : buildClassico(r, pedido, c);

  // ESC @ zera fonte/tamanho — tudo vem logo depois, uma vez só pro cupom todo,
  // em negrito (Fonte A sem ênfase sai clara/fina na térmica).
  const buf: number[] = [
    ...INIT, ESC, 0x4D, f.fontB, GS, 0x21, f.gs, ...(f.esp ? [ESC, 0x33, f.esp] : []),
    ...BOLD_ON, ...body, ...BOLD_OFF, LF, LF, ...CUT,
  ];
  return new Uint8Array(buf);
}
