import type { Pedido } from "@/types";
import { buildReceipt, parseItemLine, tituloSabores, marcaSabor, getSavedFonte, type ItemParsed, type FonteOpt } from "@/lib/escpos";
import { printViaUsb, getSavedPrinterName } from "@/lib/usbPrinter";

export { getSavedFonte, saveFonte, isFonteOpt, type FonteOpt } from "@/lib/escpos";

const PRINTED_KEY    = "vellox-printed-orders";
const MAX_TRACKED    = 300;
const PAPER_SIZE_KEY = "vellox-paper-size";

export type PaperSize  = "58mm" | "80mm";

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

// Um tamanho só pro cupom HTML inteiro, na mesma escala do ESC/POS
// (normal 1x : grande ~1.4x : extra_grande 2x — Fonte A, Fonte B 2x2, Fonte A 2x2).
export const FONTE_PX: Record<PaperSize, Record<FonteOpt, number>> = {
  "80mm": { normal: 12, grande: 16, extra_grande: 21 },
  "58mm": { normal: 10, grande: 13, extra_grande: 17 },
};

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
    descricao_itens:  "1x Pizza Grande (Grande · Calabresa/Mussarela) — R$39,90\n1x Coca-Cola 2L — R$5,00",
    valor_pedido:     44.90, valor_motoboy: 5.00,
    forma_pagamento:  "pix", troco_para: null,
    status:           "em_fila",
    observacoes:      "Cupom de teste — Vellox",
    bairro:           "Centro", distancia_km: null,
    origem:           "manual", tracking_token: null,
    created_at:       new Date().toISOString(),
    updated_at:       new Date().toISOString(),
    printed_at:       null, print_count: 0, auto_printed: false,
    avaliacao_nota: null, avaliacao_comentario: null,
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
  fonte: FonteOpt = "grande",
  layout: LayoutOpt = "classico",
  logoUrl = "",
): string {
  const data  = new Date(pedido.created_at).toLocaleString("pt-BR");
  const total = pedido.valor_pedido + pedido.valor_motoboy;
  const pgto  = pedido.forma_pagamento ? (PGTO_LABELS[pedido.forma_pagamento] ?? pedido.forma_pagamento) : "—";
  const { borderCss, headerText } = borderStyle(pedido);

  const is58  = paperSize === "58mm";
  const bodyW = is58 ? 195 : 265;
  // Uma letra só pro cupom inteiro — ênfase só por peso (900 x 700).
  const fs    = (FONTE_PX[paperSize] ?? FONTE_PX["80mm"])[fonte] ?? FONTE_PX["80mm"].grande;

  const W    = `width:100%;display:block;`;
  const CTR  = `${W}text-align:center;`;
  const LFT  = `${W}text-align:left;`;
  const CTRB = `${CTR}font-weight:900;`;
  const VAL  = `${LFT}font-weight:700;`;
  const STR  = `${LFT}font-weight:900;`;
  const LBL  = `${LFT}font-weight:900;text-transform:uppercase;margin:3px 0 1px;`;

  const priceRow = (label: string, valor: string, peso = 700) =>
    `<div style="${W}display:flex;justify-content:space-between;gap:6px;font-weight:${peso};margin:1px 0"><span>${label}</span><span style="white-space:nowrap">${valor}</span></div>`;

  const logoImg = logoUrl
    ? `<div style="${CTR}margin-bottom:4px"><img src="${logoUrl}" style="max-width:${Math.round(bodyW * 0.65)}px;max-height:64px;object-fit:contain;" /></div>`
    : "";

  // Mesmo bloco de item do ESC/POS (escpos.ts itemBlock): nome+preço, variação
  // recuada, bloco de sabores com título ("MEIO A MEIO:" + "1/2 Sabor"),
  // adicionais um por linha com "+ ". Marcador numa coluna própria: o texto
  // quebrado alinha embaixo do texto, nunca embaixo do marcador.
  const IND = `padding-left:1.4em;`;
  const marcado = (marca: string, texto: string) =>
    `<div style="${W}display:flex;${IND}font-weight:900;"><span style="flex:none;white-space:pre;">${marca}</span><span style="flex:1;min-width:0;">${texto}</span></div>`;
  const itemHeader = (p: ItemParsed) =>
    `<div style="${W}display:flex;justify-content:space-between;align-items:flex-end;gap:6px;font-weight:900;"><span>${p.qtd}x ${p.nome}</span><span style="white-space:nowrap">R$${p.preco}</span></div>`;
  const itemHtml = (p: ItemParsed) => {
    let h = itemHeader(p);
    for (const d of p.detalhes) h += `<div style="${VAL}${IND}">${d}</div>`;
    if (p.sabores.length) {
      h += `<div style="${STR}${IND}letter-spacing:0.03em;">${tituloSabores(p)}</div>`;
      p.sabores.forEach((s, i) => { h += marcado(marcaSabor(p, i), s); });
    }
    for (const a of p.adicionais) h += marcado("+ ", a);
    return h;
  };
  const itensHtml = (divider: string) =>
    buildItensBlocks(pedido.descricao_itens, itemHtml, line => `<div style="${VAL}">${line}</div>`, divider);

  const itensClassico = itensHtml(`<div style="height:5px"></div>`);
  const itensModerno  = itensHtml(`<div style="border-top:1px dashed #000;margin:4px 0;"></div>`);
  const itensCompacto = itensHtml(`<div style="height:2px"></div>`);

  // ── Layout bodies ─────────────────────────────────────────────────────────
  let body = "";

  if (layout === "moderno") {
    const SEP  = `<div style="border-top:2px solid #000;margin:5px 0;"></div>`;
    const DSEP = `<div style="border-top:1px dashed #000;margin:4px 0;"></div>`;
    const tipo = pedido.tipo_pedido === "retirada" ? "RETIRADA" : pedido.forma_pagamento === "ja_pago" ? "JA PAGO" : "DELIVERY";
    body = `
<div style="border:2px solid #000;padding:6px 4px;margin-bottom:5px;text-align:center;">
  ${logoImg}
  <div style="font-weight:900;text-transform:uppercase;">${empresaNome}</div>
  <div style="font-weight:700;">${data}</div>
</div>
${SEP}
<div style="${CTRB}letter-spacing:0.05em;">[ ${tipo} ]</div>
<div style="${CTRB}">PEDIDO #${pedido.id.slice(0, 8).toUpperCase()}</div>
${SEP}
<div style="${STR}">> ${pedido.cliente_nome}</div>
${pedido.cliente_telefone ? `<div style="${VAL}">Tel: ${pedido.cliente_telefone}</div>` : ""}
${DSEP}
${pedido.tipo_pedido === "entrega"
  ? `<div style="${VAL}">End: ${pedido.endereco_entrega}</div>${pedido.bairro ? `<div style="${VAL}">Bairro: ${pedido.bairro}</div>` : ""}`
  : `<div style="${CTRB}">*** RETIRADA NO LOCAL ***</div>`}
${SEP}
<div style="${CTRB}letter-spacing:0.05em;">== ITENS ==</div>
${itensModerno}
${pedido.observacoes ? `${DSEP}<div style="${LBL}">Obs:</div><div style="${VAL}">${pedido.observacoes}</div>` : ""}
${SEP}
${priceRow("Subtotal:", `R$ ${pedido.valor_pedido.toFixed(2).replace(".", ",")}`)}
${pedido.valor_motoboy > 0 ? priceRow("Entrega:", `R$ ${pedido.valor_motoboy.toFixed(2).replace(".", ",")}`) : ""}
${SEP}
<div style="${CTRB}">>> TOTAL: R$ ${total.toFixed(2).replace(".", ",")} &lt;&lt;</div>
${SEP}
<div style="${STR}">Pgto: ${pgto}</div>
${pedido.troco_para ? `<div style="${VAL}">Troco p/ R$ ${pedido.troco_para.toFixed(2).replace(".", ",")}</div>` : ""}
${SEP}
<div style="${CTR}font-weight:700;">appvellox.online</div>`;

  } else if (layout === "compacto") {
    const SEP  = `<div style="border-top:1px solid #000;margin:3px 0;"></div>`;
    const dataC = new Date(pedido.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
    const tipo  = pedido.tipo_pedido === "retirada" ? "[RETIRADA]" : pedido.forma_pagamento === "ja_pago" ? "[JA PAGO]" : "[DELIVERY]";
    body = `
${logoImg}
<div style="${CTRB}text-transform:uppercase;">${empresaNome}</div>
<div style="${CTR}font-weight:700;">${dataC} | #${pedido.id.slice(0, 8).toUpperCase()}</div>
${SEP}
<div style="${STR}">${tipo} ${pedido.cliente_nome}</div>
${pedido.cliente_telefone ? `<div style="${VAL}">${pedido.cliente_telefone}</div>` : ""}
${pedido.tipo_pedido === "entrega" ? `<div style="${VAL}">${pedido.endereco_entrega}${pedido.bairro ? `, ${pedido.bairro}` : ""}</div>` : ""}
${SEP}
${itensCompacto}
${pedido.observacoes ? `<div style="${VAL}">Obs: ${pedido.observacoes}</div>` : ""}
${SEP}
<div style="${VAL}">Sub: R$ ${pedido.valor_pedido.toFixed(2).replace(".", ",")}${pedido.valor_motoboy > 0 ? ` | Entr: R$ ${pedido.valor_motoboy.toFixed(2).replace(".", ",")}` : ""}</div>
<div style="${STR}">TOTAL: R$ ${total.toFixed(2).replace(".", ",")}</div>
<div style="${VAL}">Pgto: ${pgto}${pedido.troco_para ? ` | Troco p/ R$ ${pedido.troco_para.toFixed(2).replace(".", ",")}` : ""}</div>
${SEP}
<div style="${CTR}font-weight:700;">appvellox.online</div>`;

  } else {
    // Clássico (padrão)
    const SEP = `<div style="border-top:${borderCss};margin:4px 0;"></div>`;
    body = `
${logoImg}
<div style="${CTRB}text-transform:uppercase;margin-bottom:1px">${empresaNome}</div>
<div style="${CTR}font-weight:700">${data}</div>
${SEP}
<div style="${CTRB}">${headerText}</div>
<div style="${CTRB}">PEDIDO #${pedido.id.slice(0, 8).toUpperCase()}</div>
${SEP}
<div style="${LBL}">Cliente</div>
<div style="${STR}">${pedido.cliente_nome}</div>
${pedido.cliente_telefone ? `<div style="${VAL}">${pedido.cliente_telefone}</div>` : ""}
${SEP}
${pedido.tipo_pedido === "entrega"
  ? `<div style="${LBL}">Endereço</div><div style="${VAL}">${pedido.endereco_entrega}</div>${pedido.bairro ? `<div style="${VAL}">Bairro: ${pedido.bairro}</div>` : ""}`
  : `<div style="${CTRB}">*** RETIRADA NO LOCAL ***</div>`}
${SEP}
<div style="${LBL}">Itens</div>
${itensClassico}
${pedido.observacoes ? `${SEP}<div style="${LBL}">Obs</div><div style="${VAL}">${pedido.observacoes}</div>` : ""}
${SEP}
${priceRow("Subtotal:", `R$ ${pedido.valor_pedido.toFixed(2).replace(".", ",")}`)}
${pedido.valor_motoboy > 0 ? priceRow("Entrega:", `R$ ${pedido.valor_motoboy.toFixed(2).replace(".", ",")}`) : ""}
${priceRow("TOTAL:", `R$ ${total.toFixed(2).replace(".", ",")}`, 900)}
${SEP}
<div style="${LBL}">Pagamento</div>
<div style="${STR}">${pgto}</div>
${pedido.troco_para ? `<div style="${VAL}">Troco p/ R$ ${pedido.troco_para.toFixed(2).replace(".", ",")}</div>` : ""}
${SEP}
<div style="${CTR}font-weight:700">appvellox.online</div>`;
  }

  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8">
<title>${empresaNome}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-size:inherit;word-break:normal;overflow-wrap:break-word}
html,body{width:${bodyW}px;font-family:Consolas,"Lucida Console","Liberation Mono","DejaVu Sans Mono","Courier New",monospace;font-size:${fs}px;font-weight:700;line-height:1.3;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
span{min-width:0}
@media print{@page{margin:0;size:${paperSize} auto}html,body{padding-bottom:60px}}
</style>
</head><body style="padding-bottom:60px">
${body}
</body></html>`;
}

// `layoutOverride`/`fonteOverride` vêm do banco (configuracoes_print_agent,
// buscado no servidor) quando o chamador tem acesso — é a mesma fonte que o
// agente de impressão (servidor.ps1) usa, então reimpressão, impressão
// automática e agente saem iguais. Sem override, usa o que está salvo neste
// navegador.
export function printOrder(
  pedido: Pedido,
  empresaNome?: string,
  _empresaCnpj?: string,
  layoutOverride?: LayoutOpt,
  fonteOverride?: FonteOpt,
): boolean {
  try {
    const paperSize = getSavedPaperSize();
    const fonte     = fonteOverride ?? getSavedFonte();
    const layout    = layoutOverride ?? getSavedLayout();
    const logoUrl   = getSavedLogo();
    const html      = formatReceipt(pedido, empresaNome ?? "PEDIDO", paperSize, fonte, layout, logoUrl);

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
  layoutOverride?: LayoutOpt,
  fonteOverride?: FonteOpt,
): Promise<{ ok: boolean; method: "usb" | "dialog" | "skip" | "error" }> {
  const tracked = getTracked();
  if (tracked.has(pedido.id)) return { ok: false, method: "skip" };

  // Tenta USB primeiro (100% silencioso, sem diálogo)
  if (getSavedPrinterName()) {
    try {
      const bytes = buildReceipt(pedido, empresaNome, layoutOverride, fonteOverride);
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
    const ok = printOrder(pedido, empresaNome, undefined, layoutOverride, fonteOverride);
    if (ok) trackPrinted(pedido.id);
    return { ok, method: ok ? "dialog" : "error" };
  } catch {
    return { ok: false, method: "error" };
  }
}
