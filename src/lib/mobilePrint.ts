// Impressão pelo CELULAR (Android) numa impressora térmica Bluetooth.
//
// O modo fica salvo SÓ neste aparelho (localStorage) — o PC (agente
// servidor.ps1 / WebUSB / window.print) não é afetado. Dois modos:
//
//  "bluetooth" — Web Bluetooth direto do Chrome (impressoras BLE). Ver btPrinter.ts.
//
//  "rawbt" — app gratuito RawBT (Play Store: ru.a402d.rawbtprinter), que fala
//    com QUALQUER impressora Bluetooth comum (inclusive as "clássicas", que o
//    navegador não alcança). O site manda os bytes ESC/POS para o app por um
//    link Android "intent:" com os bytes em base64:
//
//      intent:base64,<BASE64>#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;
//
//    O Chrome transforma isso na URI "rawbt:base64,<BASE64>" (mesmo formato do
//    link curto `rawbt:base64,...` da documentação do RawBT) e entrega ao app.
//    Por ter `package=`, se o RawBT NÃO estiver instalado o próprio Chrome abre
//    a página do app na Play Store (comportamento padrão de intent com pacote).
//    Base64 é usado porque "urlencode não é seguro para binário" (doc RawBT).
//
// Limitação dos navegadores: abrir outro app (RawBT) ou abrir a lista do
// Bluetooth só é permitido logo depois de um TOQUE do usuário. Para pedido que
// chega sozinho, tentamos imprimir; se for bloqueado, o PrintListener mostra
// o aviso grande "Pedido novo de FULANO — Toque para imprimir".

import { printViaBluetooth, BtPrecisaToqueError, unpairPrinter, isBtSupported } from "@/lib/btPrinter";

export type MobileMode = "bluetooth" | "rawbt";

const MODE_KEY = "vellox-mobile-print-mode";
export const EVENTO_MODO  = "vellox-mobile-print-mode-change";
export const EVENTO_TOQUE = "vellox-mobile-print-tap";

export const RAWBT_PACKAGE  = "ru.a402d.rawbtprinter";
export const RAWBT_PLAY_URL = `https://play.google.com/store/apps/details?id=${RAWBT_PACKAGE}`;

// ── Aparelho ────────────────────────────────────────────────────────────────

function ua(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent || "";
}

export function isIphone(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS se apresenta como "Macintosh" mas tem toque.
  return /iPhone|iPad|iPod/i.test(ua()) || (/Macintosh/i.test(ua()) && (navigator.maxTouchPoints ?? 0) > 1);
}

export function isAndroid(): boolean {
  return /Android/i.test(ua());
}

export function isCelular(): boolean {
  return isAndroid() || isIphone() || /Mobile|Mobi/i.test(ua());
}

// ── Modo salvo neste aparelho ───────────────────────────────────────────────

export function getMobilePrintMode(): MobileMode | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "bluetooth" || v === "rawbt") return v;
  } catch {}
  return null;
}

function avisarMudanca() {
  try { window.dispatchEvent(new Event(EVENTO_MODO)); } catch {}
}

export function setMobilePrintMode(m: MobileMode): void {
  try { localStorage.setItem(MODE_KEY, m); } catch {}
  avisarMudanca();
}

export function clearMobilePrintMode(): void {
  try { localStorage.removeItem(MODE_KEY); } catch {}
  unpairPrinter();
  avisarMudanca();
}

// ── RawBT ───────────────────────────────────────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const PASSO = 0x8000; // evita estourar a pilha do String.fromCharCode
  for (let i = 0; i < bytes.length; i += PASSO) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + PASSO)));
  }
  return btoa(bin);
}

/** Link curto (rawbt:base64,...) — funciona quando o RawBT já está instalado. */
export function buildRawbtSchemeUrl(bytes: Uint8Array): string {
  return `rawbt:base64,${bytesToBase64(bytes)}`;
}

/** Link "intent:" do Android — se o RawBT não estiver instalado, abre a Play Store. */
export function buildRawbtIntentUrl(bytes: Uint8Array): string {
  return `intent:base64,${bytesToBase64(bytes)}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end;`;
}

/** Espera o navegador sair da frente (app abriu). Não dá 100% de certeza. */
function esperarSairDaTela(ms: number): Promise<boolean> {
  return new Promise(resolve => {
    let feito = false;
    const fim = (v: boolean) => {
      if (feito) return;
      feito = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      clearTimeout(t);
      resolve(v);
    };
    const onVis  = () => { if (document.visibilityState === "hidden") fim(true); };
    const onBlur = () => fim(true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    const t = setTimeout(() => fim(false), ms);
  });
}

function temToqueAtivo(): boolean | null {
  const ua = (navigator as unknown as { userActivation?: { isActive: boolean } }).userActivation;
  return ua ? ua.isActive : null;
}

async function imprimirRawbt(bytes: Uint8Array, gesto: boolean): Promise<ResultadoCelular> {
  const toque = temToqueAtivo();
  // Sem toque recente o Chrome bloqueia abrir outro app — nem tenta.
  if (!gesto && toque === false) {
    return { ok: false, precisaToque: true, mensagem: "Toque para imprimir." };
  }
  const url = isAndroid() ? buildRawbtIntentUrl(bytes) : buildRawbtSchemeUrl(bytes);
  try {
    window.location.href = url;
  } catch {
    return { ok: false, precisaToque: !gesto, mensagem: "Não deu para abrir o app RawBT." };
  }
  if (gesto) return { ok: true };
  // Sem toque: só considera impresso se o app de fato abriu por cima.
  const abriu = await esperarSairDaTela(2500);
  return abriu ? { ok: true } : { ok: false, precisaToque: true, mensagem: "Toque para imprimir." };
}

// ── Bluetooth direto ────────────────────────────────────────────────────────

async function imprimirBluetooth(bytes: Uint8Array, gesto: boolean): Promise<ResultadoCelular> {
  if (!isBtSupported()) return { ok: false, precisaToque: false, mensagem: "Este navegador não tem Bluetooth. Use o Google Chrome." };
  try {
    await printViaBluetooth(bytes, { permitirSeletor: gesto });
    return { ok: true };
  } catch (e) {
    if (e instanceof BtPrecisaToqueError) return { ok: false, precisaToque: true, mensagem: "Toque para imprimir." };
    const nome = e instanceof DOMException ? e.name : "";
    // Sem toque, alguns erros de conexão também se resolvem com um toque.
    if (!gesto && (nome === "SecurityError" || nome === "NotAllowedError")) {
      return { ok: false, precisaToque: true, mensagem: "Toque para imprimir." };
    }
    if (nome === "NotFoundError") {
      return { ok: false, precisaToque: !gesto, mensagem: "Impressora não encontrada. Ela está ligada e perto do celular?" };
    }
    return {
      ok: false,
      precisaToque: !gesto,
      mensagem: "Não conseguiu falar com a impressora. Confira se ela está ligada, com papel e perto do celular.",
    };
  }
}

// ── API usada pelo resto do painel ──────────────────────────────────────────

export type ResultadoCelular =
  | { ok: true }
  | { ok: false; precisaToque: boolean; mensagem: string };

/**
 * Imprime bytes ESC/POS pelo modo do celular salvo neste aparelho.
 * `gesto: true` = chamado direto de um toque/clique (pode abrir app/lista).
 */
export async function imprimirNoCelular(
  bytes: Uint8Array,
  opts: { gesto: boolean; modo?: MobileMode },
): Promise<ResultadoCelular> {
  const modo = opts.modo ?? getMobilePrintMode();
  if (!modo) return { ok: false, precisaToque: false, mensagem: "Impressão pelo celular não está ligada." };
  // Importante p/ RawBT: nada de await antes daqui — o app tem que ser aberto
  // ainda "dentro" do toque, senão o Chrome bloqueia.
  return modo === "rawbt" ? imprimirRawbt(bytes, opts.gesto) : imprimirBluetooth(bytes, opts.gesto);
}

export interface PedidoToque {
  /** id do pedido (ou "teste") — usado para não repetir e para marcar impresso */
  id: string;
  titulo: string;
  bytes: Uint8Array;
  /** marca no banco como impresso depois do toque (só pedidos automáticos) */
  marcarImpresso?: boolean;
  erro?: string;
}

/** Pede ao PrintListener para mostrar o aviso grande "Toque para imprimir". */
export function pedirToqueParaImprimir(item: PedidoToque): void {
  try { window.dispatchEvent(new CustomEvent<PedidoToque>(EVENTO_TOQUE, { detail: item })); } catch {}
}
