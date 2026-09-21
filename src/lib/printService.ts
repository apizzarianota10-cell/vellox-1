import type { Pedido } from "@/types";
import { buildReceipt } from "@/lib/escpos";
import { printViaUsb, getSavedPrinterName } from "@/lib/usbPrinter";

const PRINTED_KEY    = "vellox-printed-orders";
const MAX_TRACKED    = 300;
const PAPER_SIZE_KEY = "vellox-paper-size";
const FONT_SIZE_KEY  = "vellox-font-size";

export type PaperSize  = "58mm" | "80mm";
export type FontSizeOpt = "p" | "m" | "g" | "xg";

export function getSavedPaperSize(): PaperSize {
  try {
    const v = localStorage.getItem(PAPER_SIZE_KEY);
    if (v === "58mm" || v === "80mm") return v;
  } catch {}
  return "80mm";
}

export function savePaperSize(size: PaperSize): void {
  try { localStorage.setItem(PAPER_SIZE_KEY, size); } catch {}
}

export function getSavedFontSize(): FontSizeOpt {
  try {
    const v = localStorage.getItem(FONT_SIZE_KEY);
    if (v === "p" || v === "m" || v === "g" || v === "xg") return v;
  } catch {}
  return "m";
}

export function saveFontSize(size: FontSizeOpt): void {
  try { localStorage.setItem(FONT_SIZE_KEY, size); } catch {}
}

const FONT_SCALE: Record<FontSizeOpt, number> = { p: 0.82, m: 1, g: 1.18, xg: 1.35 };

const LAYOUT_KEY = "vellox-receipt-layout";
const LOGO_KEY   = "vellox-receipt-logo";

export type LayoutOpt = "classico" | "moderno" | "compacto";

export function getSavedLayout(): LayoutOpt {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    if (v === "classico" || v === "moderno" || v === "compacto") return v;
  } catch {}
  return "classico";
}
export function saveLayout(l: LayoutOpt): void {
  try { localStorage.setItem(LAYOUT_KEY, l); } catch {}
}
export function getSavedLogo(): string {
  try { return localStorage.getItem(LOGO_KEY) ?? ""; } catch { return ""; }
}
export function saveLogo(url: string): void {
  try { localStorage.setItem(LOGO_KEY, url); } catch {}
}

// Pedido fictício usado pelo "Imprimir cupom de teste" (configurações e
// popup de novidades) — mesmo formato em ambos os lugares.
export function buildTestPedido(empresaId: string): Pedido {
  return {
    id:               "00000000-0000-0000-0000-000000000001",
    empresa_id:       empresaId,
    loja_id:          null, motoboy_id: null, route_id: null, route_address: null,
    tipo_pedido:      "entrega",
    cliente_nome:     "João da Silva (TESTE)",
    cliente_telefone: "(11) 99999-9999",
    endereco_entrega: "Rua Exemplo, 123 — Centro",
    endereco_lat:     null, endereco_lng: null,
    descricao_itens:  "1x Pizza Margherita\n1x Coca-Cola 2L",
    valor_pedido:     44.90, valor_motoboy: 5.00,
    forma_pagamento:  "pix", troco_para: null,
    status:           "em_fila",
    observacoes:      "Cupom de teste — Vellox",
    bairro:           "Centro", distancia_km: null,
    origem:           "manual", tracking_token: null,
    created_at:       new Date().toISOString(),
    updated_at:       new Date().toISOString(),
    printed_at:       null, print_count: 0, auto_printed: false,
  };
}

function getTracked(): Set<string> {
  try {
    const raw = localStorage.getItem(PRINTED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

function trackPrinted(id: string) {
  try {
    const ids = [...getTracked(), id].slice(-MAX_TRACKED);
    localStorage.setItem(PRINTED_KEY, JSON.stringify(ids));
  } catch {}
}

const PGTO_LABELS: Record<string, string> = {
  dinheiro:       "Dinheiro",
  cartao_credito: "Cartão de Crédito",
  cartao_debito:  "Cartão de Débito",
  pix:            "PIX",
  ja_pago:        "Já pago",
};

// Reconhece uma linha de item no formato "Nx Nome (detalhe · detalhe) — R$valor"
// (é assim que o catálogo e o pedido manual montam `descricao_itens`).
// Itens fora desse formato (texto livre, pedidos colados) caem no fallback de cada layout.
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

type ItemParsed = { qtd: string; nome: string; detalhes: string[]; preco: string };

// Monta os itens como blocos independentes (nome+preço / detalhes / divisor),
// para não ficar um produto colado no outro.
function buildItensBlocks(
  descricaoItens: string | null | undefined,
  render: (p: ItemParsed) => string,
  fallback: (line: string) => string,
  divider: string,
): string {
  const linhas = (descricaoItens ?? "—").split("\n");
  return linhas
    .map((l, i) => {
      const parsed = parseItemLine(l);
      const block = parsed ? render(parsed) : fallback(l || "&nbsp;");
      return i < linhas.length - 1 ? block + divider : block;
    })
    .join("");
}

function borderStyle(pedido: Pedido): { borderCss: string; headerText: string; headerBg: string } {
  if (pedido.forma_pagamento === "ja_pago") {
    return { borderCss: "3px double #000", headerText: "★ JÁ PAGO ★", headerBg: "rgba(34,197,94,0.06)" };
  }
  if (pedido.tipo_pedido === "retirada") {
    return { borderCss: "2px solid #000", headerText: "— RETIRADA —", headerBg: "rgba(96,165,250,0.06)" };
  }
  return { borderCss: "2px dashed #000", headerText: "- DELIVERY -", headerBg: "rgba(228,0,43,0.04)" };
}

export function formatReceipt(
  pedido: Pedido,
  empresaNome = "PEDIDO",
  paperSize: PaperSize = "80mm",
  fontSizeOpt: FontSizeOpt = "m",
  layout: LayoutOpt = "classico",
  logoUrl = "",
): string {
  const data  = new Date(pedido.created_at).toLocaleString("pt-BR");
  const total = pedido.valor_pedido + pedido.valor_motoboy;
  const pgto  = pedido.forma_pagamento ? (PGTO_LABELS[pedido.forma_pagamento] ?? pedido.forma_pagamento) : "—";
  const { borderCss, headerText } = borderStyle(pedido);

  const is58  = paperSize === "58mm";
  const bodyW = is58 ? 195 : 265;
  const scale = FONT_SCALE[fontSizeOpt] ?? 1;
  const fs    = Math.round((is58 ? 10 : 12) * scale);
  const fsBig = Math.round((is58 ? 12 : 14) * scale);

  const W    = `width:100%;display:block;word-break:break-all;overflow-wrap:anywhere;`;
  const CTR  = `${W}text-align:center;`;
  const LFT  = `${W}text-align:left;`;
  const CTRB = `${CTR}font-size:${fsBig}px;font-weight:900;`;
  const VAL  = `${LFT}font-size:${fs}px;font-weight:700;`;
  const LBL  = `${LFT}font-size:${fs - 1}px;font-weight:900;text-transform:uppercase;margin:3px 0 1px;`;

  const priceRow = (label: string, valor: string) =>
    `<div style="${W}display:flex;justify-content:space-between;font-size:${fs}px;font-weight:700;margin:1px 0"><span>${label}</span><span>${valor}</span></div>`;

  const logoImg = logoUrl
    ? `<div style="${CTR}margin-bottom:4px"><img src="${logoUrl}" style="max-width:${Math.round(bodyW * 0.65)}px;max-height:64px;object-fit:contain;" /></div>`
    : "";

  const itemDetailStyle = `${LFT}font-size:${fs - 1}px;font-weight:700;padding-left:12px;`;

  const itensClassico = buildItensBlocks(
    pedido.descricao_itens,
    p => `
<div style="${W}display:flex;justify-content:space-between;gap:6px;font-size:${fsBig}px;font-weight:900;"><span>${p.qtd}x ${p.nome}</span><span>R$${p.preco}</span></div>
${p.detalhes.map(d => `<div style="${itemDetailStyle}">${d}</div>`).join("")}`,
    line => `<div style="${VAL}">${line}</div>`,
    `<div style="border-top:1px dotted #000;margin:4px 0;"></div>`,
  );

  const itensModerno = buildItensBlocks(
    pedido.descricao_itens,
    p => `
<div style="${W}display:flex;justify-content:space-between;gap:6px;font-size:${fsBig}px;font-weight:900;"><span>› ${p.qtd}x ${p.nome}</span><span>R$${p.preco}</span></div>
${p.detalhes.map(d => `<div style="${itemDetailStyle}">${d}</div>`).join("")}`,
    line => `<div style="${VAL}">• ${line}</div>`,
    `<div style="border-top:1px dashed #000;margin:4px 0;"></div>`,
  );

  const itensCompacto = buildItensBlocks(
    pedido.descricao_itens,
    p => {
      const det = p.detalhes.length
        ? `<div style="${LFT}font-size:${Math.max(fs - 2, 7)}px;font-weight:700;padding-left:8px;">${p.detalhes.join(" · ")}</div>`
        : "";
      return `<div style="${W}display:flex;justify-content:space-between;gap:4px;font-size:${Math.max(fs - 1, 8)}px;font-weight:900;"><span>${p.qtd}x ${p.nome}</span><span>R$${p.preco}</span></div>${det}`;
    },
    line => `<div style="${LFT}font-size:${Math.max(fs - 1, 8)}px;font-weight:700;">${line}</div>`,
    `<div style="height:3px"></div>`,
  );

  // ── Layout bodies ─────────────────────────────────────────────────────────
  let body = "";

  if (layout === "moderno") {
    const SEP  = `<div style="border-top:2px solid #000;margin:5px 0;"></div>`;
    const DSEP = `<div style="border-top:1px dashed #000;margin:4px 0;"></div>`;
    const tipo = pedido.tipo_pedido === "retirada" ? "RETIRADA" : pedido.forma_pagamento === "ja_pago" ? "JA PAGO" : "DELIVERY";
    body = `
<div style="border:2px solid #000;padding:6px 4px;margin-bottom:5px;text-align:center;">
  ${logoImg}
  <div style="font-size:${fsBig + 2}px;font-weight:900;text-transform:uppercase;">${empresaNome}</div>
  <div style="font-size:${fs}px;font-weight:700;">${data}</div>
</div>
${SEP}
<div style="${CTRB}letter-spacing:0.05em;">[ ${tipo} ]</div>
<div style="${CTR}font-size:${fs}px;font-weight:900;">PEDIDO #${pedido.id.slice(0, 8).toUpperCase()}</div>
${SEP}
<div style="${LFT}font-size:${fsBig}px;font-weight:900;">> ${pedido.cliente_nome}</div>
${pedido.cliente_telefone ? `<div style="${VAL}">Tel: ${pedido.cliente_telefone}</div>` : ""}
${DSEP}
${pedido.tipo_pedido === "entrega"
  ? `<div style="${VAL}">End: ${pedido.endereco_entrega}${pedido.bairro ? `, ${pedido.bairro}` : ""}</div>`
  : `<div style="${CTRB}">*** RETIRADA NO LOCAL ***</div>`}
${SEP}
<div style="font-size:${fs - 1}px;font-weight:900;text-transform:uppercase;margin-bottom:2px;">ITENS</div>
${itensModerno}
${pedido.observacoes ? `${DSEP}<div style="${LBL}">Obs:</div><div style="${VAL}">${pedido.observacoes}</div>` : ""}
${SEP}
${priceRow("Subtotal:", `R$ ${pedido.valor_pedido.toFixed(2).replace(".", ",")}`)}
${pedido.valor_motoboy > 0 ? priceRow("Entrega:", `R$ ${pedido.valor_motoboy.toFixed(2).replace(".", ",")}`) : ""}
${SEP}
<div style="${CTRB}">>> TOTAL: R$ ${total.toFixed(2).replace(".", ",")} &lt;&lt;</div>
${SEP}
<div style="${VAL}font-size:${fsBig}px;">Pgto: ${pgto}</div>
${pedido.troco_para ? `<div style="${VAL}">Troco p/ R$ ${pedido.troco_para.toFixed(2).replace(".", ",")}</div>` : ""}
${SEP}
<div style="${CTR}font-size:${fs}px;font-weight:700;">appvellox.online</div>`;

  } else if (layout === "compacto") {
    const SEP  = `<div style="border-top:1px solid #000;margin:3px 0;"></div>`;
    const fsC  = Math.max(fs - 1, 8);
    const dataC = new Date(pedido.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
    const tipo  = pedido.tipo_pedido === "retirada" ? "[RETIRADA]" : pedido.forma_pagamento === "ja_pago" ? "[JA PAGO]" : "[DELIVERY]";
    body = `
${logoImg}
<div style="${CTR}font-size:${fsBig}px;font-weight:900;text-transform:uppercase;">${empresaNome}</div>
<div style="${CTR}font-size:${fsC}px;font-weight:700;">${dataC} | #${pedido.id.slice(0, 8).toUpperCase()}</div>
${SEP}
<div style="${LFT}font-size:${fsC + 1}px;font-weight:900;">${tipo} ${pedido.cliente_nome}</div>
${pedido.cliente_telefone ? `<div style="${LFT}font-size:${fsC}px;font-weight:700;">${pedido.cliente_telefone}</div>` : ""}
${pedido.tipo_pedido === "entrega" ? `<div style="${LFT}font-size:${fsC}px;font-weight:700;">${pedido.endereco_entrega}${pedido.bairro ? `, ${pedido.bairro}` : ""}</div>` : ""}
${SEP}
${itensCompacto}
${pedido.observacoes ? `<div style="${LFT}font-size:${fsC}px;font-weight:700;">Obs: ${pedido.observacoes}</div>` : ""}
${SEP}
<div style="${LFT}font-size:${fsC}px;font-weight:700;">Sub: R$ ${pedido.valor_pedido.toFixed(2).replace(".", ",")}${pedido.valor_motoboy > 0 ? ` | Entr: R$ ${pedido.valor_motoboy.toFixed(2).replace(".", ",")}` : ""}</div>
<div style="${LFT}font-size:${fsBig}px;font-weight:900;">TOTAL: R$ ${total.toFixed(2).replace(".", ",")}</div>
<div style="${LFT}font-size:${fsC + 1}px;font-weight:700;">Pgto: ${pgto}${pedido.troco_para ? ` | Troco p/ R$ ${pedido.troco_para.toFixed(2).replace(".", ",")}` : ""}</div>
${SEP}
<div style="${CTR}font-size:${fsC}px;font-weight:700;">appvellox.online</div>`;

  } else {
    // Clássico (padrão)
    const SEP = `<div style="border-top:${borderCss};margin:4px 0;"></div>`;
    body = `
${logoImg}
<div style="${CTRB}text-transform:uppercase;margin-bottom:1px">${empresaNome}</div>
<div style="${CTR}font-size:${fs}px;font-weight:700">${data}</div>
${SEP}
<div style="${CTRB}">${headerText}</div>
<div style="${CTR}font-size:${fs}px;font-weight:900">PEDIDO #${pedido.id.slice(0, 8).toUpperCase()}</div>
${SEP}
<div style="${LBL}">Cliente</div>
<div style="${LFT}font-size:${fsBig}px;font-weight:900">${pedido.cliente_nome}</div>
${pedido.cliente_telefone ? `<div style="${VAL}">${pedido.cliente_telefone}</div>` : ""}
${SEP}
${pedido.tipo_pedido === "entrega"
  ? `<div style="${LBL}">Endereço</div><div style="${VAL}">${pedido.endereco_entrega}${pedido.bairro ? `, ${pedido.bairro}` : ""}</div>`
  : `<div style="${CTRB}">*** RETIRADA NO LOCAL ***</div>`}
${SEP}
<div style="${LBL}">Itens</div>
${itensClassico}
${pedido.observacoes ? `${SEP}<div style="${LBL}">Obs</div><div style="${VAL}">${pedido.observacoes}</div>` : ""}
${SEP}
${priceRow("Subtotal:", `R$ ${pedido.valor_pedido.toFixed(2).replace(".", ",")}`)}
${pedido.valor_motoboy > 0 ? priceRow("Entrega:", `R$ ${pedido.valor_motoboy.toFixed(2).replace(".", ",")}`) : ""}
${SEP}
<div style="${CTRB}">TOTAL: R$ ${total.toFixed(2).replace(".", ",")}</div>
${SEP}
<div style="${LBL}">Pagamento</div>
<div style="${LFT}font-size:${fsBig}px;font-weight:900">${pgto}</div>
${pedido.troco_para ? `<div style="${VAL}">Troco p/ R$ ${pedido.troco_para.toFixed(2).replace(".", ",")}</div>` : ""}
${SEP}
<div style="${CTR}font-size:${fs}px;font-weight:700">appvellox.online</div>`;
  }

  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8">
<title>${empresaNome}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;word-break:break-all;overflow-wrap:anywhere}
html,body{width:${bodyW}px;font-family:"Courier New",Courier,monospace;font-size:${fs}px;font-weight:700;line-height:1.5;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@media print{@page{margin:0;size:${paperSize} auto}html,body{padding-bottom:60px}}
</style>
</head><body style="padding-bottom:60px">
${body}
</body></html>`;
}

export function printOrder(pedido: Pedido, empresaNome?: string, _empresaCnpj?: string): boolean {
  try {
    const paperSize   = getSavedPaperSize();
    const fontSizeOpt = getSavedFontSize();
    const layout      = getSavedLayout();
    const logoUrl     = getSavedLogo();
    const html        = formatReceipt(pedido, empresaNome ?? "PEDIDO", paperSize, fontSizeOpt, layout, logoUrl);

    // Popup com o HTML completo do cupom:
    // – o documento do popup SÓ tem o recibo → @page{size:auto} mede a altura correta
    // – com --kiosk-printing: imprime sem dialog
    // – com --disable-popup-blocking: popup não é bloqueado (instalador configura ambos)
    const popup = window.open("", "_blank", "width=1,height=1,left=-100,top=-100");
    if (!popup) return false;

    popup.document.open();
    popup.document.write(html);
    popup.document.close();

    const doPrint = () => {
      try {
        popup.focus();
        popup.print();
        // --kiosk-printing fecha o dialog automaticamente; aguarda 1s antes de fechar popup
        setTimeout(() => { try { popup.close(); } catch { /* já fechado */ } }, 1_500);
      } catch { /* popup fechado antes de imprimir */ }
    };

    if (popup.document.readyState === "complete") {
      doPrint();
    } else {
      popup.onload = doPrint;
      setTimeout(doPrint, 600); // fallback caso onload não dispare
    }

    return true;
  } catch {
    return false;
  }
}

export async function autoPrint(
  pedido: Pedido,
  empresaNome?: string,
): Promise<{ ok: boolean; method: "usb" | "dialog" | "skip" | "error" }> {
  const tracked = getTracked();
  if (tracked.has(pedido.id)) return { ok: false, method: "skip" };

  // Tenta USB primeiro (100% silencioso, sem diálogo)
  if (getSavedPrinterName()) {
    try {
      const bytes = buildReceipt(pedido, empresaNome);
      await printViaUsb(bytes);
      trackPrinted(pedido.id);
      return { ok: true, method: "usb" };
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      const isAccessDenied = msg.includes("access denied") || msg.includes("access_denied") ||
        (e instanceof DOMException && (e.name === "SecurityError" || e.name === "NotAllowedError"));
      if (isAccessDenied) {
        const { removeSavedPrinter } = await import("@/lib/usbPrinter");
        removeSavedPrinter();
      }
    }
  }

  // Fallback: window.print() via div injetado
  // Com Chrome --kiosk-printing: imprime silenciosamente
  // Sem --kiosk-printing: abre diálogo de impressão
  try {
    const ok = printOrder(pedido, empresaNome);
    if (ok) trackPrinted(pedido.id);
    return { ok, method: ok ? "dialog" : "error" };
  } catch {
    return { ok: false, method: "error" };
  }
}
