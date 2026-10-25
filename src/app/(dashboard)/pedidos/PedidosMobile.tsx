"use client";

// ── Quadro de pedidos (Kanban) ───────────────────────────────────────────
// Celular: as colunas viram painéis de largura total que deslizam na
// horizontal, com abas/contadores no topo. Desktop: 4 colunas lado a lado.
// Tocar num card abre o detalhe (bottom sheet no celular, painel lateral no
// desktop) com o botão grande do próximo passo e o "Mais".
// Só apresentação: toda a regra de negócio (avançar status, motoboy,
// cancelar, imprimir, editar, excluir, realtime, som, fluxo automático)
// continua no PedidosClient e chega aqui por props.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, X, Loader2, Truck, ShoppingBag, MapPin, Bike, Plus, Bell, Clock,
  MoreHorizontal, Printer, Phone, Pencil, Trash2, XCircle, Undo2, RefreshCw,
  ChefHat, PackageCheck, Send, CheckCircle, Navigation, Calendar, Zap, Inbox,
  Banknote, CreditCard, QrCode, Store, History, ChevronRight, StickyNote,
} from "lucide-react";
import AvisarWhatsApp from "@/components/dashboard/AvisarWhatsApp";
import { parseItemLine, tituloSabores, marcaSabor } from "@/lib/escpos";
import type { Pedido, PedidoStatus } from "@/types";

// ── Helpers compartilhados com a visão Lista ────────────────────────────
/** "agora", "12 min", "1 h 20", "3 dias" — nunca "27736min". */
export function tempoDecorrido(min: number): string {
  const m = Math.max(0, Math.floor(min));
  if (m < 1) return "agora";
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
  }
  const d = Math.floor(m / (24 * 60));
  return d === 1 ? "1 dia" : `${d} dias`;
}

/** Número curto do pedido: não há coluna de número no banco, então usa o fim do id. */
export function numeroPedido(p: Pedido): string {
  return "#" + p.id.replace(/-/g, "").slice(-4).toUpperCase();
}

export type ModoPedidos = "quadro" | "lista";
export const MODO_KEY = "vellox-pedidos-visao";
const LETRA_KEY = "vellox-pedidos-letra";

export function ModoSeletor({ modo, onChange }: { modo: ModoPedidos; onChange: (m: ModoPedidos) => void }) {
  return (
    <div role="group" aria-label="Como ver os pedidos" className="inline-flex shrink-0 rounded-xl p-1"
      style={{ background: "var(--bg-3)", border: "1px solid var(--border-2)" }}>
      {(["quadro", "lista"] as const).map(m => {
        const ativo = modo === m;
        return (
          <button key={m} type="button" onClick={() => onChange(m)} aria-pressed={ativo}
            className="rounded-lg font-bold"
            style={{
              minHeight: 40, padding: "0 14px", fontSize: 14,
              background: ativo ? "var(--bg-1)" : "transparent",
              color: ativo ? "var(--text-1)" : "var(--text-2)",
              boxShadow: ativo ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
              border: ativo ? "1px solid var(--border-2)" : "1px solid transparent",
            }}>
            {m === "quadro" ? "Quadro" : "Lista"}
          </button>
        );
      })}
    </div>
  );
}

// ── Tipos ───────────────────────────────────────────────────────────────
type Tom = "red" | "orange" | "green" | "blue" | "gray";
interface MotoboyDisp { id: string; nome: string; posicao_fila: number | null }

interface Props {
  pedidos: Pedido[];            // já filtrados pela busca/data (mesmo filtro da Lista)
  totalPedidos: number;
  empresaNome: string;
  now: number;
  motoboysDisp: MotoboyDisp[];
  advancing: string | null;
  sendingTo: string | null;
  marcandoEntregue: string | null;
  trocandoMb: string | null;
  cancelandoDespacho: string | null;
  highlightedOrders: Set<string>;
  newOrderBanner: { lastClienteNome: string; count: number } | null;
  onFecharBanner: () => void;
  busca: string; setBusca: (v: string) => void;
  dataDe: string; setDataDe: (v: string) => void;
  dataAte: string; setDataAte: (v: string) => void;
  onAdvance: (p: Pedido) => Promise<void>;
  onEnviarMotoboy: (pedidoId: string, motoboyId: string) => Promise<void>;
  onMarcarEntregue: (p: Pedido) => Promise<void>;
  onTrocarMotoboy: (p: Pedido, motoboyId: string) => Promise<void>;
  onDevolverFila: (p: Pedido) => Promise<void>;
  onCancel: (p: Pedido) => Promise<void>;
  onPrint: (p: Pedido) => void;
  onEdit: (p: Pedido) => void;
  onDelete: (p: Pedido) => void;
  onNovoPedido: () => void;
  onRecarregarMotoboys: () => Promise<void>;
  modo: ModoPedidos;
  onModo: (m: ModoPedidos) => void;
}

const COLS: { label: string; status: PedidoStatus[]; tom: Tom; vazio: string }[] = [
  { label: "Novo",       status: ["em_fila"],    tom: "red",    vazio: "Nenhum pedido novo esperando." },
  { label: "Preparando", status: ["em_preparo"], tom: "orange", vazio: "Nenhum pedido sendo preparado." },
  { label: "Pronto",     status: ["finalizado"], tom: "green",  vazio: "Nenhum pedido pronto esperando." },
  { label: "Em rota",    status: ["em_coleta", "em_rota_de_entrega", "aguardando_confirmacao"], tom: "blue", vazio: "Nenhum pedido na rua agora." },
  { label: "Histórico",  status: ["entregue", "cancelado"], tom: "gray", vazio: "Nenhum pedido entregue ou cancelado hoje." },
];
const HIST = 4;
const colDe = (s: PedidoStatus) => COLS.findIndex(c => c.status.includes(s));

const PGTO: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "Pix", cartao: "Cartão", cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito", ja_pago: "Já pago",
};

const rs = (v: number) => "R$ " + v.toFixed(2).replace(".", ",");
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const inicioDoDia = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const quando = (p: Pedido) => new Date(p.updated_at ?? p.created_at).getTime();
const ehDesktop = () => typeof window !== "undefined" && window.innerWidth >= 768;

/** Tamanho de letra que acompanha o botão "Aa". */
const f = (px: number) => `calc(${px}px * var(--pm-esc, 1))`;

function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.` : nome.trim();
}

function resumoItens(desc: string | null): string {
  const linhas = (desc ?? "").split("\n").map(l => l.trim()).filter(Boolean);
  if (!linhas.length) return "";
  const it = parseItemLine(linhas[0]);
  const primeiro = it ? `${it.qtd}x ${it.nome}` : linhas[0];
  return linhas.length > 1 ? `${primeiro} + ${linhas.length - 1} ${linhas.length - 1 === 1 ? "item" : "itens"}` : primeiro;
}

function pilula(p: Pedido): { texto: string; tom: Tom } {
  if (p.status === "cancelado") return { texto: "Cancelado", tom: "red" };
  if (p.status === "entregue") return { texto: p.tipo_pedido === "retirada" ? "Retirado" : "Entregue", tom: "gray" };
  const c = COLS[colDe(p.status)];
  return { texto: c?.label ?? p.status, tom: c?.tom ?? "gray" };
}

function linkMapa(p: Pedido, app: "google" | "waze") {
  const temCoord = p.endereco_lat != null && p.endereco_lng != null;
  const q = encodeURIComponent(p.route_address || p.endereco_entrega);
  if (app === "waze") {
    return temCoord ? `https://waze.com/ul?ll=${p.endereco_lat},${p.endereco_lng}&navigate=yes` : `https://waze.com/ul?q=${q}&navigate=yes`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${temCoord ? `${p.endereco_lat},${p.endereco_lng}` : q}`;
}

function telefoneLigar(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length >= 8 ? d : null;
}

type Passo = { texto: string; curto: string; icone: React.ReactNode; cor: string; acao: () => Promise<void> | void; carregando: boolean };

/** Próximo passo de cada pedido — o mesmo handler que a Lista usa. */
function passos(p: Pedido, props: Props, escolherMotoboy: () => void): { principal: Passo | null; secundario: Passo | null } {
  const retirada = p.tipo_pedido === "retirada";
  const adv = props.advancing === p.id;
  const ent = props.marcandoEntregue === p.id;
  const env = props.sendingTo === p.id || props.trocandoMb === p.id;
  const entregue = (acao: () => Promise<void>, carregando: boolean): Passo =>
    ({ texto: "Entregue", curto: "Entregue", icone: <CheckCircle size={22} />, cor: "#15803d", acao, carregando });
  switch (p.status) {
    case "em_fila":
      return { principal: { texto: "Começar preparo", curto: "Começar preparo", icone: <ChefHat size={22} />, cor: "#1d4ed8", acao: () => props.onAdvance(p), carregando: adv }, secundario: null };
    case "em_preparo":
      return { principal: { texto: retirada ? "Pronto para retirada" : "Pronto — despachar", curto: "Pronto", icone: <PackageCheck size={22} />, cor: "#15803d", acao: () => props.onAdvance(p), carregando: adv }, secundario: null };
    case "finalizado":
      if (retirada) return { principal: { texto: "Cliente retirou", curto: "Cliente retirou", icone: <CheckCircle size={22} />, cor: "#15803d", acao: () => props.onAdvance(p), carregando: adv }, secundario: null };
      if (!p.motoboy_id) return {
        principal: { texto: "Enviar para motoboy", curto: "Enviar motoboy", icone: <Send size={22} />, cor: "#c2410c", acao: escolherMotoboy, carregando: env },
        secundario: entregue(() => props.onMarcarEntregue(p), ent),
      };
      return { principal: entregue(() => props.onMarcarEntregue(p), ent), secundario: null };
    case "em_coleta":
    case "em_rota_de_entrega":
      return { principal: entregue(() => props.onMarcarEntregue(p), ent), secundario: null };
    case "aguardando_confirmacao":
      return { principal: entregue(() => props.onAdvance(p), adv), secundario: null };
    default:
      return { principal: null, secundario: null };
  }
}

// ── Componente ──────────────────────────────────────────────────────────
export default function PedidosMobile(props: Props) {
  const {
    pedidos, totalPedidos, empresaNome, now, motoboysDisp, sendingTo,
    trocandoMb, cancelandoDespacho, highlightedOrders, newOrderBanner, onFecharBanner,
    busca, setBusca, dataDe, setDataDe, dataAte, setDataAte,
  } = props;

  const [col, setCol] = useState<number | null>(null);  // painel visível no celular
  const [verHist, setVerHist] = useState(false);          // desktop: quadro × histórico
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [letra, setLetra] = useState(0);
  const [verMaisHist, setVerMaisHist] = useState(0);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [menuDe, setMenuDe] = useState<Pedido | null>(null);
  const [motoboyDe, setMotoboyDe] = useState<{ pedido: Pedido; modo: "enviar" | "trocar" } | null>(null);
  const [cancelarDe, setCancelarDe] = useState<Pedido | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  const [recarregandoMb, setRecarregandoMb] = useState(false);
  const ultimoBanner = useRef(0);
  const raizRef = useRef<HTMLDivElement>(null);
  const quadroRef = useRef<HTMLDivElement>(null);
  const rolRef = useRef<HTMLElement | null>(null);

  // O cabeçalho fixo do painel (só no celular) cobre o topo da área rolável —
  // mede quanto ele cobre para o topo do quadro grudar logo abaixo dele.
  useEffect(() => {
    function medir() {
      const raiz = raizRef.current;
      if (!raiz) return;
      let rol: HTMLElement | null = raiz.parentElement;
      while (rol && !/(auto|scroll)/.test(getComputedStyle(rol).overflowY)) rol = rol.parentElement;
      rolRef.current = rol;
      // O "top" do sticky conta a partir da borda interna (descontado o padding) da área rolável
      const topoRol = rol ? rol.getBoundingClientRect().top + (parseFloat(getComputedStyle(rol).paddingTop) || 0) : 0;
      const cab = [...document.querySelectorAll("header")].find(h => getComputedStyle(h).position === "fixed" && h.getBoundingClientRect().height > 0);
      const fimCab = cab ? cab.getBoundingClientRect().bottom : 0;
      raiz.style.setProperty("--pm-cab", `${Math.round(fimCab)}px`);
      raiz.style.setProperty("--pm-topo-top", `${Math.max(0, Math.round(fimCab - topoRol))}px`);
    }
    medir();
    const t = setTimeout(medir, 800);
    window.addEventListener("resize", medir);
    return () => { clearTimeout(t); window.removeEventListener("resize", medir); };
  }, []);

  // Letra maior lembrada no aparelho
  useEffect(() => {
    try { const v = Number(localStorage.getItem(LETRA_KEY)); if (v === 1 || v === 2) setLetra(v); } catch { /* sem storage */ }
  }, []);
  function trocarLetra() {
    const n = (letra + 1) % 3;
    setLetra(n);
    try { localStorage.setItem(LETRA_KEY, String(n)); } catch { /* sem storage */ }
  }

  const filtroAtivo = !!(busca || dataDe || dataAte);

  // ── Separação por coluna ─────────────────────────────────────────────
  const hojeIni = inicioDoDia(now);
  const porCol = useMemo(() => {
    const m: Pedido[][] = COLS.map(() => []);
    for (const p of pedidos) { const i = colDe(p.status); if (i >= 0) m[i].push(p); }
    // Ativos: o mais recente em cima (como no quadro do dono). Histórico: mais recente em cima.
    for (let i = 0; i < HIST; i++) m[i].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    m[HIST].sort((a, b) => quando(b) - quando(a));
    return m;
  }, [pedidos]);
  const histHoje = (dataDe || dataAte) ? porCol[HIST] : porCol[HIST].filter(p => quando(p) >= hojeIni);
  const histAntigos = (dataDe || dataAte) ? [] : porCol[HIST].filter(p => quando(p) < hojeIni);
  const listas = [porCol[0], porCol[1], porCol[2], porCol[3], [...histHoje, ...histAntigos.slice(0, verMaisHist)]];
  const contagem = [porCol[0].length, porCol[1].length, porCol[2].length, porCol[3].length, histHoje.length];

  // ── Painéis deslizantes (celular) ────────────────────────────────────
  const irPara = useCallback((i: number, suave = true) => {
    setCol(i);
    const q = quadroRef.current;
    if (q && !ehDesktop()) q.scrollTo({ left: i * q.clientWidth, behavior: suave ? "smooth" : "auto" });
    if (ehDesktop()) setVerHist(i === HIST);
    const rol = rolRef.current;
    if (rol && raizRef.current && !ehDesktop()) {
      const topo = raizRef.current.getBoundingClientRect().top - rol.getBoundingClientRect().top + rol.scrollTop;
      if (rol.scrollTop > topo) rol.scrollTo({ top: topo });
    }
  }, []);

  // Abre na primeira coluna que tiver pedidos (só na primeira vez)
  useEffect(() => {
    if (col !== null) return;
    const primeira = contagem.findIndex((n, i) => i < HIST && n > 0);
    const i = primeira >= 0 ? primeira : HIST;
    setCol(i);
    requestAnimationFrame(() => { const q = quadroRef.current; if (q && !ehDesktop()) q.scrollTo({ left: i * q.clientWidth }); });
  }, [col, contagem]); // eslint-disable-line react-hooks/exhaustive-deps

  function aoDeslizar() {
    const q = quadroRef.current;
    if (!q || ehDesktop()) return;
    const i = Math.round(q.scrollLeft / Math.max(1, q.clientWidth));
    if (i !== col) setCol(i);
  }

  const colAtual = col ?? 0;

  // ── Pedido novo: vibração + faixa ────────────────────────────────────
  useEffect(() => {
    const c = newOrderBanner?.count ?? 0;
    if (c > ultimoBanner.current) {
      try { navigator.vibrate?.([400, 150, 400, 150, 400]); } catch { /* sem vibração */ }
    }
    ultimoBanner.current = c;
  }, [newOrderBanner?.count]);

  function verPedidoNovo() {
    const alvo = pedidos
      .filter(p => highlightedOrders.has(p.id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const i = alvo ? Math.max(0, colDe(alvo.status)) : 0;
    irPara(i);
    onFecharBanner();
    if (alvo) {
      setFoco(alvo.id);
      setTimeout(() => document.getElementById(`pm-card-${alvo.id}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }), 350);
      setTimeout(() => setFoco(v => (v === alvo.id ? null : v)), 5000);
    }
  }

  // Executa o passo e, ao terminar, fecha o detalhe e destaca o card na nova coluna
  async function executar(p: Pedido, passo: Passo, fecharDetalhe: boolean) {
    await passo.acao();
    if (fecharDetalhe && !/motoboy/i.test(passo.curto)) {
      setDetalheId(null);
      setFoco(p.id);
      setTimeout(() => setFoco(v => (v === p.id ? null : v)), 3000);
    }
  }

  async function confirmarCancelamento() {
    if (!cancelarDe) return;
    setCancelando(true);
    try { await props.onCancel(cancelarDe); } finally { setCancelando(false); setCancelarDe(null); setDetalheId(null); }
  }

  async function recarregarMotoboys() {
    setRecarregandoMb(true);
    try { await props.onRecarregarMotoboys(); } finally { setRecarregandoMb(false); }
  }

  const escala = letra === 2 ? 1.3 : letra === 1 ? 1.15 : 1;
  const detalhe = detalheId ? pedidos.find(p => p.id === detalheId) ?? null : null;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div ref={raizRef} className="pm-root" data-hist={verHist ? "1" : undefined}
      style={{ ["--pm-esc" as string]: escala }}>
      <style>{CSS}</style>

      {/* ── Faixa de pedido novo ── */}
      {newOrderBanner && (
        <div className="pm-banner" role="alert">
          <button type="button" onClick={verPedidoNovo} className="flex items-center gap-3 flex-1 min-w-0 text-left"
            style={{ minHeight: 64, padding: "10px 4px 10px 14px", color: "#fff", background: "transparent", border: "none" }}>
            <span className="pm-sino flex items-center justify-center shrink-0" style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.18)" }}>
              <Bell size={24} color="#fff" />
            </span>
            <span className="min-w-0">
              <span className="block font-extrabold" style={{ fontSize: f(17), lineHeight: 1.25 }}>
                {newOrderBanner.count > 1
                  ? `${newOrderBanner.count} pedidos novos — último de ${newOrderBanner.lastClienteNome}`
                  : `Novo pedido de ${newOrderBanner.lastClienteNome}`}
              </span>
              <span className="block font-semibold" style={{ fontSize: f(14), opacity: 0.95 }}>Toque para ver</span>
            </span>
          </button>
          <button type="button" onClick={onFecharBanner} aria-label="Parar o som e fechar o aviso"
            className="flex flex-col items-center justify-center shrink-0"
            style={{ width: 60, minHeight: 64, color: "#fff", background: "rgba(0,0,0,0.18)", border: "none", fontSize: 11, fontWeight: 700 }}>
            <X size={22} />
            Fechar
          </button>
        </div>
      )}

      {/* ── Cabeçalho: modo, busca, letra, abas ── */}
      <div className="pm-topo">
        <div className="pm-barra">
          <div className="pm-so-desk" style={{ marginRight: 8 }}>
            <h1 className="font-bold" style={{ fontSize: 24, color: "var(--text-1)", lineHeight: 1.1 }}>Pedidos</h1>
            <p style={{ fontSize: 13.5, color: "var(--text-2)", marginTop: 2 }}>
              {filtroAtivo ? `${pedidos.length} de ${totalPedidos} pedidos` : `${contagem.slice(0, HIST).reduce((a, b) => a + b, 0)} em andamento`}
            </p>
          </div>
          <ModoSeletor modo={props.modo} onChange={props.onModo} />
          <div className="flex-1" />
          <button type="button" onClick={() => setBuscaAberta(v => !v)} aria-expanded={buscaAberta}
            aria-label={buscaAberta ? "Fechar busca" : "Buscar pedido ou filtrar por data"}
            className="pm-icone relative" data-ativo={buscaAberta || filtroAtivo ? "1" : undefined}>
            {buscaAberta ? <X size={22} /> : <Search size={22} />}
            {filtroAtivo && !buscaAberta && <span className="pm-ponto" />}
          </button>
          <button type="button" onClick={trocarLetra} className="pm-icone"
            aria-label={letra === 0 ? "Aumentar a letra" : letra === 1 ? "Aumentar mais a letra" : "Voltar a letra ao normal"}
            data-ativo={letra > 0 ? "1" : undefined}>
            <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: "-0.02em" }}>
              A<span style={{ fontSize: 13 }}>a</span>{letra > 0 && <sup style={{ fontSize: 11, marginLeft: 1 }}>{letra === 1 ? "+" : "++"}</sup>}
            </span>
          </button>
          <button type="button" onClick={() => setVerHist(v => !v)} className="pm-btn-sec pm-so-desk"
            data-ativo={verHist ? "1" : undefined} style={{ minHeight: 48, padding: "0 16px", fontSize: 15 }}>
            {verHist ? <><ChevronRight size={18} style={{ transform: "rotate(180deg)" }} /> Voltar ao quadro</> : <><History size={18} /> Histórico ({contagem[HIST]})</>}
          </button>
          <button type="button" onClick={props.onNovoPedido} className="pm-novo pm-so-desk">
            <Plus size={20} strokeWidth={3} /> Novo pedido
          </button>
        </div>

        {buscaAberta && (
          <div className="pm-busca space-y-2">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--pm-muted)" }} />
              <input type="search" value={busca} onChange={e => setBusca(e.target.value)} autoFocus
                placeholder="Nome do cliente, endereço, item..." autoComplete="off" enterKeyHint="search"
                className="w-full rounded-xl outline-none pm-campo"
                style={{ paddingLeft: 40, paddingRight: busca ? 48 : 14, fontSize: 16 }} />
              {busca && (
                <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca"
                  className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center"
                  style={{ width: 44, height: 44, color: "var(--text-2)" }}>
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="flex items-end gap-2">
              <Calendar size={18} style={{ color: "var(--pm-muted)", flexShrink: 0, marginBottom: 15 }} />
              <label className="flex-1 min-w-0">
                <span className="block font-semibold" style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 2 }}>De</span>
                <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)}
                  className="w-full rounded-xl outline-none pm-campo" style={{ fontSize: 16, padding: "0 10px", colorScheme: "light dark" }} />
              </label>
              <label className="flex-1 min-w-0">
                <span className="block font-semibold" style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 2 }}>Até</span>
                <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)}
                  className="w-full rounded-xl outline-none pm-campo" style={{ fontSize: 16, padding: "0 10px", colorScheme: "light dark" }} />
              </label>
            </div>
            {filtroAtivo && (
              <div className="flex items-center justify-between gap-2">
                <span style={{ fontSize: 14, color: "var(--text-2)" }}>{pedidos.length} de {totalPedidos} pedidos</span>
                <button type="button" onClick={() => { setBusca(""); setDataDe(""); setDataAte(""); }}
                  className="pm-btn-sec" style={{ minHeight: 44, padding: "0 14px", fontSize: 14 }}>
                  <X size={16} /> Limpar filtros
                </button>
              </div>
            )}
          </div>
        )}

        {filtroAtivo && !buscaAberta && (
          <button type="button" onClick={() => setBuscaAberta(true)} className="pm-aviso-filtro">
            <Search size={15} /> Filtro ligado — mostrando {pedidos.length} de {totalPedidos}. Toque para mudar.
          </button>
        )}

        {/* Abas sincronizadas com os painéis (celular) */}
        <div className="pm-abas" role="tablist" aria-label="Etapas do pedido">
          {COLS.map((c, i) => {
            const ativo = colAtual === i;
            return (
              <button key={c.label} type="button" role="tab" aria-selected={ativo} onClick={() => irPara(i)}
                className="pm-aba" data-ativo={ativo ? "1" : undefined} data-tom={c.tom}>
                <span className="pm-aba-n">{contagem[i]}</span>
                <span className="pm-aba-l"><span className="pm-dot" data-tom={c.tom} />{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Quadro ── */}
      <div ref={quadroRef} className="pm-quadro" onScroll={aoDeslizar}>
        {COLS.map((c, i) => (
          <section key={c.label} className="pm-col" data-hist={i === HIST ? "1" : undefined} aria-label={c.label}>
            <div className="pm-col-cab">
              <span className="pm-dot" data-tom={c.tom} />
              <span className="font-extrabold" style={{ fontSize: 15, color: "var(--text-1)" }}>{c.label}</span>
              <span className="pm-col-n">{contagem[i]}</span>
            </div>
            <div className="pm-col-lista">
              {listas[i].length === 0 ? (
                <Vazio texto={c.vazio} filtro={filtroAtivo}
                  outra={COLS.map((o, j) => ({ j, o })).find(({ j }) => j !== i && j < HIST && contagem[j] > 0)}
                  contagem={contagem} onIr={irPara} />
              ) : listas[i].map(p => (
                <CardQuadro key={p.id} p={p} props={props} foco={foco === p.id}
                  onAbrir={() => setDetalheId(p.id)}
                  onPasso={passo => executar(p, passo, false)}
                  onEscolherMotoboy={() => setMotoboyDe({ pedido: p, modo: "enviar" })} />
              ))}
              {i === HIST && histAntigos.length > verMaisHist && (
                <button type="button" onClick={() => setVerMaisHist(v => v + 20)} className="pm-btn-sec w-full"
                  style={{ minHeight: 52, fontSize: f(16) }}>
                  Ver mais — dias anteriores ({histAntigos.length - verMaisHist})
                </button>
              )}
            </div>
          </section>
        ))}
      </div>

      {/* ── + Novo pedido (fixo embaixo, celular) ── */}
      <div className="pm-fab-wrap">
        <button type="button" onClick={props.onNovoPedido} className="pm-fab">
          <Plus size={24} strokeWidth={3} /> Novo pedido
        </button>
      </div>

      {/* ── Detalhe do pedido ── */}
      {detalhe && (
        <Sheet titulo={detalhe.cliente_nome} onFechar={() => setDetalheId(null)} largo
          topo={(
            <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
              <span className="font-black" style={{ fontSize: f(16), color: "var(--text-1)" }}>{numeroPedido(detalhe)}</span>
              <Pilula p={detalhe} />
            </div>
          )}>
          <Detalhe p={detalhe} props={props}
            onMais={() => setMenuDe(detalhe)}
            onEscolherMotoboy={() => setMotoboyDe({ pedido: detalhe, modo: "enviar" })}
            onPasso={passo => executar(detalhe, passo, true)} />
        </Sheet>
      )}

      {/* ── Menu "Mais" ── */}
      {menuDe && (() => {
        const p = pedidos.find(x => x.id === menuDe.id) ?? menuDe;
        const tel = telefoneLigar(p.cliente_telefone);
        const saiu = (p.status === "em_coleta" || p.status === "em_rota_de_entrega") && !!p.motoboy_id;
        const podeCancelar = p.status === "em_fila" || p.status === "em_preparo" || p.status === "finalizado";
        const fechar = () => setMenuDe(null);
        const fecharTudo = () => { setMenuDe(null); setDetalheId(null); };
        return (
          <Sheet titulo={p.cliente_nome} subtitulo="O que você quer fazer com este pedido?" onFechar={fechar} acima>
            <ItemMenu icone={<Printer size={22} />} texto="Imprimir pedido" onClick={() => { fechar(); props.onPrint(p); }} />
            <div className="pm-wa"><AvisarWhatsApp pedido={p} loja={empresaNome} grande /></div>
            {tel && <ItemMenu icone={<Phone size={22} />} texto={`Ligar para o cliente (${p.cliente_telefone})`} href={`tel:${tel}`} onClick={fechar} />}
            <ItemMenu icone={<Pencil size={22} />} texto="Editar pedido" onClick={() => { fecharTudo(); props.onEdit(p); }} />
            {saiu && (
              <>
                <ItemMenu icone={<RefreshCw size={22} />} texto="Trocar motoboy" onClick={() => { fechar(); setMotoboyDe({ pedido: p, modo: "trocar" }); }} />
                <ItemMenu icone={<Undo2 size={22} />}
                  texto={p.route_id ? "Cancelar a rota (volta para Pronto)" : "Devolver motoboy (volta para Pronto)"}
                  carregando={cancelandoDespacho === p.id}
                  onClick={async () => { await props.onDevolverFila(p); fecharTudo(); }} />
              </>
            )}
            {podeCancelar && (
              <ItemMenu icone={<XCircle size={22} />} texto="Cancelar pedido" perigo onClick={() => { fechar(); setCancelarDe(p); }} />
            )}
            <ItemMenu icone={<Trash2 size={22} />} texto="Excluir pedido" perigo onClick={() => { fecharTudo(); props.onDelete(p); }} />
          </Sheet>
        );
      })()}

      {/* ── Escolher motoboy ── */}
      {motoboyDe && (
        <Sheet acima
          titulo={motoboyDe.modo === "enviar" ? "Enviar para qual motoboy?" : "Trocar para qual motoboy?"}
          subtitulo={`Pedido de ${motoboyDe.pedido.cliente_nome}`}
          onFechar={() => setMotoboyDe(null)}>
          {motoboysDisp.length === 0 ? (
            <div className="text-center" style={{ padding: "8px 4px 4px" }}>
              <Bike size={36} style={{ color: "var(--pm-muted)", margin: "0 auto 8px" }} />
              <p className="font-bold" style={{ fontSize: f(17), color: "var(--text-1)" }}>Nenhum motoboy disponível agora</p>
              <p style={{ fontSize: f(15), color: "var(--text-2)", margin: "4px 0 14px" }}>
                Quando um motoboy ficar livre ele aparece aqui. Se o pedido já foi entregue, use o botão &quot;Entregue&quot;.
              </p>
              <button type="button" onClick={recarregarMotoboys} className="pm-btn-sec w-full" style={{ minHeight: 52, fontSize: f(16) }}>
                {recarregandoMb ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />} Atualizar lista
              </button>
            </div>
          ) : motoboysDisp.map((mb, i) => {
            const ocupado = sendingTo === motoboyDe.pedido.id || trocandoMb === motoboyDe.pedido.id;
            return (
              <button key={mb.id} type="button" disabled={ocupado}
                onClick={async () => {
                  const alvo = motoboyDe;
                  setMotoboyDe(null);
                  setDetalheId(null);
                  if (alvo.modo === "enviar") await props.onEnviarMotoboy(alvo.pedido.id, mb.id);
                  else await props.onTrocarMotoboy(alvo.pedido, mb.id);
                }}
                className="w-full flex items-center gap-3 text-left rounded-2xl"
                style={{
                  minHeight: 64, padding: "10px 14px", marginBottom: 8,
                  background: i === 0 ? "var(--pm-orange-bg)" : "var(--bg-2)",
                  border: i === 0 ? "2px solid var(--pm-orange)" : "1px solid var(--border-2)",
                  color: "var(--text-1)",
                }}>
                <span className="flex items-center justify-center shrink-0" style={{ width: 44, height: 44, borderRadius: 12, background: i === 0 ? "#c2410c" : "var(--bg-3)" }}>
                  <Bike size={22} color={i === 0 ? "#fff" : "currentColor"} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-extrabold truncate" style={{ fontSize: f(18) }}>{mb.nome}</span>
                  {i === 0 && <span className="block font-bold" style={{ fontSize: f(14), color: "var(--pm-orange)" }}>Da vez — próximo da fila</span>}
                </span>
                {i === 0 && <Zap size={20} style={{ color: "var(--pm-orange)" }} />}
              </button>
            );
          })}
        </Sheet>
      )}

      {/* ── Confirmar cancelamento ── */}
      {cancelarDe && (
        <Sheet acima titulo="Cancelar este pedido?" onFechar={() => !cancelando && setCancelarDe(null)}>
          <div className="rounded-2xl" style={{ padding: 14, background: "var(--bg-2)", border: "1px solid var(--border-2)", marginBottom: 14 }}>
            <p className="font-extrabold" style={{ fontSize: f(18), color: "var(--text-1)" }}>{numeroPedido(cancelarDe)} · {cancelarDe.cliente_nome}</p>
            <p style={{ fontSize: f(15), color: "var(--text-2)", marginTop: 2 }}>
              {rs(cancelarDe.valor_pedido + cancelarDe.valor_motoboy)} · feito às {hora(cancelarDe.created_at)}
            </p>
          </div>
          <p style={{ fontSize: f(16), color: "var(--text-1)", marginBottom: 14 }}>
            O pedido vai para o Histórico como <b>cancelado</b>. Avise o cliente se precisar.
          </p>
          <button type="button" onClick={confirmarCancelamento} disabled={cancelando}
            className="w-full flex items-center justify-center gap-2 rounded-2xl font-extrabold"
            style={{ minHeight: 56, fontSize: f(17), background: "#b91c1c", color: "#fff", border: "none", marginBottom: 10 }}>
            {cancelando ? <Loader2 size={20} className="animate-spin" /> : <XCircle size={20} />}
            Sim, cancelar o pedido
          </button>
          <button type="button" onClick={() => setCancelarDe(null)} disabled={cancelando} className="pm-btn-sec w-full"
            style={{ minHeight: 56, fontSize: f(17) }}>
            Não, voltar
          </button>
        </Sheet>
      )}
    </div>
  );
}

// ── Card compacto do quadro ─────────────────────────────────────────────
function Pilula({ p }: { p: Pedido }) {
  const { texto, tom } = pilula(p);
  return <span className="pm-pilula" data-tom={tom}>{texto}</span>;
}

function corUrgencia(min: number): "green" | "amber" | "red" {
  return min > 30 ? "red" : min >= 15 ? "amber" : "green";
}

function CardQuadro({ p, props, foco, onAbrir, onPasso, onEscolherMotoboy }: {
  p: Pedido; props: Props; foco: boolean; onAbrir: () => void; onPasso: (passo: Passo) => void; onEscolherMotoboy: () => void;
}) {
  const final = p.status === "entregue" || p.status === "cancelado";
  const idadeMin = (props.now - new Date(p.created_at).getTime()) / 60_000;
  const isNew = props.highlightedOrders.has(p.id);
  const retirada = p.tipo_pedido === "retirada";
  const { principal } = passos(p, props, onEscolherMotoboy);
  const mesmoDia = new Date(quando(p)).toDateString() === new Date(props.now).toDateString();

  return (
    <article id={`pm-card-${p.id}`} className="pm-card" role="button" tabIndex={0}
      aria-label={`Pedido ${numeroPedido(p)} de ${p.cliente_nome}. Toque para ver os detalhes`}
      data-novo={isNew ? "1" : undefined} data-foco={foco ? "1" : undefined}
      onClick={onAbrir} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(); } }}>
      <div className="flex items-center gap-2">
        <span className="pm-num">{numeroPedido(p)}</span>
        {isNew && <span className="pm-pilula" data-tom="novo">NOVO</span>}
        <span className="flex-1" />
        <Pilula p={p} />
      </div>
      <div className="flex items-center gap-1.5 pm-nome">
        <span className="truncate">{nomeCurto(p.cliente_nome)}</span>
        <span className="pm-tipo" title={retirada ? "Retirada no balcão" : "Delivery"}>
          {retirada ? <Store size={14} /> : <Truck size={14} />}{retirada ? "Retirada" : "Delivery"}
        </span>
      </div>
      {p.descricao_itens && <p className="pm-resumo">{resumoItens(p.descricao_itens)}</p>}
      {p.observacoes && <p className="pm-tem-obs"><StickyNote size={13} /> Tem observação</p>}
      <div className="flex items-center gap-2 pm-rodape">
        <span className="pm-valor">{rs(p.valor_pedido + p.valor_motoboy)}</span>
        <span className="flex-1" />
        {final ? (
          <span className="pm-hora">{mesmoDia ? hora(p.updated_at ?? p.created_at) : new Date(quando(p)).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
        ) : (
          <span className="pm-tempo" data-cor={corUrgencia(idadeMin)} title={`Pedido feito às ${hora(p.created_at)}`}>
            <Clock size={14} /> {tempoDecorrido(idadeMin)}
          </span>
        )}
      </div>
      {/* Desktop: avançar direto do card */}
      {principal && (
        <button type="button" className="pm-card-passo" disabled={principal.carregando}
          onClick={e => { e.stopPropagation(); onPasso(principal); }}>
          {principal.carregando ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
          {principal.curto}
        </button>
      )}
    </article>
  );
}

// ── Detalhe (bottom sheet / painel lateral) ─────────────────────────────
function Detalhe({ p, props, onMais, onEscolherMotoboy, onPasso }: {
  p: Pedido; props: Props; onMais: () => void; onEscolherMotoboy: () => void; onPasso: (passo: Passo) => void;
}) {
  const retirada = p.tipo_pedido === "retirada";
  const final = p.status === "entregue" || p.status === "cancelado";
  const idadeMin = (props.now - new Date(p.created_at).getTime()) / 60_000;
  const total = p.valor_pedido + p.valor_motoboy;
  const linhas = (p.descricao_itens ?? "").split("\n").map(l => l.trim()).filter(Boolean);
  const pgto = p.forma_pagamento ? (PGTO[p.forma_pagamento] ?? p.forma_pagamento) : null;
  const levarTroco = p.forma_pagamento === "dinheiro" && p.troco_para && p.troco_para > total ? p.troco_para - total : 0;
  const { principal, secundario } = passos(p, props, onEscolherMotoboy);

  return (
    <div>
      {/* Tempo + tipo */}
      <div className="flex items-center gap-2 flex-wrap">
        {final ? (
          <span className="pm-chip">{p.status === "cancelado" ? "Cancelado" : retirada ? "Retirado" : "Entregue"} · {hora(p.updated_at ?? p.created_at)}</span>
        ) : (
          <span className="pm-tempo pm-tempo-grande" data-cor={corUrgencia(idadeMin)}>
            <Clock size={16} /> {idadeMin < 1 ? "agora" : `há ${tempoDecorrido(idadeMin)}`}
          </span>
        )}
        <span className="pm-chip" data-tipo={retirada ? "retirada" : "delivery"}>
          {retirada ? <Store size={16} /> : <Truck size={16} />}
          {retirada ? "Retirada no balcão" : "Delivery"}
        </span>
        {p.origem === "catalogo" && <span className="pm-chip"><ShoppingBag size={14} /> Cardápio online</span>}
        <span style={{ fontSize: f(14), color: "var(--text-2)" }}>feito às {hora(p.created_at)}</span>
      </div>

      {/* Itens */}
      {linhas.length > 0 && (
        <ul className="pm-itens">
          {linhas.map((l, i) => {
            const it = parseItemLine(l);
            if (!it) return <li key={i} style={{ fontSize: f(16), fontWeight: 600 }}>{l}</li>;
            return (
              <li key={i}>
                <div className="flex items-baseline gap-2">
                  <span className="flex-1 min-w-0" style={{ fontSize: f(16), fontWeight: 800 }}>
                    <span style={{ color: "var(--pm-orange)" }}>{it.qtd}x</span> {it.nome}
                  </span>
                  <span className="shrink-0" style={{ fontSize: f(14), color: "var(--text-2)", fontWeight: 600 }}>R$ {it.preco}</span>
                </div>
                {it.detalhes.map((d, j) => <div key={`d${j}`} className="pm-sub">{d}</div>)}
                {it.sabores.length > 0 && (
                  <div className="pm-sub">
                    <b>{tituloSabores(it).replace(":", "").toLowerCase().replace(/^./, c => c.toUpperCase())}:</b>{" "}
                    {it.sabores.map((s, k) => `${it.sabores.length > 1 ? marcaSabor(it, k).trim() + " " : ""}${s}`).join("  ·  ")}
                  </div>
                )}
                {it.adicionais.map((a, j) => <div key={`a${j}`} className="pm-sub">+ {a}</div>)}
              </li>
            );
          })}
        </ul>
      )}

      {/* Observações */}
      {p.observacoes && (
        <div className="pm-obs"><b>Observação:</b> {p.observacoes}</div>
      )}

      {/* Total + pagamento */}
      <div style={{ marginTop: 12 }}>
        <div className="flex items-end justify-between gap-2">
          <span style={{ fontSize: f(15), fontWeight: 700, color: "var(--text-2)" }}>Total</span>
          <span style={{ fontSize: f(24), fontWeight: 900, color: "var(--text-1)", lineHeight: 1 }}>{rs(total)}</span>
        </div>
        {p.valor_motoboy > 0 && (
          <p style={{ fontSize: f(13.5), color: "var(--text-2)", textAlign: "right", marginTop: 2 }}>
            produtos {rs(p.valor_pedido)} + entrega {rs(p.valor_motoboy)}
          </p>
        )}
        <div className="pm-pgto" data-pago={p.forma_pagamento === "ja_pago" ? "1" : undefined}>
          {p.forma_pagamento === "dinheiro" ? <Banknote size={20} /> : p.forma_pagamento === "pix" ? <QrCode size={20} /> : p.forma_pagamento === "ja_pago" ? <CheckCircle size={20} /> : <CreditCard size={20} />}
          <span className="min-w-0">
            <span className="block">
              {pgto ?? "Pagamento não informado"}
              {p.forma_pagamento === "dinheiro" && p.troco_para ? ` — troco para ${rs(p.troco_para)}` : ""}
            </span>
            {levarTroco > 0 && <span className="block" style={{ fontSize: f(14), fontWeight: 700 }}>Levar {rs(levarTroco)} de troco</span>}
          </span>
        </div>
      </div>

      {/* Endereço */}
      {!retirada && (
        <div style={{ marginTop: 12 }}>
          <div className="flex items-start gap-2" style={{ fontSize: f(15.5), color: "var(--text-1)", fontWeight: 600 }}>
            <MapPin size={20} style={{ color: "var(--pm-red)", flexShrink: 0, marginTop: 1 }} />
            <span className="min-w-0 break-words">
              {p.endereco_entrega}
              {p.distancia_km != null && <span style={{ color: "var(--text-2)", fontWeight: 600 }}> · {p.distancia_km.toFixed(1).replace(".", ",")} km</span>}
            </span>
          </div>
          {!final && (
            <div className="grid grid-cols-2 gap-2" style={{ marginTop: 8 }}>
              <a href={linkMapa(p, "google")} target="_blank" rel="noopener noreferrer" className="pm-btn-sec" style={{ minHeight: 48, fontSize: f(15) }}>
                <Navigation size={18} /> Abrir no mapa
              </a>
              <a href={linkMapa(p, "waze")} target="_blank" rel="noopener noreferrer" className="pm-btn-sec" style={{ minHeight: 48, fontSize: f(15) }}>
                <Navigation size={18} /> Waze
              </a>
            </div>
          )}
        </div>
      )}

      {/* Motoboy */}
      {p.motoboy && (
        <div className="flex items-center gap-2" style={{ marginTop: 10, fontSize: f(16), fontWeight: 700, color: "var(--text-1)" }}>
          <Bike size={20} style={{ color: "var(--pm-orange)" }} /> Motoboy: {p.motoboy.nome}
        </div>
      )}

      {/* Ações */}
      <div className="pm-acoes space-y-2">
        {principal && (
          <button type="button" onClick={() => onPasso(principal)} disabled={principal.carregando}
            className="pm-btn-principal" style={{ background: principal.cor }}>
            {principal.carregando ? <Loader2 size={22} className="animate-spin" /> : principal.icone}
            {principal.texto}
          </button>
        )}
        <div className="flex gap-2">
          {secundario && (
            <button type="button" onClick={() => onPasso(secundario)} disabled={secundario.carregando}
              className="pm-btn-sec flex-1" style={{ minHeight: 52, fontSize: f(16), color: "var(--pm-green)", borderColor: "var(--pm-green)" }}>
              {secundario.carregando ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
              {secundario.texto}
            </button>
          )}
          <button type="button" onClick={onMais} className="pm-btn-sec flex-1" style={{ minHeight: 52, fontSize: f(16) }}
            aria-label={`Mais ações do pedido de ${p.cliente_nome}`}>
            <MoreHorizontal size={22} /> Mais
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Peças pequenas ──────────────────────────────────────────────────────
function Vazio({ texto, filtro, outra, contagem, onIr }: {
  texto: string; filtro: boolean; outra?: { j: number; o: (typeof COLS)[number] }; contagem: number[]; onIr: (i: number) => void;
}) {
  return (
    <div className="pm-vazio flex flex-col items-center text-center">
      <Inbox size={36} style={{ color: "var(--pm-muted)" }} />
      <p className="font-bold" style={{ fontSize: f(16), color: "var(--text-1)", marginTop: 8 }}>{texto}</p>
      {filtro && <p style={{ fontSize: f(14), color: "var(--text-2)", marginTop: 4 }}>A busca está ligada — pode haver pedidos escondidos.</p>}
      {outra && (
        <button type="button" onClick={() => onIr(outra.j)} className="pm-btn-sec pm-so-cel" style={{ minHeight: 52, fontSize: f(16), marginTop: 14, padding: "0 20px" }}>
          Ver {outra.o.label} ({contagem[outra.j]})
        </button>
      )}
    </div>
  );
}

function Sheet({ titulo, subtitulo, topo, onFechar, children, acima, largo }: {
  titulo: string; subtitulo?: string; topo?: React.ReactNode; onFechar: () => void; children: React.ReactNode; acima?: boolean; largo?: boolean;
}) {
  useEffect(() => {
    function esc(e: KeyboardEvent) { if (e.key === "Escape") onFechar(); }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onFechar]);
  return (
    <div className="pm-sheet-fundo" data-acima={acima ? "1" : undefined} onClick={e => e.target === e.currentTarget && onFechar()}>
      <div className="pm-sheet" data-largo={largo ? "1" : undefined} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="pm-alca" />
        <div className="flex items-start gap-2" style={{ marginBottom: 14 }}>
          <div className="flex-1 min-w-0">
            {topo}
            <p className="font-extrabold break-words" style={{ fontSize: f(20), color: "var(--text-1)", lineHeight: 1.25 }}>{titulo}</p>
            {subtitulo && <p style={{ fontSize: f(15), color: "var(--text-2)", marginTop: 2 }}>{subtitulo}</p>}
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="pm-icone"><X size={22} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ItemMenu({ icone, texto, onClick, href, perigo, carregando }: {
  icone: React.ReactNode; texto: string; onClick?: () => void; href?: string; perigo?: boolean; carregando?: boolean;
}) {
  const estilo: React.CSSProperties = { color: perigo ? "var(--pm-red)" : "var(--text-1)" };
  const conteudo = (
    <>
      <span className="flex items-center justify-center shrink-0" style={{ width: 28 }}>
        {carregando ? <Loader2 size={22} className="animate-spin" /> : icone}
      </span>
      <span className="flex-1 min-w-0">{texto}</span>
    </>
  );
  return href
    ? <a href={href} onClick={onClick} className="pm-item-menu" style={estilo}>{conteudo}</a>
    : <button type="button" onClick={onClick} disabled={carregando} className="pm-item-menu" style={estilo}>{conteudo}</button>;
}

// ── Estilos (variáveis do tema do painel + cores com contraste AA) ──────
const CSS = `
.pm-root {
  /* tema escuro (padrão do painel) */
  --pm-muted: #b8b8b8;
  --pm-col: #161616; --pm-col-borda: #262626;
  --pm-card: #202020; --pm-card-borda: #2e2e2e; --pm-sombra: 0 1px 2px rgba(0,0,0,0.4);
  --pm-green: #4ade80; --pm-green-bg: rgba(74,222,128,0.14);
  --pm-amber: #fbbf24; --pm-amber-bg: rgba(251,191,36,0.15);
  --pm-red:   #fca5a5; --pm-red-bg:   rgba(248,113,113,0.16);
  --pm-blue:  #93c5fd; --pm-blue-bg:  rgba(96,165,250,0.16);
  --pm-orange:#fdba74; --pm-orange-bg: rgba(251,146,60,0.14);
  --pm-gray:  #d4d4d4; --pm-gray-bg:  rgba(255,255,255,0.08);
  --pm-purple:#c4b5fd; --pm-purple-bg: rgba(167,139,250,0.14);
  --pm-dot-red: #f87171; --pm-dot-orange: #fb923c; --pm-dot-green: #4ade80; --pm-dot-blue: #60a5fa; --pm-dot-gray: #a3a3a3;
  --pm-obs-bg: rgba(250,204,21,0.13); --pm-obs-borda: #facc15; --pm-obs-txt: #fef08a;
  color: var(--text-1); background: var(--bg-base); min-height: 100%;
}
[data-theme="light"] .pm-root {
  --pm-muted: #475569;
  --pm-col: #e9edf2; --pm-col-borda: #e2e7ee;
  --pm-card: #ffffff; --pm-card-borda: #e5e9ef; --pm-sombra: 0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04);
  --pm-green: #166534; --pm-green-bg: #dcfce7;
  --pm-amber: #92400e; --pm-amber-bg: #fef3c7;
  --pm-red:   #b91c1c; --pm-red-bg:   #fee2e2;
  --pm-blue:  #1d4ed8; --pm-blue-bg:  #dbeafe;
  --pm-orange:#9a3412; --pm-orange-bg: #ffedd5;
  --pm-gray:  #334155; --pm-gray-bg:  #e2e8f0;
  --pm-purple:#6d28d9; --pm-purple-bg: #ede9fe;
  --pm-dot-red: #ef4444; --pm-dot-orange: #f59e0b; --pm-dot-green: #22c55e; --pm-dot-blue: #3b82f6; --pm-dot-gray: #94a3b8;
  --pm-obs-bg: #fef9c3; --pm-obs-borda: #eab308; --pm-obs-txt: #713f12;
}
.pm-so-desk { display: none !important; }
@media (min-width: 768px) { .pm-so-desk { display: inline-flex !important; } div.pm-so-desk { display: block !important; } .pm-so-cel { display: none !important; } }

/* ── Topo ── */
.pm-topo { position: sticky; top: var(--pm-topo-top, 0px); z-index: 30; background: var(--bg-base); border-bottom: 1px solid var(--border-2); }
.pm-barra { display: flex; align-items: center; gap: 8px; padding: 10px 16px 8px; flex-wrap: wrap; }
.pm-busca { padding: 0 16px 12px; max-width: 760px; }
.pm-aviso-filtro { width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; min-height: 40px; padding: 0 16px 8px; font-size: 14px; color: var(--pm-blue); font-weight: 700; background: transparent; border: none; }
@media (min-width: 768px) {
  .pm-topo { position: static; border-bottom: none; }
  .pm-barra { padding: 24px 24px 16px; gap: 10px; }
  .pm-busca, .pm-aviso-filtro { padding-left: 24px; padding-right: 24px; }
}
.pm-icone {
  width: 48px; height: 48px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center;
  background: var(--bg-1); border: 1px solid var(--border-2); color: var(--text-1); flex-shrink: 0;
}
.pm-icone[data-ativo] { border-color: var(--pm-blue); color: var(--pm-blue); }
.pm-ponto { position: absolute; top: 8px; right: 8px; width: 10px; height: 10px; border-radius: 99px; background: #E4002B; }
.pm-campo { min-height: 48px; background: var(--bg-1); border: 1px solid var(--border-2); color: var(--text-1); }
.pm-campo:focus { border-color: var(--pm-blue); }
.pm-campo::placeholder { color: var(--pm-muted); opacity: 1; }
.pm-novo {
  min-height: 48px; padding: 0 18px; border-radius: 14px; border: none; align-items: center; gap: 8px;
  background: #c8102e; color: #fff; font-size: 15px; font-weight: 800; box-shadow: 0 4px 14px rgba(200,16,46,0.3);
}

/* ── Abas (celular) ── */
.pm-abas { display: flex; gap: 5px; padding: 0 8px 10px; overflow-x: auto; scrollbar-width: none; }
.pm-abas::-webkit-scrollbar { display: none; }
@media (min-width: 768px) { .pm-abas { display: none; } }
.pm-aba {
  flex: 1 1 0; min-width: max-content; min-height: 60px; padding: 6px 4px; border-radius: 14px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  background: var(--bg-1); border: 1px solid var(--border-2); color: var(--text-1);
}
.pm-aba-n { font-size: calc(20px * var(--pm-esc)); font-weight: 900; line-height: 1.1; }
.pm-aba-l { display: inline-flex; align-items: center; gap: 4px; font-size: calc(12.5px * var(--pm-esc)); font-weight: 700; white-space: nowrap; letter-spacing: -0.01em; color: var(--text-2); }
.pm-aba[data-ativo] { background: var(--text-1); border-color: var(--text-1); }
.pm-aba[data-ativo] .pm-aba-n, .pm-aba[data-ativo] .pm-aba-l { color: var(--bg-1); }
.pm-dot { width: 8px; height: 8px; border-radius: 99px; flex-shrink: 0; display: inline-block; }
.pm-dot[data-tom="red"] { background: var(--pm-dot-red); } .pm-dot[data-tom="orange"] { background: var(--pm-dot-orange); }
.pm-dot[data-tom="green"] { background: var(--pm-dot-green); } .pm-dot[data-tom="blue"] { background: var(--pm-dot-blue); }
.pm-dot[data-tom="gray"] { background: var(--pm-dot-gray); }

/* ── Quadro ── */
.pm-quadro {
  display: flex; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain;
  scrollbar-width: none; align-items: flex-start;
}
.pm-quadro::-webkit-scrollbar { display: none; }
.pm-col { flex: 0 0 100%; min-width: 0; scroll-snap-align: start; scroll-snap-stop: always; padding: 12px 12px 4px; }
.pm-col-cab { display: none; align-items: center; gap: 8px; padding: 2px 4px 10px; }
.pm-col-n {
  margin-left: auto; min-width: 24px; height: 24px; padding: 0 7px; border-radius: 99px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 12.5px; font-weight: 800; background: var(--pm-card); color: var(--text-1); border: 1px solid var(--pm-card-borda);
}
.pm-col-lista { display: flex; flex-direction: column; gap: 10px; }
.pm-vazio { padding: 40px 16px; }
@media (min-width: 768px) {
  .pm-quadro { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; padding: 0 24px 24px; overflow: visible; }
  .pm-col { padding: 12px; border-radius: 16px; background: var(--pm-col); border: 1px solid var(--pm-col-borda); min-height: 65vh; }
  .pm-col-cab { display: flex; }
  .pm-col[data-hist] { display: none; }
  .pm-root[data-hist] .pm-col { display: none; }
  .pm-root[data-hist] .pm-col[data-hist] { display: block; grid-column: 1 / -1; min-height: 0; }
  .pm-root[data-hist] .pm-col[data-hist] .pm-col-lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .pm-vazio { padding: 24px 8px; }
  .pm-vazio svg { width: 28px; height: 28px; }
}

/* ── Card ── */
.pm-card {
  background: var(--pm-card); border: 1px solid var(--pm-card-borda); border-radius: 14px; padding: 14px;
  box-shadow: var(--pm-sombra); cursor: pointer; text-align: left; color: var(--text-1);
  scroll-margin-top: 200px; transition: box-shadow .2s, transform .1s, border-color .2s;
}
.pm-card:hover { box-shadow: 0 4px 14px rgba(15,23,42,0.12); }
.pm-card:active { transform: scale(0.99); }
.pm-card:focus-visible { outline: 3px solid var(--pm-blue); outline-offset: 2px; }
.pm-card[data-novo] { border: 2px solid var(--pm-dot-red); }
.pm-card[data-foco] { box-shadow: 0 0 0 4px var(--pm-dot-green); animation: pmPulso 1s ease 3; }
@keyframes pmPulso { 50% { box-shadow: 0 0 0 8px var(--pm-green-bg); } }
.pm-num { font-size: calc(17px * var(--pm-esc)); font-weight: 900; letter-spacing: -0.01em; }
.pm-nome { margin-top: 4px; font-size: calc(18px * var(--pm-esc)); font-weight: 800; min-width: 0; }
.pm-tipo { display: inline-flex; align-items: center; gap: 3px; margin-left: auto; flex-shrink: 0; font-size: calc(12.5px * var(--pm-esc)); font-weight: 700; color: var(--text-2); }
.pm-resumo { margin-top: 3px; font-size: calc(15px * var(--pm-esc)); color: var(--text-2); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.pm-tem-obs { margin-top: 6px; display: inline-flex; align-items: center; gap: 4px; font-size: calc(13px * var(--pm-esc)); font-weight: 800; padding: 2px 8px; border-radius: 99px; background: var(--pm-obs-bg); color: var(--pm-obs-txt); border: 1px solid var(--pm-obs-borda); }
.pm-rodape { margin-top: 10px; }
.pm-valor { font-size: calc(18px * var(--pm-esc)); font-weight: 900; }
.pm-hora { font-size: calc(14px * var(--pm-esc)); font-weight: 700; color: var(--text-2); }
.pm-pilula { font-size: calc(13px * var(--pm-esc)); font-weight: 800; padding: 3px 10px; border-radius: 99px; white-space: nowrap; }
.pm-pilula[data-tom="red"] { background: var(--pm-red-bg); color: var(--pm-red); }
.pm-pilula[data-tom="orange"] { background: var(--pm-amber-bg); color: var(--pm-amber); }
.pm-pilula[data-tom="green"] { background: var(--pm-green-bg); color: var(--pm-green); }
.pm-pilula[data-tom="blue"] { background: var(--pm-blue-bg); color: var(--pm-blue); }
.pm-pilula[data-tom="gray"] { background: var(--pm-gray-bg); color: var(--pm-gray); }
.pm-pilula[data-tom="novo"] { background: #b91c1c; color: #fff; }
.pm-tempo { display: inline-flex; align-items: center; gap: 4px; font-size: calc(14.5px * var(--pm-esc)); font-weight: 800; padding: 3px 9px; border-radius: 99px; white-space: nowrap; }
.pm-tempo-grande { font-size: calc(16px * var(--pm-esc)); padding: 5px 12px; }
.pm-tempo[data-cor="green"] { color: var(--pm-green); background: var(--pm-green-bg); }
.pm-tempo[data-cor="amber"] { color: var(--pm-amber); background: var(--pm-amber-bg); }
.pm-tempo[data-cor="red"]   { color: var(--pm-red);   background: var(--pm-red-bg); }
.pm-card-passo { display: none; }
@media (min-width: 768px) {
  .pm-card { padding: 12px; }
  .pm-num { font-size: calc(15px * var(--pm-esc)); }
  .pm-nome { font-size: calc(14.5px * var(--pm-esc)); font-weight: 700; }
  .pm-resumo { font-size: calc(13px * var(--pm-esc)); -webkit-line-clamp: 1; }
  .pm-valor { font-size: calc(14.5px * var(--pm-esc)); }
  .pm-tempo { font-size: calc(12.5px * var(--pm-esc)); padding: 2px 8px; }
  .pm-tempo-grande { font-size: calc(15px * var(--pm-esc)); }
  .pm-pilula { font-size: calc(11.5px * var(--pm-esc)); padding: 2px 9px; }
  .pm-card-passo {
    display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; margin-top: 10px; min-height: 34px;
    border-radius: 10px; font-size: 13px; font-weight: 800; background: var(--bg-2); color: var(--text-1); border: 1px solid var(--border-2);
  }
  .pm-card-passo:hover { border-color: var(--text-2); }
}

/* ── Detalhe ── */
.pm-chip {
  display: inline-flex; align-items: center; gap: 5px; font-size: calc(14px * var(--pm-esc)); font-weight: 700;
  padding: 4px 10px; border-radius: 99px; background: var(--bg-3); color: var(--text-1);
}
.pm-chip[data-tipo="delivery"]  { background: var(--pm-orange-bg); color: var(--pm-orange); }
.pm-chip[data-tipo="retirada"]  { background: var(--pm-purple-bg); color: var(--pm-purple); }
.pm-itens { margin-top: 12px; padding: 10px 12px; border-radius: 14px; background: var(--bg-2); border: 1px solid var(--border-1); display: flex; flex-direction: column; gap: 8px; color: var(--text-1); }
.pm-sub { font-size: calc(14.5px * var(--pm-esc)); color: var(--text-2); padding-left: 14px; margin-top: 1px; line-height: 1.35; }
.pm-obs {
  margin-top: 10px; padding: 10px 12px; border-radius: 14px; font-size: calc(16px * var(--pm-esc)); line-height: 1.35;
  background: var(--pm-obs-bg); border: 2px solid var(--pm-obs-borda); color: var(--pm-obs-txt);
}
.pm-pgto {
  margin-top: 8px; display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 14px;
  font-size: calc(16px * var(--pm-esc)); font-weight: 800; background: var(--bg-2); border: 1px solid var(--border-2); color: var(--text-1);
}
.pm-pgto[data-pago] { color: var(--pm-green); border-color: var(--pm-green); }
.pm-acoes { margin-top: 16px; position: sticky; bottom: calc(-16px - env(safe-area-inset-bottom)); padding: 10px 0 calc(16px + env(safe-area-inset-bottom)); margin-bottom: calc(-16px - env(safe-area-inset-bottom)); background: var(--bg-1); }
.pm-btn-principal {
  width: 100%; min-height: 56px; border-radius: 16px; border: none; color: #fff;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  font-size: calc(18px * var(--pm-esc)); font-weight: 900; letter-spacing: -0.01em;
  box-shadow: 0 2px 10px rgba(0,0,0,0.18);
}
.pm-btn-principal:disabled { opacity: .75; }
.pm-btn-principal:active, .pm-btn-sec:active, .pm-fab:active { transform: scale(0.98); }
.pm-btn-sec {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 14px;
  font-weight: 800; background: var(--bg-1); color: var(--text-1); border: 2px solid var(--border-2); text-decoration: none;
}
.pm-btn-sec[data-ativo] { border-color: var(--pm-blue); color: var(--pm-blue); }

/* ── + Novo pedido (celular) ── */
.pm-fab-wrap {
  position: sticky; z-index: 25; padding: 12px 12px 0;
  bottom: calc(80px + env(safe-area-inset-bottom));
  pointer-events: none;
}
@media (min-width: 768px) { .pm-fab-wrap { display: none; } }
.pm-fab {
  pointer-events: auto; width: 100%; min-height: 58px; border-radius: 18px; border: none;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: #c8102e; color: #fff; font-size: calc(18px * var(--pm-esc)); font-weight: 900;
  box-shadow: 0 6px 24px rgba(200,16,46,0.4), 0 2px 6px rgba(0,0,0,0.3);
}

/* ── Faixa de pedido novo ── */
.pm-banner {
  position: fixed; left: 0; right: 0; top: var(--pm-cab, 0px); z-index: 45; display: flex; align-items: stretch;
  background: #15803d; box-shadow: 0 6px 24px rgba(0,0,0,0.35); animation: pmDesce .25s ease;
}
@media (min-width: 768px) { .pm-banner { left: 240px; } }
.pm-sino { animation: pmSino 1s ease-in-out infinite; }
@keyframes pmSino { 0%,100% { transform: rotate(0); } 20% { transform: rotate(-14deg); } 40% { transform: rotate(12deg); } 60% { transform: rotate(-8deg); } 80% { transform: rotate(4deg); } }
@keyframes pmDesce { from { transform: translateY(-100%); } to { transform: none; } }

/* ── Bottom sheet (celular) / painel lateral (desktop) ── */
.pm-sheet-fundo { position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,0.6); display: flex; align-items: flex-end; justify-content: center; }
.pm-sheet-fundo[data-acima] { z-index: 85; }
.pm-sheet {
  width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; background: var(--bg-1); color: var(--text-1);
  border-radius: 24px 24px 0 0; border: 1px solid var(--border-2); border-bottom: none;
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom)); animation: pmSobe .2s ease;
}
.pm-alca { width: 44px; height: 5px; border-radius: 99px; background: var(--border-2); margin: 0 auto 12px; }
@keyframes pmSobe { from { transform: translateY(40px); opacity: .5; } to { transform: none; opacity: 1; } }
@media (min-width: 768px) {
  .pm-sheet-fundo { background: rgba(15,23,42,0.35); }
  .pm-sheet-fundo:not([data-acima]) { align-items: stretch; justify-content: flex-end; }
  .pm-sheet[data-largo] { max-width: 460px; max-height: none; height: 100%; border-radius: 0; border: none; border-left: 1px solid var(--border-2); padding: 20px 20px 0; animation: pmLado .2s ease; }
  .pm-sheet[data-largo] .pm-alca { display: none; }
  .pm-sheet-fundo[data-acima] { align-items: center; }
  .pm-sheet-fundo[data-acima] .pm-sheet { border-radius: 20px; border-bottom: 1px solid var(--border-2); max-width: 440px; padding-bottom: 16px; }
  .pm-sheet-fundo[data-acima] .pm-alca { display: none; }
  .pm-acoes { bottom: 0; margin-bottom: 0; padding-bottom: 20px; }
}
@keyframes pmLado { from { transform: translateX(40px); opacity: .5; } to { transform: none; opacity: 1; } }
.pm-item-menu {
  width: 100%; min-height: 56px; display: flex; align-items: center; gap: 12px; padding: 8px 12px; margin-bottom: 6px; line-height: 1.25;
  border-radius: 14px; background: var(--bg-2); border: 1px solid var(--border-2);
  font-size: calc(17px * var(--pm-esc)); font-weight: 700; text-align: left; text-decoration: none;
}
.pm-wa { margin-bottom: 6px; }
`;
