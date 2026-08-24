"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Minus, MapPin, Package, ChevronRight, Search, X,
  Calendar, Loader2, Clock, CheckCircle, Bike, Navigation,
  Trash2, AlertTriangle, Eye, EyeOff, Send, ShoppingBag, Truck, Pencil,
  Clipboard, Banknote, CreditCard, Zap, Phone, User, FileText, Image as ImageIcon, Printer,
  Bell, VolumeX,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { log } from "@/lib/auditoria";
import * as printService from "@/lib/printService";
import { playSound, getSoundId } from "@/lib/sounds";
import type { Pedido, PedidoStatus, Produto, ProdutoVariacao, ProdutoSabor, ProdutoAdicional } from "@/types";

interface CartItem {
  produto: Produto;
  variacao: ProdutoVariacao | null;
  sabores: ProdutoSabor[];
  adicionais: ProdutoAdicional[];
  qty: number;
  precoUnit: number;
  cartKey: string;
}

// ── Status config ─────────────────────────────────────────────────
const STEPS: PedidoStatus[] = ["em_fila", "em_preparo", "finalizado", "em_coleta", "em_rota_de_entrega", "aguardando_confirmacao", "entregue"];

const STATUS_CONFIG: Record<PedidoStatus, { label: string; color: string; bg: string; dot: string; step: number }> = {
  em_fila:                 { label: "Na fila",            color: "#94a3b8", bg: "rgba(148,163,184,0.1)", dot: "#64748b", step: 0 },
  em_preparo:              { label: "Em preparo",          color: "#fbbf24", bg: "rgba(251,191,36,0.1)",  dot: "#fbbf24", step: 1 },
  finalizado:              { label: "Finalizado",          color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  dot: "#3b82f6", step: 2 },
  em_coleta:               { label: "Em coleta",           color: "#fb923c", bg: "rgba(251,146,60,0.1)",  dot: "#f97316", step: 3 },
  em_rota_de_entrega:      { label: "Em rota",             color: "#a78bfa", bg: "rgba(167,139,250,0.1)", dot: "#8b5cf6", step: 4 },
  aguardando_confirmacao:  { label: "Aguard. confirmar",   color: "#f59e0b", bg: "rgba(245,158,11,0.12)", dot: "#d97706", step: 5 },
  entregue:                { label: "Entregue",            color: "#4ade80", bg: "rgba(74,222,128,0.1)",  dot: "#22c55e", step: 6 },
  cancelado:               { label: "Cancelado",           color: "#FF8C1A", bg: "rgba(248,113,113,0.1)", dot: "#FF6A00", step: -1 },
};

const STEP_COLORS = ["#64748b", "#fbbf24", "#60a5fa", "#f97316", "#8b5cf6", "#f59e0b", "#22c55e"];

const NEXT_ACTION: Partial<Record<PedidoStatus, { label: string; next: PedidoStatus; color: string; border: string }>> = {
  em_fila:                { label: "Iniciar preparo",     next: "em_preparo", color: "#fbbf24", border: "rgba(251,191,36,0.25)" },
  em_preparo:             { label: "Finalizar pedido",    next: "finalizado",  color: "#60a5fa", border: "rgba(96,165,250,0.25)" },
  aguardando_confirmacao: { label: "✓ Confirmar entrega", next: "entregue",    color: "#22c55e", border: "rgba(34,197,94,0.3)" },
};

const NEXT_ACTION_RETIRADA: Partial<Record<PedidoStatus, { label: string; next: PedidoStatus; color: string; border: string }>> = {
  em_fila:    { label: "Iniciar preparo",      next: "em_preparo", color: "#fbbf24", border: "rgba(251,191,36,0.25)" },
  em_preparo: { label: "Pronto para retirada", next: "finalizado",  color: "#60a5fa", border: "rgba(96,165,250,0.25)" },
  finalizado: { label: "Confirmar retirada",   next: "entregue",   color: "#22c55e", border: "rgba(34,197,94,0.25)"  },
};

function calcTaxaEntrega(km: number): number {
  const raw = 3 + 1.5 * km;
  return Math.round(raw * 2) / 2;
}

// ── Parser de pedido colado ───────────────────────────────────────
type FormaPagamentoOpt = "" | "dinheiro" | "cartao_credito" | "cartao_debito" | "pix" | "ja_pago";
interface ParsedOrder {
  nome: string; telefone: string; endereco: string; bairro: string;
  descricao_itens: string; observacoes: string;
  valor_pedido: string; troco_para: string; forma_pagamento: FormaPagamentoOpt;
}

function parsearPedido(texto: string): Partial<ParsedOrder> {
  const lines = texto.split("\n").map(l => l.trim()).filter(Boolean);
  const reRua   = /^(r\.\s*|rua\s+|av\.?\s+|avenida\s+|trav\.?\s+|travessa\s+|al\.\s*|alameda\s+|est\.\s+|estrada\s+|rod\.\s+|pç[ao]\s+|praça\s+|qd\s+|quadra\s+|vila\s+|vl\.\s*|con[dj]\s+)/i;
  const reNumR  = /,\s*\d+\s*(?:$|[,\-\/\s])/;
  const reQtd   = /^(\d+\s*)?x\s+\S/i;
  const reFone  = /\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/;
  const reTroco = /troco\s*(?:p\/|para|pra|de|:)?\s*R?\$?\s*([\d,]+)/i;
  const reValor = /R\$\s*([\d,.]+)/i;
  const rePgto  = /\b(pix|crédito|credito|débito|debito|dinheiro|cartão|cartao)\b/i;
  const reSem   = /^(sem\s|s\/|add\s|extra\s|com\s|obs[:\s])/i;

  const result: Partial<ParsedOrder> = {};
  const itens: string[] = [];
  const obs: string[] = [];
  let nomeDone = false;
  let endDone  = false;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    // Troco
    const mTroco = l.match(reTroco);
    if (mTroco) {
      result.troco_para = mTroco[1].replace(",", ".");
      result.forma_pagamento = "dinheiro";
      continue;
    }

    // Pagamento
    if (rePgto.test(l) && !reQtd.test(l) && l.length < 40) {
      if (/pix/i.test(l))                   result.forma_pagamento = "pix";
      else if (/cr[eé]dito/i.test(l))       result.forma_pagamento = "cartao_credito";
      else if (/d[eé]bito/i.test(l))        result.forma_pagamento = "cartao_debito";
      else if (/dinheiro/i.test(l))         result.forma_pagamento = "dinheiro";
      continue;
    }

    // Valor
    const mValor = l.match(reValor);
    if (mValor && !result.valor_pedido && !reQtd.test(l)) {
      result.valor_pedido = mValor[1].replace(/\./g, "").replace(",", ".");
      continue;
    }

    // Telefone
    const mFone = l.match(reFone);
    if (mFone && !result.telefone) {
      result.telefone = mFone[0].replace(/\s/g, "");
      continue;
    }

    // Endereço (rua conhecida OU nome + número após nome encontrado)
    if ((reRua.test(l) || (nomeDone && reNumR.test(l))) && !endDone) {
      result.endereco = l;
      endDone = true;
      // Linha seguinte sem dígito pode ser bairro
      if (i + 1 < lines.length) {
        const nxt = lines[i + 1];
        if (!/\d/.test(nxt) && !reQtd.test(nxt) && !reRua.test(nxt) && nxt.length < 60) {
          result.bairro = nxt;
          i++;
        }
      }
      continue;
    }

    // Itens (1x Hambúrguer)
    if (reQtd.test(l)) { itens.push(l); continue; }

    // Marcadores de observação
    if (reSem.test(l)) { obs.push(l); continue; }

    // Nome (primeira linha só com letras)
    if (!nomeDone && /^[A-Za-zÀ-ú\s.'-]+$/.test(l) && l.length >= 3 && l.length <= 60) {
      result.nome = l;
      nomeDone = true;
      continue;
    }

    // Resto → observações
    if (l.length > 0) obs.push(l);
  }

  if (itens.length) result.descricao_itens = itens.join("\n");
  if (obs.length)   result.observacoes = obs.join(", ");
  return result;
}

const FILTERS: { key: PedidoStatus | "todos"; label: string }[] = [
  { key: "todos",                  label: "Todos" },
  { key: "em_fila",                label: "Na fila" },
  { key: "em_preparo",             label: "Em preparo" },
  { key: "finalizado",             label: "Finalizados" },
  { key: "em_coleta",              label: "Em coleta" },
  { key: "em_rota_de_entrega",     label: "Em rota" },
  { key: "aguardando_confirmacao", label: "Confirmar" },
  { key: "entregue",               label: "Entregues" },
  { key: "cancelado",              label: "Cancelados" },
];

// ── Barra de progresso ────────────────────────────────────────────
function StatusProgress({ status }: { status: PedidoStatus }) {
  const step = STATUS_CONFIG[status].step;
  if (step < 0) return null;
  return (
    <div className="flex items-center gap-1 mt-3">
      {STEPS.map((_, i) => (
        <div
          key={i}
          className="h-1 flex-1 rounded-full transition-all duration-300"
          style={{ background: i <= step ? STEP_COLORS[i] : "var(--overlay-md)" }}
        />
      ))}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────
interface Props {
  pedidos: Pedido[];
  empresaId: string;
  empresaNome: string;
  empresaCodigo: string;
  empresaLat: number | null;
  empresaLng: number | null;
  empresaCidade: string | null;
  empresaEstado: string | null;
  autoDespacho: boolean;
  produtos: Produto[];
  modoCalculo: "maior_valor" | "proporcional";
  corPrincipal: string;
}

interface NewOrderBanner {
  lastClienteNome: string;
  count: number;
}

export default function PedidosClient({ pedidos: initial, empresaId, empresaNome, empresaCodigo, empresaLat, empresaLng, empresaCidade, empresaEstado, autoDespacho, produtos, modoCalculo, corPrincipal }: Props) {
  const cor = corPrincipal;
  const router  = useRouter();
  const supabase = createClient();

  // ── Notificações de novo pedido ──────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [newOrderBanner,   setNewOrderBanner]   = useState<NewOrderBanner | null>(null);
  const [highlightedOrders, setHighlightedOrders] = useState<Set<string>>(new Set());
  const [printToast,        setPrintToast]        = useState<{ ok: boolean; msg: string } | null>(null);

  // Cria AudioContext no mount e desbloqueia na primeira interação do usuário
  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    } catch { /* sem suporte */ }

    function unlock() {
      audioCtxRef.current?.resume().catch(() => {});
    }
    document.addEventListener("click",    unlock, { once: true });
    document.addEventListener("keydown",  unlock, { once: true });
    document.addEventListener("touchend", unlock, { once: true });
    return () => {
      document.removeEventListener("click",    unlock);
      document.removeEventListener("keydown",  unlock);
      document.removeEventListener("touchend", unlock);
    };
  }, []);

  function playNewOrderSound() {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      const id = getSoundId();
      if (ctx.state === "suspended") {
        ctx.resume().then(() => playSound(ctx, id)).catch(() => {});
      } else {
        playSound(ctx, id);
      }
    } catch { /* sem áudio */ }
  }

  function stopSound() {
    try { audioCtxRef.current?.suspend(); } catch { /* ignore */ }
  }

  // Pool de sabores agrupado por produto
  const saboresPorProduto = useMemo(() =>
    produtos
      .map(p => ({ produto: p, sabores: p.produto_sabores?.filter(s => s.ativo) ?? [] }))
      .filter(g => g.sabores.length > 0),
    [produtos],
  );
  const saborToProduto = useMemo(() => {
    const map = new Map<string, Produto>();
    saboresPorProduto.forEach(({ produto: p, sabores }) => {
      sabores.forEach(s => map.set(s.id, p));
    });
    return map;
  }, [saboresPorProduto]);

  // Pool de sabores vinculado: um produto só compartilha sabores com os
  // produtos específicos que o admin vinculou explicitamente a ele
  // (sabores_vinculo_ids) — nada automático por categoria, flag global ou
  // tipo. Sem vínculo, o produto mostra só os próprios sabores. Percorre a
  // cadeia de vínculos pra juntar todos os produtos conectados.
  function poolMesclavelPara(produto: Produto) {
    const visitados = new Set<string>([produto.id]);
    const fila = [produto.id];
    while (fila.length > 0) {
      const id = fila.shift()!;
      const p = produtos.find(x => x.id === id);
      (p?.sabores_vinculo_ids ?? []).forEach(outroId => {
        if (!visitados.has(outroId)) { visitados.add(outroId); fila.push(outroId); }
      });
    }
    return saboresPorProduto.filter(g => visitados.has(g.produto.id));
  }

  function precoByTamanhoNome(produto: Produto, nome: string): number {
    const cpTamanhos = produto.categoria_preco?.tamanhos;
    if (cpTamanhos) {
      const t = cpTamanhos.find(t => t.nome === nome);
      if (t) return t.preco;
    }
    const vars = produto.produto_variacoes?.filter(v => v.ativo) ?? [];
    const v = vars.find(v => v.nome === nome);
    if (v && v.preco > 0) return v.preco;
    return produto.preco;
  }

  function precoDeSabor(s: ProdutoSabor, precoBase: number, tamanhoNome?: string): number {
    if ((s.preco_adicional ?? 0) > 0) return s.preco_adicional!;
    if (tamanhoNome) {
      const src = saborToProduto.get(s.id);
      if (src) return precoByTamanhoNome(src, tamanhoNome);
    }
    return precoBase;
  }

  function calcularPrecoSabores(precos: number[]): number {
    if (precos.length === 0) return 0;
    return modoCalculo === "proporcional"
      ? precos.reduce((a, b) => a + b, 0) / precos.length
      : Math.max(...precos);
  }

  const [pedidos,    setPedidos]    = useState(initial);
  const [showForm,   setShowForm]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [advancing,  setAdvancing]  = useState<string | null>(null);
  const [filter,     setFilter]     = useState<PedidoStatus | "todos">("todos");
  const [busca,      setBusca]      = useState("");
  const [dataDe,     setDataDe]     = useState("");
  const [dataAte,    setDataAte]    = useState("");

  // ── Motoboys disponíveis (fila) ─────────────────────────────────
  const [motoboysDisp,   setMotoboysDisp]   = useState<{ id: string; nome: string; posicao_fila: number | null }[]>([]);
  const [dropdownPedido, setDropdownPedido] = useState<string | null>(null);
  const [sendingTo,      setSendingTo]      = useState<string | null>(null);

  // ── Editar pedido ───────────────────────────────────────────────
  const [editTarget,  setEditTarget]  = useState<Pedido | null>(null);
  const [editForm,    setEditForm]    = useState({
    cliente_nome: "", cliente_telefone: "", endereco_entrega: "",
    descricao_itens: "", valor_pedido: "", valor_motoboy: "",
    forma_pagamento: "" as "" | "dinheiro" | "cartao_credito" | "cartao_debito" | "pix" | "ja_pago",
    troco_para: "", observacoes: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  // ── Delete com senha ────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<Pedido | null>(null);
  const [deletePin,    setDeletePin]    = useState("");
  const [deletePinVisible, setDeletePinVisible] = useState(false);
  const [deleteError,  setDeleteError]  = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [form, setForm] = useState({
    tipo_pedido:      "entrega" as "entrega" | "retirada",
    cliente_nome:     "",
    cliente_telefone: "",
    endereco_entrega: "",
    descricao_itens:  "",
    valor_pedido:     "",
    valor_motoboy:    "",
    forma_pagamento:  "" as "" | "dinheiro" | "cartao_credito" | "cartao_debito" | "pix" | "ja_pago",
    troco_para:       "",
    observacoes:      "",
  });
  // ── Endereço manual ─────────────────────────────────────────────
  const [cidadeOrigem,  setCidadeOrigem]  = useState<"empresa" | "manual">("empresa");
  const [endManual, setEndManual] = useState({
    rua: "", numero: "", bairro: "", complemento: "", referencia: "",
    cidade: empresaCidade ?? "", estado: empresaEstado ?? "", routeAddress: "",
  });

  // ── Trocar / cancelar despacho ───────────────────────────────────
  const [trocaMbDropdown,   setTrocaMbDropdown]   = useState<string | null>(null);
  const [trocandoMb,        setTrocandoMb]        = useState<string | null>(null);
  const [cancelandoDespacho, setCancelandoDespacho] = useState<string | null>(null);
  const [marcandoEntregue,  setMarcandoEntregue]  = useState<string | null>(null);

  // ── Route builder ────────────────────────────────────────────────
  const [rotaPedidos,  setRotaPedidos]  = useState<Pedido[]>([]);
  const [routeMotoboy, setRouteMotoboy] = useState("");
  const [sendingRota,  setSendingRota]  = useState(false);

  // ── Carrinho de produtos ──────────────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [showCatalogoPicker, setShowCatalogoPicker] = useState(false);
  const [buscarProduto, setBuscarProduto] = useState("");
  const [catSel, setCatSel] = useState("Todos");

  // detail modal
  const [detailProduto,       setDetailProduto]       = useState<Produto | null>(null);
  const [detailVariacao,      setDetailVariacao]       = useState<ProdutoVariacao | null>(null);
  const [detailSaboresSel,    setDetailSaboresSel]     = useState<ProdutoSabor[]>([]);
  const [detailAdicionaisSel, setDetailAdicionaisSel] = useState<ProdutoAdicional[]>([]);
  const [detailQty,           setDetailQty]           = useState(1);
  const [detailStep,          setDetailStep]           = useState<"variacao" | "sabores" | "adicionais">("variacao");

  function cartBuildKey(pId: string, vId?: string, sIds?: string[], aIds?: string[]) {
    return [pId, vId ?? "", (sIds ?? []).slice().sort().join(","), (aIds ?? []).slice().sort().join(",")].join("|");
  }
  function cartDescItem(item: CartItem): string {
    const parts: string[] = [];
    if (item.variacao) parts.push(item.variacao.nome);
    if (item.sabores.length > 0) parts.push(item.sabores.map(s => s.nome).join("/"));
    if (item.adicionais.length > 0) parts.push(`+ ${item.adicionais.map(a => a.nome).join(", ")}`);
    return parts.join(" · ");
  }
  function cartPrecoVariacao(produto: Produto, variacao: ProdutoVariacao): number {
    const t = produto.categoria_preco?.tamanhos?.find(t => t.nome === variacao.nome);
    if (t) return t.preco;
    return variacao.preco > 0 ? variacao.preco : produto.preco;
  }
  function cartMaxSabores(produto: Produto, variacao: ProdutoVariacao): number {
    const t = produto.categoria_preco?.tamanhos?.find(t => t.nome === variacao.nome);
    return t ? t.max_sabores : variacao.max_sabores;
  }
  function cartHasCustom(p: Produto): boolean {
    return p.tipo === "pizza"
      || (p.produto_variacoes?.filter(v => v.ativo).length ?? 0) > 0
      || (p.produto_sabores?.filter(s => s.ativo).length ?? 0) > 0
      || (p.produto_adicionais?.filter(a => a.ativo).length ?? 0) > 0
      || poolMesclavelPara(p).some(g => g.sabores.length > 0);
  }
  function cartPrecoMin(p: Produto): number {
    const vars = p.produto_variacoes?.filter(v => v.ativo) ?? [];
    return vars.length > 0 ? Math.min(...vars.map(v => cartPrecoVariacao(p, v))) : p.preco;
  }
  function cartAdd(p: Produto) {
    const key = cartBuildKey(p.id);
    setCartItems(prev => {
      const ex = prev.find(i => i.cartKey === key);
      if (ex) return prev.map(i => i.cartKey === key ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { produto: p, variacao: null, sabores: [], adicionais: [], qty: 1, precoUnit: p.preco, cartKey: key }];
    });
  }
  function cartAddConfig(p: Produto, v: ProdutoVariacao | null, sabs: ProdutoSabor[], adds: ProdutoAdicional[], qty: number) {
    const key = cartBuildKey(p.id, v?.id, sabs.map(s => s.id), adds.map(a => a.id));
    const produtoPrecoBase = v ? cartPrecoVariacao(p, v) : p.preco;
    const tamanhoNome = v?.nome;
    const precoBase = sabs.length > 0
      ? calcularPrecoSabores(sabs.map(s => precoDeSabor(s, produtoPrecoBase, tamanhoNome)))
      : produtoPrecoBase;
    const precoUnit = precoBase + adds.reduce((s, a) => s + a.preco, 0);
    setCartItems(prev => {
      const ex = prev.find(i => i.cartKey === key);
      if (ex) return prev.map(i => i.cartKey === key ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { produto: p, variacao: v, sabores: sabs, adicionais: adds, qty, precoUnit, cartKey: key }];
    });
  }
  function cartRemove(cartKey: string) {
    setCartItems(prev => prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty - 1 } : i).filter(i => i.qty > 0));
  }
  function cartRemoveAll(cartKey: string) { setCartItems(prev => prev.filter(i => i.cartKey !== cartKey)); }
  function cartQty(id: string) { return cartItems.filter(i => i.produto.id === id).reduce((s, i) => s + i.qty, 0); }

  function openDetail(p: Produto) {
    const variacoes = p.produto_variacoes?.filter(v => v.ativo) ?? [];
    const sabores   = p.produto_sabores?.filter(s => s.ativo)   ?? [];
    setDetailProduto(p);
    setDetailVariacao(variacoes[0] ?? null);
    setDetailSaboresSel([]);
    setDetailAdicionaisSel([]);
    setDetailQty(1);
    const hasSaborStep = sabores.length > 0 || poolMesclavelPara(p).some(g => g.sabores.length > 0);
    if (variacoes.length > 0)    setDetailStep("variacao");
    else if (hasSaborStep)       setDetailStep("sabores");
    else                         setDetailStep("adicionais");
  }
  function confirmDetail() {
    if (!detailProduto) return;
    cartAddConfig(detailProduto, detailVariacao, detailSaboresSel, detailAdicionaisSel, detailQty);
    setDetailProduto(null);
  }

  // ── Colar pedido ─────────────────────────────────────────────────
  const [colarStep,   setColarStep]   = useState<"form" | "colar">("form");
  const [colarTexto,  setColarTexto]  = useState("");

  // ── Alerta de pedido parado + histórico de clientes ──────────────
  const [now,              setNow]              = useState(() => Date.now());
  const [clienteHistorico, setClienteHistorico] = useState<{ nome: string; telefone: string; endereco: string }[]>([]);
  const [clienteDropOpen,  setClienteDropOpen]  = useState(false);

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      // Fecha dropdowns de motoboys se clicar fora de qualquer .mb-dropdown
      const target = e.target as HTMLElement;
      if (!target.closest(".mb-dropdown")) { setDropdownPedido(null); setTrocaMbDropdown(null); }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Carrega motoboys disponíveis da empresa
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("motoboys")
        .select("id, nome, posicao_fila")
        .eq("empresa_id", empresaId)
        .eq("status", "disponivel")
        .order("posicao_fila", { ascending: true });
      setMotoboysDisp(data ?? []);
    }
    load();
  }, [empresaId]); // eslint-disable-line

  // Realtime: UPDATE → estado direto (instantâneo); INSERT/DELETE → router.refresh()
  useEffect(() => {
    const ch = supabase
      .channel(`pedidos-empresa-${empresaId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "pedidos",
        filter: `empresa_id=eq.${empresaId}`,
      }, (payload) => {
        const novo = payload.new as Pedido;
        setPedidos(prev => prev.map(p => p.id === novo.id ? { ...p, ...novo } : p));
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "pedidos",
        filter: `empresa_id=eq.${empresaId}`,
      }, (payload) => {
        const novo = payload.new as Pedido;
        if (novo.status === "em_fila") {
          playNewOrderSound();
          setNewOrderBanner(prev => ({
            lastClienteNome: novo.cliente_nome,
            count: (prev?.count ?? 0) + 1,
          }));
          setHighlightedOrders(prev => new Set([...prev, novo.id]));
          setTimeout(() => {
            setHighlightedOrders(prev => { const n = new Set(prev); n.delete(novo.id); return n; });
          }, 60_000);
        }
        router.refresh();
      })
      .on("postgres_changes", {
        event: "DELETE", schema: "public", table: "pedidos",
        filter: `empresa_id=eq.${empresaId}`,
      }, (payload) => {
        const old = payload.old as { id: string };
        setPedidos(prev => prev.filter(p => p.id !== old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [empresaId, router, supabase]);

  // Sincroniza props quando página revalida (INSERT dispara refresh)
  useEffect(() => { setPedidos(initial); }, [initial]);

  // Atualiza 'now' a cada minuto para calcular pedidos parados
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Carrega histórico de clientes para autocomplete
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("pedidos")
        .select("cliente_nome, cliente_telefone, endereco_entrega")
        .eq("empresa_id", empresaId)
        .neq("status", "cancelado")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!data) return;
      const seen = new Set<string>();
      const hist: { nome: string; telefone: string; endereco: string }[] = [];
      for (const p of data) {
        const key = p.cliente_nome.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          hist.push({ nome: p.cliente_nome, telefone: p.cliente_telefone, endereco: p.endereco_entrega });
        }
      }
      setClienteHistorico(hist.slice(0, 40));
    }
    load();
  }, [empresaId]); // eslint-disable-line

  // ── Endereço manual helpers ──────────────────────────────────────
  function updateEndManual(key: keyof typeof endManual, val: string) {
    setEndManual(e => {
      const next = { ...e, [key]: val };
      if (key !== "routeAddress") {
        const street = [next.rua, next.numero].filter(Boolean).join(", ");
        const streetWithBairro = street + (next.bairro ? ` - ${next.bairro}` : "");
        const extras = [next.complemento, next.referencia ? `Ref: ${next.referencia}` : ""].filter(Boolean).join(", ");
        next.routeAddress = [streetWithBairro + (extras ? `. ${extras}` : ""), next.cidade, next.estado]
          .filter(Boolean).join(", ");
      }
      return next;
    });
  }

  useEffect(() => {
    if (cartItems.length === 0) return;
    const total = cartItems.reduce((s, i) => s + i.precoUnit * i.qty, 0);
    setForm(f => ({ ...f, valor_pedido: total.toFixed(2) }));
  }, [cartItems]);

  function resetForm() {
    setShowForm(false);
    setColarStep("form");
    setColarTexto("");
    setCartItems([]);
    setForm({ tipo_pedido: "entrega", cliente_nome: "", cliente_telefone: "", endereco_entrega: "", descricao_itens: "", valor_pedido: "", valor_motoboy: "", forma_pagamento: "", troco_para: "", observacoes: "" });
    setCidadeOrigem("empresa");
    setEndManual({ rua: "", numero: "", bairro: "", complemento: "", referencia: "", cidade: empresaCidade ?? "", estado: empresaEstado ?? "", routeAddress: "" });
  }

  function aplicarColar(parsed: Partial<ParsedOrder>) {
    setForm(f => ({
      ...f,
      ...(parsed.nome             && { cliente_nome:    parsed.nome }),
      ...(parsed.telefone         && { cliente_telefone: parsed.telefone }),
      ...(parsed.descricao_itens  && { descricao_itens:  parsed.descricao_itens }),
      ...(parsed.observacoes      && { observacoes:      parsed.observacoes }),
      ...(parsed.valor_pedido     && { valor_pedido:     parsed.valor_pedido }),
      ...(parsed.troco_para       && { troco_para:       parsed.troco_para }),
      ...(parsed.forma_pagamento  && { forma_pagamento:  parsed.forma_pagamento }),
    }));
    if (parsed.endereco && form.tipo_pedido === "entrega") {
      const m = parsed.endereco.match(/^(.+?),\s*(\d+[^\s,]*)/);
      if (m) {
        const rua      = m[1].trim();
        const numero   = m[2].trim();
        const bairroV  = parsed.bairro ?? "";
        setEndManual(e => {
          const next = { ...e, rua, numero, bairro: bairroV };
          const streetWithBairro = [rua, numero].join(", ") + (bairroV ? ` - ${bairroV}` : "");
          next.routeAddress = [streetWithBairro, e.cidade, e.estado].filter(Boolean).join(", ");
          return next;
        });
      } else {
        setEndManual(e => {
          const next = { ...e, rua: parsed.endereco! };
          next.routeAddress = [parsed.endereco, e.cidade, e.estado].filter(Boolean).join(", ");
          return next;
        });
      }
    }
  }

  // ── Editar pedido helpers ────────────────────────────────────────
  function abrirEdit(pedido: Pedido) {
    setEditTarget(pedido);
    setEditForm({
      cliente_nome:     pedido.cliente_nome,
      cliente_telefone: pedido.cliente_telefone,
      endereco_entrega: pedido.endereco_entrega,
      descricao_itens:  pedido.descricao_itens ?? "",
      valor_pedido:     pedido.valor_pedido.toFixed(2),
      valor_motoboy:    pedido.valor_motoboy.toFixed(2),
      forma_pagamento:  (pedido.forma_pagamento ?? "") as "" | "dinheiro" | "cartao_credito" | "cartao_debito" | "pix" | "ja_pago",
      troco_para:       pedido.troco_para?.toFixed(2) ?? "",
      observacoes:      pedido.observacoes ?? "",
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditSaving(true);
    await supabase.from("pedidos").update({
      cliente_nome:     editForm.cliente_nome,
      cliente_telefone: editForm.cliente_telefone,
      endereco_entrega: editForm.endereco_entrega,
      descricao_itens:  editForm.descricao_itens || null,
      valor_pedido:     parseFloat(editForm.valor_pedido) || 0,
      valor_motoboy:    parseFloat(editForm.valor_motoboy) || 0,
      forma_pagamento:  editForm.forma_pagamento || null,
      troco_para:       editForm.forma_pagamento === "dinheiro" && editForm.troco_para ? parseFloat(editForm.troco_para) : null,
      observacoes:      editForm.observacoes || null,
      updated_at:       new Date().toISOString(),
    }).eq("id", editTarget.id);
    setEditSaving(false);
    setEditTarget(null);
    router.refresh();
  }

  // ── Recarrega lista de motoboys disponíveis ──────────────────────
  async function reloadMotoboys() {
    const { data } = await supabase
      .from("motoboys").select("id, nome, posicao_fila")
      .eq("empresa_id", empresaId).eq("status", "disponivel")
      .order("posicao_fila", { ascending: true });
    setMotoboysDisp(data ?? []);
  }

  // ── Libera o motoboy se não tiver mais entregas ativas ───────────
  async function liberarMotoboy(mbId: string, excluirPedidoId?: string) {
    const query = supabase.from("pedidos").select("id")
      .eq("motoboy_id", mbId).in("status", ["em_coleta", "em_rota_de_entrega"]);
    if (excluirPedidoId) query.neq("id", excluirPedidoId);
    const { data: outros } = await query;
    if (!outros || outros.length === 0) {
      await supabase.from("motoboys").update({ status: "disponivel" }).eq("id", mbId);
    }
  }

  // ── Marcar pedido como entregue manualmente (fallback p/ motoboy) ─
  async function handleMarcarEntregue(pedido: Pedido) {
    setMarcandoEntregue(pedido.id);
    await supabase.from("pedidos")
      .update({ status: "entregue", updated_at: new Date().toISOString() })
      .eq("id", pedido.id);
    if (pedido.motoboy_id) await liberarMotoboy(pedido.motoboy_id, pedido.id);
    setMarcandoEntregue(null);
  }

  // ── Devolver pedido/rota para a fila ─────────────────────────────
  async function handleDevolverFila(pedido: Pedido) {
    setCancelandoDespacho(pedido.id);
    if (pedido.route_id) {
      await supabase.from("pedidos")
        .update({ status: "finalizado", motoboy_id: null, route_id: null, updated_at: new Date().toISOString() })
        .eq("route_id", pedido.route_id);
      await supabase.from("delivery_routes").delete().eq("id", pedido.route_id);
    } else {
      await supabase.from("pedidos")
        .update({ status: "finalizado", motoboy_id: null, updated_at: new Date().toISOString() })
        .eq("id", pedido.id);
    }
    if (pedido.motoboy_id) await liberarMotoboy(pedido.motoboy_id);
    await reloadMotoboys();
    setCancelandoDespacho(null);
    router.refresh();
  }

  // ── Trocar motoboy de um pedido ou rota inteira ───────────────────
  async function handleTrocarMotoboy(pedido: Pedido, novoMbId: string) {
    setTrocandoMb(pedido.id);
    setTrocaMbDropdown(null);
    if (pedido.route_id) {
      await supabase.from("pedidos")
        .update({ motoboy_id: novoMbId, updated_at: new Date().toISOString() })
        .eq("route_id", pedido.route_id);
      await supabase.from("delivery_routes")
        .update({ motoboy_id: novoMbId }).eq("id", pedido.route_id);
    } else {
      await supabase.from("pedidos")
        .update({ motoboy_id: novoMbId, updated_at: new Date().toISOString() })
        .eq("id", pedido.id);
    }
    if (pedido.motoboy_id) await liberarMotoboy(pedido.motoboy_id);
    await supabase.from("motoboys").update({ status: "em_entrega" }).eq("id", novoMbId);
    await reloadMotoboys();
    setTrocandoMb(null);
    router.refresh();
  }

  // ── Route builder helpers ─────────────────────────────────────────
  function toggleRotaPedido(pedido: Pedido) {
    setRotaPedidos(prev =>
      prev.some(p => p.id === pedido.id) ? prev.filter(p => p.id !== pedido.id) : [...prev, pedido]
    );
  }

  async function handleEnviarRota() {
    if (!routeMotoboy || rotaPedidos.length === 0) return;
    setSendingRota(true);

    // Confirma que motoboy ainda está disponível antes de criar a rota
    const { data: mb } = await supabase
      .from("motoboys").select("status").eq("id", routeMotoboy).single();
    if (!mb || mb.status !== "disponivel") {
      alert("Motoboy não está mais disponível. Selecione outro.");
      const { data: fresh } = await supabase
        .from("motoboys").select("id, nome, posicao_fila")
        .eq("empresa_id", empresaId).eq("status", "disponivel")
        .order("posicao_fila", { ascending: true });
      setMotoboysDisp(fresh ?? []);
      setRouteMotoboy("");
      setSendingRota(false);
      return;
    }

    const { data: route, error } = await supabase
      .from("delivery_routes")
      .insert({ empresa_id: empresaId, motoboy_id: routeMotoboy, status: "aguardando_saida" })
      .select("id")
      .single();
    if (!route || error) {
      alert("Erro ao criar rota. Tente novamente.");
      setSendingRota(false);
      return;
    }

    await supabase.from("pedidos")
      .update({ motoboy_id: routeMotoboy, route_id: route.id, status: "em_coleta", updated_at: new Date().toISOString() })
      .in("id", rotaPedidos.map(p => p.id));
    await supabase.from("motoboys").update({ status: "em_entrega" }).eq("id", routeMotoboy);
    setMotoboysDisp(prev => prev.filter(m => m.id !== routeMotoboy));
    setRotaPedidos([]);
    setRouteMotoboy("");
    setSendingRota(false);
    router.refresh();
  }

  // ── Criar pedido ────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const isRetirada = form.tipo_pedido === "retirada";
    // navAddress = endereço limpo para GPS (sem bairro/complemento/referencia que confundem o parser)
    const navAddress = !isRetirada
      ? [endManual.rua, endManual.numero, endManual.cidade, endManual.estado].filter(Boolean).join(", ")
      : null;
    const { error: insertErr } = await supabase.from("pedidos").insert({
      empresa_id:       empresaId,
      tipo_pedido:      form.tipo_pedido,
      cliente_nome:     form.cliente_nome,
      cliente_telefone: form.cliente_telefone,
      endereco_entrega: isRetirada ? "Retirada no local" : endManual.routeAddress,
      endereco_lat:     null,
      endereco_lng:     null,
      distancia_km:     null,
      route_address:    navAddress,
      descricao_itens:  (() => { const a = cartItems.map(i => { const desc = cartDescItem(i); const nome = desc ? `${i.produto.nome} (${desc})` : i.produto.nome; return `${i.qty}x ${nome} — R$${(i.precoUnit * i.qty).toFixed(2).replace(".", ",")}`; }).join("\n"); const b = form.descricao_itens.trim(); return [a, b].filter(Boolean).join("\n") || null; })(),
      valor_pedido:     parseFloat(form.valor_pedido) || 0,
      valor_motoboy:    isRetirada ? 0 : parseFloat(form.valor_motoboy) || 0,
      forma_pagamento:  form.forma_pagamento || null,
      troco_para:       form.forma_pagamento === "dinheiro" && form.troco_para ? parseFloat(form.troco_para) : null,
      observacoes:      form.observacoes || null,
      status:           "em_fila",
    });
    setSaving(false);
    if (insertErr) { alert("Erro ao criar pedido: " + insertErr.message); return; }
    log(supabase, empresaId, "pedido_criado",
      `Pedido criado para ${form.cliente_nome}`,
      { cliente: form.cliente_nome, valor: parseFloat(form.valor_pedido) || 0 },
    );
    resetForm();
    router.refresh();
  }

  // ── Avançar status (empresa: em_fila→em_preparo, em_preparo→finalizado) ──
  async function handleAdvance(pedido: Pedido) {
    const action = pedido.tipo_pedido === "retirada"
      ? NEXT_ACTION_RETIRADA[pedido.status]
      : NEXT_ACTION[pedido.status];
    if (!action) return;
    setAdvancing(pedido.id);
    await supabase.from("pedidos")
      .update({ status: action.next, updated_at: new Date().toISOString() })
      .eq("id", pedido.id);

    // Despacho automático: se foi para "finalizado", é entrega e há motoboy disponível na fila
    if (action.next === "finalizado" && pedido.tipo_pedido !== "retirada" && autoDespacho && motoboysDisp.length > 0) {
      const mb = motoboysDisp[0];
      await supabase.from("pedidos")
        .update({ motoboy_id: mb.id, status: "em_coleta", updated_at: new Date().toISOString() })
        .eq("id", pedido.id).eq("status", "finalizado");
      await supabase.from("motoboys").update({ status: "em_entrega" }).eq("id", mb.id);
      setMotoboysDisp((prev) => prev.filter((m) => m.id !== mb.id));
    }

    log(supabase, empresaId, "status_atualizado",
      `Status de ${pedido.cliente_nome} → ${action.next}`,
      { pedido_id: pedido.id, status_anterior: pedido.status, status_novo: action.next },
    );
    setAdvancing(null);
    router.refresh();
  }

  // ── Enviar para motoboy da fila ─────────────────────────────────
  async function handleEnviarMotoboy(pedidoId: string, motoboyId: string) {
    setSendingTo(pedidoId);
    await supabase.from("pedidos")
      .update({ motoboy_id: motoboyId, status: "em_coleta", updated_at: new Date().toISOString() })
      .eq("id", pedidoId).eq("status", "finalizado");
    await supabase.from("motoboys").update({ status: "em_entrega" }).eq("id", motoboyId);
    setMotoboysDisp((prev) => prev.filter((m) => m.id !== motoboyId));
    setDropdownPedido(null);
    setSendingTo(null);
    router.refresh();
  }

  // ── Cancelar ────────────────────────────────────────────────────
  async function handleCancel(pedido: Pedido) {
    await supabase.from("pedidos")
      .update({ status: "cancelado", updated_at: new Date().toISOString() })
      .eq("id", pedido.id);
    if (pedido.motoboy_id) {
      await supabase.from("motoboys").update({ status: "disponivel" }).eq("id", pedido.motoboy_id);
    }
    router.refresh();
  }

  // ── Excluir pedido (requer código da empresa) ───────────────────
  function abrirDelete(pedido: Pedido) {
    setDeleteTarget(pedido);
    setDeletePin("");
    setDeleteError(false);
    setDeletePinVisible(false);
  }

  function fecharDelete() {
    setDeleteTarget(null);
    setDeletePin("");
    setDeleteError(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    if (deletePin.trim().toUpperCase() !== empresaCodigo.toUpperCase()) {
      setDeleteError(true);
      return;
    }
    setDeleting(true);
    await supabase.from("pedidos").delete().eq("id", deleteTarget.id);
    if (deleteTarget.motoboy_id) {
      await supabase.from("motoboys").update({ status: "disponivel" }).eq("id", deleteTarget.motoboy_id);
    }
    log(supabase, empresaId, "pedido_excluido",
      `Pedido de ${deleteTarget.cliente_nome} excluído`,
      { pedido_id: deleteTarget.id, cliente: deleteTarget.cliente_nome, status: deleteTarget.status },
    );
    setDeleting(false);
    fecharDelete();
    router.refresh();
  }

  // ── Filtros ─────────────────────────────────────────────────────
  const filtered = pedidos.filter((p) => {
    if (filter !== "todos" && p.status !== filter) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (!p.cliente_nome.toLowerCase().includes(q) &&
          !p.endereco_entrega.toLowerCase().includes(q) &&
          !(p.descricao_itens ?? "").toLowerCase().includes(q) &&
          !(p.motoboy?.nome ?? "").toLowerCase().includes(q)) return false;
    }
    if (dataDe && new Date(p.created_at) < new Date(dataDe + "T00:00:00")) return false;
    if (dataAte && new Date(p.created_at) > new Date(dataAte + "T23:59:59")) return false;
    return true;
  });

  const counts: Record<string, number> = { todos: pedidos.length };
  for (const s of [...STEPS, "cancelado"]) {
    counts[s] = pedidos.filter((p) => p.status === s).length;
  }

  const temFiltroAtivo = busca || dataDe || dataAte;

  // ── Alerta de pedido parado ─────────────────────────────────────
  const STALE_MIN = 30;
  const STALE_STS: PedidoStatus[] = ["em_fila", "em_preparo"];
  function staleMin(p: Pedido) { return (now - new Date(p.updated_at).getTime()) / 60_000; }

  function handlePrint(pedido: Pedido) {
    printService.printOrder(pedido, empresaNome);
  }

  const filteredManual   = filtered.filter(p => p.origem !== "catalogo");
  const filteredCatalogo = filtered.filter(p => p.origem === "catalogo");

  // ── Input style helper ──────────────────────────────────────────
  const IS = {
    background: "var(--bg-base)",
    border:     "1px solid var(--border-1)",
    color:      "var(--text-1)",
  };
  const focus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>, c = "#FF6A00") =>
    (e.target.style.borderColor = c);
  const blur  = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    (e.target.style.borderColor = "var(--border-1)");

  function renderCard(pedido: Pedido) {
    const cfg        = STATUS_CONFIG[pedido.status];
    const isRetirada = pedido.tipo_pedido === "retirada";
    const action     = isRetirada
      ? NEXT_ACTION_RETIRADA[pedido.status]
      : NEXT_ACTION[pedido.status];
    const isAdv   = advancing === pedido.id;
    const ageMin  = staleMin(pedido);
    const isStale = STALE_STS.includes(pedido.status) && ageMin > STALE_MIN;
    const isNew   = highlightedOrders.has(pedido.id);
    return (
      <div key={pedido.id} className="p-4 rounded-2xl transition-all"
        style={{
          background: "var(--bg-2)",
          border: isNew
            ? "1px solid rgba(34,197,94,0.55)"
            : isStale ? "1px solid rgba(249,115,22,0.5)" : "1px solid var(--border-1)",
          boxShadow: isNew
            ? "0 0 0 3px rgba(34,197,94,0.08)"
            : isStale ? "0 0 0 2px rgba(249,115,22,0.07)" : "none",
        }}>
        <div className="flex items-start gap-3">
          <div className="mt-1.5 shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: cfg.dot }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold" style={{ color: "var(--text-1)" }}>{pedido.cliente_nome}</p>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handlePrint(pedido)} className="w-7 h-7 flex items-center justify-center rounded-lg transition-all" style={{ color: "#374151" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.1)"; (e.currentTarget as HTMLElement).style.color = "#22c55e"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#374151"; }}
                  title="Imprimir pedido"><Printer size={13} /></button>
                <button onClick={() => abrirEdit(pedido)} className="w-7 h-7 flex items-center justify-center rounded-lg transition-all" style={{ color: "#374151" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(96,165,250,0.1)"; (e.currentTarget as HTMLElement).style.color = "#60a5fa"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#374151"; }}
                  title="Editar pedido"><Pencil size={13} /></button>
                <button onClick={() => abrirDelete(pedido)} className="w-7 h-7 flex items-center justify-center rounded-lg transition-all" style={{ color: "#374151" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,106,0,0.1)"; (e.currentTarget as HTMLElement).style.color = "#FF6A00"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#374151"; }}
                  title="Excluir pedido"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                style={isRetirada
                  ? { background: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)" }
                  : { background: "rgba(249,115,22,0.1)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.25)" }}>
                {isRetirada ? <ShoppingBag size={10} /> : <Truck size={10} />}
                {isRetirada ? "Retirada" : "Delivery"}
              </span>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
                {isRetirada && pedido.status === "finalizado" ? "Pronto p/ retirada" : cfg.label}
              </span>
              {isStale && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: "rgba(249,115,22,0.15)", color: "#f97316", border: "1px solid rgba(249,115,22,0.3)" }}>
                  <Clock size={10} />{Math.round(ageMin)}min
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-xs" style={{ color: "#64748b" }}>{pedido.cliente_telefone}</p>
              <span style={{ color: "#1f2937" }}>·</span>
              <p className="text-xs" style={{ color: "#374151" }}>
                {new Date(pedido.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                {" "}{new Date(pedido.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <MapPin size={12} style={{ color: "#374151" }} />
              <span className="text-xs truncate" style={{ color: "#475569" }}>{pedido.endereco_entrega}</span>
            </div>
            {pedido.descricao_itens && (
              <p className="text-xs mt-2" style={{ color: "#64748b" }}>{pedido.descricao_itens}</p>
            )}
            {(pedido.valor_pedido > 0 || pedido.valor_motoboy > 0) && (
              <div className="flex items-center gap-3 mt-2">
                {pedido.valor_pedido > 0 && (
                  <span className="text-xs" style={{ color: "#94a3b8" }}>
                    Pedido: <span className="font-medium" style={{ color: "var(--text-1)" }}>R$ {pedido.valor_pedido.toFixed(2)}</span>
                  </span>
                )}
                {pedido.valor_motoboy > 0 && (
                  <span className="text-xs font-medium" style={{ color: "#fbbf24" }}>Motoboy: R$ {pedido.valor_motoboy.toFixed(2)}</span>
                )}
              </div>
            )}
            {pedido.distancia_km != null && (
              <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#475569" }}>
                <Navigation size={11} /> {pedido.distancia_km.toFixed(1)} km
              </p>
            )}
            {pedido.motoboy && (
              <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#fbbf24" }}>
                <Bike size={11} /> {pedido.motoboy.nome}
              </p>
            )}
            {pedido.observacoes && (
              <p className="text-xs mt-1.5 italic" style={{ color: "#374151" }}>"{pedido.observacoes}"</p>
            )}
            <StatusProgress status={pedido.status} />
            {pedido.status !== "entregue" && pedido.status !== "cancelado" && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {action && (
                  <button onClick={() => handleAdvance(pedido)} disabled={isAdv}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                    style={{ background: `${action.color}18`, color: action.color, border: `1px solid ${action.border}` }}>
                    {isAdv ? <Loader2 size={11} className="animate-spin" /> : <ChevronRight size={11} />}
                    {action.label}
                  </button>
                )}
                {pedido.status === "finalizado" && !pedido.motoboy_id && !isRetirada && motoboysDisp.length > 0 && (
                  <button onClick={() => handleEnviarMotoboy(pedido.id, motoboysDisp[0].id)} disabled={sendingTo === pedido.id}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                    title={`Enviar para ${motoboysDisp[0].nome}`}
                    style={{ background: "rgba(255,106,0,0.12)", color: "#FF6A00", border: "1px solid rgba(255,106,0,0.3)" }}>
                    {sendingTo === pedido.id ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                    Da vez
                  </button>
                )}
                {pedido.status === "finalizado" && !pedido.motoboy_id && !isRetirada && (
                  <div className="relative mb-dropdown">
                    <button onClick={() => setDropdownPedido(dropdownPedido === pedido.id ? null : pedido.id)} disabled={sendingTo === pedido.id}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                      style={{ background: motoboysDisp.length > 0 ? "rgba(96,165,250,0.12)" : "var(--overlay-sm)", color: motoboysDisp.length > 0 ? "#60a5fa" : "#475569", border: `1px solid ${motoboysDisp.length > 0 ? "rgba(96,165,250,0.3)" : "var(--overlay-md)"}` }}>
                      {sendingTo === pedido.id ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                      {motoboysDisp.length > 0 ? `Enviar para motoboy (${motoboysDisp.length})` : "Nenhum motoboy disponível"}
                    </button>
                    {dropdownPedido === pedido.id && motoboysDisp.length > 0 && (
                      <div className="absolute left-0 top-full mt-1 z-30 rounded-xl overflow-hidden mb-dropdown"
                        style={{ background: "var(--bg-1)", border: "1px solid rgba(96,165,250,0.2)", minWidth: 210, boxShadow: "0 12px 40px rgba(0,0,0,0.7)" }}>
                        {motoboysDisp.map((mb, i) => (
                          <button key={mb.id} onClick={() => handleEnviarMotoboy(pedido.id, mb.id)}
                            className="flex items-center gap-3 w-full px-4 py-3 text-left transition-colors"
                            style={{ borderBottom: i < motoboysDisp.length - 1 ? "1px solid var(--border-1)" : "none" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(96,165,250,0.08)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: i === 0 ? "rgba(96,165,250,0.15)" : "var(--overlay-sm)" }}>
                              <Bike size={13} style={{ color: i === 0 ? "#60a5fa" : "#475569" }} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{mb.nome}</p>
                              {i === 0 && <p className="text-xs" style={{ color: "#60a5fa" }}>Próximo da fila</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {pedido.status === "finalizado" && !pedido.motoboy_id && !pedido.route_id && !isRetirada && (
                  <button onClick={() => toggleRotaPedido(pedido)}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                    style={rotaPedidos.some(p => p.id === pedido.id)
                      ? { background: "rgba(167,139,250,0.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)" }
                      : { background: "rgba(148,163,184,0.06)", color: "#64748b", border: "1px solid rgba(148,163,184,0.15)" }}>
                    <Navigation size={11} />
                    {rotaPedidos.some(p => p.id === pedido.id) ? "Na rota ✓" : "Adicionar à rota"}
                  </button>
                )}
                {pedido.status === "finalizado" && (
                  <button onClick={() => handleMarcarEntregue(pedido)} disabled={marcandoEntregue === pedido.id}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                    style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}>
                    {marcandoEntregue === pedido.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                    Entregue
                  </button>
                )}
                {(pedido.status === "em_coleta" || pedido.status === "em_rota_de_entrega") && pedido.motoboy_id && (
                  <>
                    <div className="relative mb-dropdown">
                      <button onClick={() => setTrocaMbDropdown(trocaMbDropdown === pedido.id ? null : pedido.id)} disabled={trocandoMb === pedido.id}
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl mb-dropdown"
                        style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}>
                        {trocandoMb === pedido.id ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                        Trocar motoboy
                      </button>
                      {trocaMbDropdown === pedido.id && (
                        <div className="absolute left-0 top-full mt-1 z-30 rounded-xl overflow-hidden mb-dropdown"
                          style={{ background: "var(--bg-1)", border: "1px solid rgba(251,191,36,0.2)", minWidth: 210, boxShadow: "0 12px 40px rgba(0,0,0,0.7)" }}>
                          {motoboysDisp.length === 0
                            ? <p className="text-xs px-4 py-3" style={{ color: "#475569" }}>Nenhum motoboy disponível</p>
                            : motoboysDisp.map((mb, i) => (
                              <button key={mb.id} onClick={() => handleTrocarMotoboy(pedido, mb.id)}
                                className="flex items-center gap-3 w-full px-4 py-3 text-left transition-colors mb-dropdown"
                                style={{ borderBottom: i < motoboysDisp.length - 1 ? "1px solid var(--border-1)" : "none" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(251,191,36,0.07)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                  style={{ background: i === 0 ? "rgba(251,191,36,0.15)" : "var(--overlay-sm)" }}>
                                  <Bike size={13} style={{ color: i === 0 ? "#fbbf24" : "#475569" }} />
                                </div>
                                <div>
                                  <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{mb.nome}</p>
                                  {i === 0 && <p className="text-xs" style={{ color: "#fbbf24" }}>Próximo da fila</p>}
                                </div>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => handleDevolverFila(pedido)} disabled={cancelandoDespacho === pedido.id}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                      style={{ background: "rgba(255,106,0,0.08)", color: "#FF8C1A", border: "1px solid rgba(255,106,0,0.15)" }}>
                      {cancelandoDespacho === pedido.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                      {pedido.route_id ? "Cancelar rota" : "Devolver à fila"}
                    </button>
                  </>
                )}
                {pedido.status === "em_rota_de_entrega" && (
                  <button onClick={() => handleMarcarEntregue(pedido)} disabled={marcandoEntregue === pedido.id}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                    style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}>
                    {marcandoEntregue === pedido.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                    Entregue
                  </button>
                )}
                {(pedido.status === "em_fila" || pedido.status === "em_preparo") && (
                  <button onClick={() => handleCancel(pedido)}
                    className="text-xs font-medium px-3 py-2 rounded-xl"
                    style={{ background: "rgba(255,106,0,0.06)", color: "#FF8C1A" }}>
                    Cancelar
                  </button>
                )}
              </div>
            )}
            {pedido.status === "entregue" && (
              <div className="flex items-center gap-1.5 mt-3">
                <CheckCircle size={12} style={{ color: "#22c55e" }} />
                <span className="text-xs" style={{ color: "#22c55e" }}>Entregue com sucesso</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6" style={{ background: "var(--bg-base)", minHeight: "100%" }}>

      {/* ── Banner: novo pedido ── */}
      {newOrderBanner && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 9999,
          background: "linear-gradient(135deg,#16a34a,#15803d)",
          borderRadius: 16, padding: "14px 16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", gap: 12,
          maxWidth: 320, animation: "slideIn .25s ease",
        }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Bell size={18} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: 0 }}>
              {newOrderBanner.count > 1 ? `${newOrderBanner.count} novos pedidos` : "Novo pedido recebido"}
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {newOrderBanner.lastClienteNome}
            </p>
          </div>
          <button
            onClick={() => { setNewOrderBanner(null); stopSound(); }}
            style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            title="Parar som e fechar"
          >
            <VolumeX size={14} color="#fff" />
          </button>
        </div>
      )}

      {/* ── Toast de impressão ── */}
      {printToast && (
        <div style={{
          position: "fixed", bottom: 24, right: 16, zIndex: 9998,
          background: printToast.ok ? "linear-gradient(135deg,#16a34a,#15803d)" : "linear-gradient(135deg,#dc2626,#b91c1c)",
          borderRadius: 14, padding: "12px 16px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", gap: 10,
          maxWidth: 320, animation: "slideIn .2s ease",
        }}>
          <Printer size={16} color="#fff" />
          <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: 0 }}>{printToast.msg}</p>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-1)" }}>Pedidos</h1>
            {highlightedOrders.size > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, background: "#16a34a", color: "#fff", borderRadius: 99, padding: "2px 8px" }}>
                {highlightedOrders.size} novo{highlightedOrders.size > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>
            {temFiltroAtivo
              ? `${filtered.length} de ${pedidos.length} pedidos`
              : `${pedidos.length} pedidos no total`}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
          style={{ background: "linear-gradient(135deg,#cc5500,#a84400)", color: "var(--text-1)", boxShadow: "0 0 20px rgba(204,85,0,0.3)" }}
        >
          <Plus size={16} /> Novo pedido
        </button>
      </div>

      {/* ── Busca + filtro de data ── */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#374151" }} />
          <input
            type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente, endereço, motoboy..."
            autoComplete="off"
            className="w-full pl-8 pr-8 py-2 rounded-xl text-sm placeholder-slate-700 outline-none"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)", color: "var(--text-1)" }}
          />
          {busca && (
            <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "#374151" }}>
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar size={13} style={{ color: "var(--text-3)" }} />
          <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)}
            className="px-2 py-2 rounded-xl text-xs outline-none"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)", color: "var(--text-1)", colorScheme: "light dark" }} />
          <span className="text-xs" style={{ color: "var(--text-3)" }}>até</span>
          <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)}
            className="px-2 py-2 rounded-xl text-xs outline-none"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)", color: "var(--text-1)", colorScheme: "light dark" }} />
          {(dataDe || dataAte) && (
            <button onClick={() => { setDataDe(""); setDataAte(""); }} style={{ color: "var(--text-3)" }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Filtros de status ── */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          const count  = counts[key] ?? 0;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0"
              style={
                active
                  ? { background: "rgba(204,85,0,0.15)", color: "#FF6A00", border: "1px solid rgba(204,85,0,0.3)" }
                  : { background: "var(--bg-2)", color: "#64748b", border: "1px solid var(--border-1)" }
              }
            >
              {label}
              <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                style={{ background: active ? "rgba(204,85,0,0.2)" : "var(--bg-3)", color: active ? "#FF6A00" : "var(--text-4)" }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Pedidos: duas colunas ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

        {/* ── Coluna MANUAL ── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1 py-2 rounded-xl sticky top-0 z-10"
            style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.18)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#60a5fa", boxShadow: "0 0 8px #60a5fa", display: "inline-block", flexShrink: 0, marginLeft: 8 }} />
            <span className="text-sm font-black uppercase tracking-widest" style={{ color: "#60a5fa" }}>Manual</span>
            <span className="ml-auto mr-2 text-xs font-bold px-2.5 py-0.5 rounded-full"
              style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" }}>
              {filteredManual.length}
            </span>
          </div>
          {filteredManual.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3" style={{ color: "#374151" }}>
              <Package size={32} style={{ color: "#1f2937" }} />
              <p className="text-xs">Nenhum pedido manual</p>
            </div>
          ) : filteredManual.map(renderCard)}
        </div>

        {/* ── Coluna CLIENTES ── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1 py-2 rounded-xl sticky top-0 z-10"
            style={{ background: "rgba(255,106,0,0.06)", border: "1px solid rgba(255,106,0,0.18)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF6A00", boxShadow: "0 0 8px #FF6A00", display: "inline-block", flexShrink: 0, marginLeft: 8 }} />
            <span className="text-sm font-black uppercase tracking-widest" style={{ color: "#FF6A00" }}>Clientes</span>
            <span className="ml-auto mr-2 text-xs font-bold px-2.5 py-0.5 rounded-full"
              style={{ background: "rgba(255,106,0,0.12)", color: "#FF6A00", border: "1px solid rgba(255,106,0,0.25)" }}>
              {filteredCatalogo.length}
            </span>
          </div>
          {filteredCatalogo.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3" style={{ color: "#374151" }}>
              <Package size={32} style={{ color: "#1f2937" }} />
              <p className="text-xs">Nenhum pedido de clientes</p>
            </div>
          ) : filteredCatalogo.map(renderCard)}
        </div>
      </div>

      {/* legacy - kept for TS, unreachable */}
      {false && filtered.map((pedido) => {
          const cfg        = STATUS_CONFIG[pedido.status];
          const isRetirada = pedido.tipo_pedido === "retirada";
          const action     = isRetirada
            ? NEXT_ACTION_RETIRADA[pedido.status]
            : NEXT_ACTION[pedido.status];
          const isAdv      = advancing === pedido.id;
          const ageMin     = staleMin(pedido);
          const isStale    = STALE_STS.includes(pedido.status) && ageMin > STALE_MIN;

          const isNew = highlightedOrders.has(pedido.id);

          return (
            <div key={pedido.id} className="p-4 rounded-2xl transition-all"
              style={{
                background: "var(--bg-2)",
                border: isNew
                  ? "1px solid rgba(34,197,94,0.55)"
                  : isStale ? "1px solid rgba(249,115,22,0.5)" : "1px solid var(--border-1)",
                boxShadow: isNew
                  ? "0 0 0 3px rgba(34,197,94,0.08)"
                  : isStale ? "0 0 0 2px rgba(249,115,22,0.07)" : "none",
              }}>
              <div className="flex items-start gap-3">
                {/* Dot */}
                <div className="mt-1.5 shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: cfg.dot }} />

                <div className="flex-1 min-w-0">
                  {/* Nome + botões */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold" style={{ color: "var(--text-1)" }}>{pedido.cliente_nome}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handlePrint(pedido)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                        style={{ color: "#374151" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.1)"; (e.currentTarget as HTMLElement).style.color = "#22c55e"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#374151"; }}
                        title="Imprimir pedido"
                      >
                        <Printer size={13} />
                      </button>
                      <button
                        onClick={() => abrirEdit(pedido)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                        style={{ color: "#374151" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(96,165,250,0.1)"; (e.currentTarget as HTMLElement).style.color = "#60a5fa"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#374151"; }}
                        title="Editar pedido"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => abrirDelete(pedido)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                        style={{ color: "#374151" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,106,0,0.1)"; (e.currentTarget as HTMLElement).style.color = "#FF6A00"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#374151"; }}
                        title="Excluir pedido"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {/* Badges: tipo + status + alerta */}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                      style={isRetirada
                        ? { background: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)" }
                        : { background: "rgba(249,115,22,0.1)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.25)" }}>
                      {isRetirada ? <ShoppingBag size={10} /> : <Truck size={10} />}
                      {isRetirada ? "Retirada" : "Delivery"}
                    </span>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                      style={{ background: cfg.bg, color: cfg.color }}>
                      {isRetirada && pedido.status === "finalizado" ? "Pronto p/ retirada" : cfg.label}
                    </span>
                    {isStale && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={{ background: "rgba(249,115,22,0.15)", color: "#f97316", border: "1px solid rgba(249,115,22,0.3)" }}>
                        <Clock size={10} />
                        {Math.round(ageMin)}min
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs" style={{ color: "#64748b" }}>{pedido.cliente_telefone}</p>
                    <span style={{ color: "#1f2937" }}>·</span>
                    <p className="text-xs" style={{ color: "#374151" }}>
                      {new Date(pedido.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      {" "}
                      {new Date(pedido.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2">
                    <MapPin size={12} style={{ color: "#374151" }} />
                    <span className="text-xs truncate" style={{ color: "#475569" }}>{pedido.endereco_entrega}</span>
                  </div>

                  {pedido.descricao_itens && (
                    <p className="text-xs mt-2" style={{ color: "#64748b" }}>{pedido.descricao_itens}</p>
                  )}

                  {(pedido.valor_pedido > 0 || pedido.valor_motoboy > 0) && (
                    <div className="flex items-center gap-3 mt-2">
                      {pedido.valor_pedido > 0 && (
                        <span className="text-xs" style={{ color: "#94a3b8" }}>
                          Pedido: <span className="font-medium" style={{ color: "var(--text-1)" }}>R$ {pedido.valor_pedido.toFixed(2)}</span>
                        </span>
                      )}
                      {pedido.valor_motoboy > 0 && (
                        <span className="text-xs font-medium" style={{ color: "#fbbf24" }}>
                          Motoboy: R$ {pedido.valor_motoboy.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}

                  {pedido.distancia_km != null && (
                    <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#475569" }}>
                      <Navigation size={11} /> {pedido.distancia_km.toFixed(1)} km
                    </p>
                  )}

                  {pedido.motoboy && (
                    <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#fbbf24" }}>
                      <Bike size={11} /> {pedido.motoboy.nome}
                    </p>
                  )}

                  {pedido.observacoes && (
                    <p className="text-xs mt-1.5 italic" style={{ color: "#374151" }}>
                      "{pedido.observacoes}"
                    </p>
                  )}

                  {/* Barra de progresso */}
                  <StatusProgress status={pedido.status} />

                  {/* Ações */}
                  {pedido.status !== "entregue" && pedido.status !== "cancelado" && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {/* Botão avançar (empresa controla até finalizado) */}
                      {action && (
                        <button
                          onClick={() => handleAdvance(pedido)}
                          disabled={isAdv}
                          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                          style={{
                            background: `${action.color}18`,
                            color:  action.color,
                            border: `1px solid ${action.border}`,
                          }}
                        >
                          {isAdv
                            ? <Loader2 size={11} className="animate-spin" />
                            : <ChevronRight size={11} />}
                          {action.label}
                        </button>
                      )}

                      {/* Enviar pro da vez — 1 clique, sem dropdown */}
                      {pedido.status === "finalizado" && !pedido.motoboy_id && !isRetirada && motoboysDisp.length > 0 && (
                        <button
                          onClick={() => handleEnviarMotoboy(pedido.id, motoboysDisp[0].id)}
                          disabled={sendingTo === pedido.id}
                          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                          title={`Enviar para ${motoboysDisp[0].nome} (${motoboysDisp[0].posicao_fila}º da fila)`}
                          style={{ background: "rgba(255,106,0,0.12)", color: "#FF6A00", border: "1px solid rgba(255,106,0,0.3)" }}>
                          {sendingTo === pedido.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Zap size={11} />}
                          Da vez
                        </button>
                      )}

                      {/* Enviar para motoboy da fila (apenas delivery) */}
                      {pedido.status === "finalizado" && !pedido.motoboy_id && !isRetirada && (
                        <div className="relative mb-dropdown">
                          <button
                            onClick={() => setDropdownPedido(dropdownPedido === pedido.id ? null : pedido.id)}
                            disabled={sendingTo === pedido.id}
                            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                            style={{
                              background: motoboysDisp.length > 0 ? "rgba(96,165,250,0.12)" : "var(--overlay-sm)",
                              color:  motoboysDisp.length > 0 ? "#60a5fa" : "#475569",
                              border: `1px solid ${motoboysDisp.length > 0 ? "rgba(96,165,250,0.3)" : "var(--overlay-md)"}`,
                            }}
                          >
                            {sendingTo === pedido.id
                              ? <Loader2 size={11} className="animate-spin" />
                              : <Send size={11} />}
                            {motoboysDisp.length > 0
                              ? `Enviar para motoboy (${motoboysDisp.length})`
                              : "Nenhum motoboy disponível"}
                          </button>

                          {dropdownPedido === pedido.id && motoboysDisp.length > 0 && (
                            <div className="absolute left-0 top-full mt-1 z-30 rounded-xl overflow-hidden mb-dropdown"
                              style={{ background: "var(--bg-1)", border: "1px solid rgba(96,165,250,0.2)", minWidth: 210, boxShadow: "0 12px 40px rgba(0,0,0,0.7)" }}>
                              {motoboysDisp.map((mb, i) => (
                                <button key={mb.id}
                                  onClick={() => handleEnviarMotoboy(pedido.id, mb.id)}
                                  className="flex items-center gap-3 w-full px-4 py-3 text-left transition-colors"
                                  style={{ borderBottom: i < motoboysDisp.length - 1 ? "1px solid var(--border-1)" : "none" }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(96,165,250,0.08)")}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                >
                                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ background: i === 0 ? "rgba(96,165,250,0.15)" : "var(--overlay-sm)" }}>
                                    <Bike size={13} style={{ color: i === 0 ? "#60a5fa" : "#475569" }} />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{mb.nome}</p>
                                    {i === 0 && (
                                      <p className="text-xs" style={{ color: "#60a5fa" }}>Próximo da fila</p>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Adicionar à rota */}
                      {pedido.status === "finalizado" && !pedido.motoboy_id && !pedido.route_id && !isRetirada && (
                        <button
                          onClick={() => toggleRotaPedido(pedido)}
                          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                          style={rotaPedidos.some(p => p.id === pedido.id)
                            ? { background: "rgba(167,139,250,0.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)" }
                            : { background: "rgba(148,163,184,0.06)", color: "#64748b", border: "1px solid rgba(148,163,184,0.15)" }}>
                          <Navigation size={11} />
                          {rotaPedidos.some(p => p.id === pedido.id) ? "Na rota ✓" : "Adicionar à rota"}
                        </button>
                      )}
                      {pedido.status === "finalizado" && (
                        <button
                          onClick={() => handleMarcarEntregue(pedido)}
                          disabled={marcandoEntregue === pedido.id}
                          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                          style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}>
                          {marcandoEntregue === pedido.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <CheckCircle size={11} />}
                          Entregue
                        </button>
                      )}

                      {/* Trocar motoboy / Cancelar despacho (em_coleta ou em_rota) */}
                      {(pedido.status === "em_coleta" || pedido.status === "em_rota_de_entrega") && pedido.motoboy_id && (
                        <>
                          <div className="relative mb-dropdown">
                            <button
                              onClick={() => setTrocaMbDropdown(trocaMbDropdown === pedido.id ? null : pedido.id)}
                              disabled={trocandoMb === pedido.id}
                              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl mb-dropdown"
                              style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}>
                              {trocandoMb === pedido.id
                                ? <Loader2 size={11} className="animate-spin" />
                                : <Send size={11} />}
                              Trocar motoboy
                            </button>
                            {trocaMbDropdown === pedido.id && (
                              <div className="absolute left-0 top-full mt-1 z-30 rounded-xl overflow-hidden mb-dropdown"
                                style={{ background: "var(--bg-1)", border: "1px solid rgba(251,191,36,0.2)", minWidth: 210, boxShadow: "0 12px 40px rgba(0,0,0,0.7)" }}>
                                {motoboysDisp.length === 0 ? (
                                  <p className="text-xs px-4 py-3" style={{ color: "#475569" }}>Nenhum motoboy disponível</p>
                                ) : motoboysDisp.map((mb, i) => (
                                  <button key={mb.id}
                                    onClick={() => handleTrocarMotoboy(pedido, mb.id)}
                                    className="flex items-center gap-3 w-full px-4 py-3 text-left transition-colors mb-dropdown"
                                    style={{ borderBottom: i < motoboysDisp.length - 1 ? "1px solid var(--border-1)" : "none" }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(251,191,36,0.07)")}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                      style={{ background: i === 0 ? "rgba(251,191,36,0.15)" : "var(--overlay-sm)" }}>
                                      <Bike size={13} style={{ color: i === 0 ? "#fbbf24" : "#475569" }} />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{mb.nome}</p>
                                      {i === 0 && <p className="text-xs" style={{ color: "#fbbf24" }}>Próximo da fila</p>}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleDevolverFila(pedido)}
                            disabled={cancelandoDespacho === pedido.id}
                            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                            style={{ background: "rgba(255,106,0,0.08)", color: "#FF8C1A", border: "1px solid rgba(255,106,0,0.15)" }}>
                            {cancelandoDespacho === pedido.id
                              ? <Loader2 size={11} className="animate-spin" />
                              : <X size={11} />}
                            {pedido.route_id ? "Cancelar rota" : "Devolver à fila"}
                          </button>
                        </>
                      )}

                      {/* Marcar entregue manualmente (em rota — fallback se motoboy esquecer) */}
                      {pedido.status === "em_rota_de_entrega" && (
                        <button
                          onClick={() => handleMarcarEntregue(pedido)}
                          disabled={marcandoEntregue === pedido.id}
                          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                          style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}>
                          {marcandoEntregue === pedido.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <CheckCircle size={11} />}
                          Entregue
                        </button>
                      )}

                      {/* Cancelar (só enquanto em fila ou preparo) */}
                      {(pedido.status === "em_fila" || pedido.status === "em_preparo") && (
                        <button
                          onClick={() => handleCancel(pedido)}
                          className="text-xs font-medium px-3 py-2 rounded-xl"
                          style={{ background: "rgba(255,106,0,0.06)", color: "#FF8C1A" }}
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  )}

                  {pedido.status === "entregue" && (
                    <div className="flex items-center gap-1.5 mt-3">
                      <CheckCircle size={12} style={{ color: "#22c55e" }} />
                      <span className="text-xs" style={{ color: "#22c55e" }}>Entregue com sucesso</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

      {/* ── Modal: Excluir pedido ── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(4px)" }}
          onClick={(e) => e.target === e.currentTarget && fecharDelete()}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: "var(--bg-1)", border: "1px solid rgba(255,106,0,0.2)" }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(255,106,0,0.1)" }}>
                <AlertTriangle size={18} style={{ color: "#FF6A00" }} />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: "var(--text-1)" }}>Excluir pedido</h2>
                <p className="text-xs" style={{ color: "#64748b" }}>Esta ação não pode ser desfeita</p>
              </div>
            </div>

            {/* Info do pedido */}
            <div className="rounded-xl p-3 mb-5" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{deleteTarget.cliente_nome}</p>
              <p className="text-xs mt-0.5 truncate" style={{ color: "#475569" }}>
                {deleteTarget.endereco_entrega}
              </p>
              {deleteTarget.descricao_itens && (
                <p className="text-xs mt-1 truncate" style={{ color: "#374151" }}>
                  {deleteTarget.descricao_itens}
                </p>
              )}
            </div>

            {/* Campo de senha */}
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "#4b5563" }}>
                Código da empresa para confirmar
              </label>
              <div className="relative">
                <input
                  type={deletePinVisible ? "text" : "password"}
                  value={deletePin}
                  onChange={(e) => { setDeletePin(e.target.value); setDeleteError(false); }}
                  onKeyDown={(e) => e.key === "Enter" && handleDelete()}
                  placeholder="Digite o código..."
                  autoComplete="new-password"
                  autoFocus
                  className="w-full px-4 pr-10 rounded-xl text-sm placeholder-gray-700 outline-none font-mono tracking-widest"
                  style={{
                    background: "var(--bg-base)",
                    border: `1px solid ${deleteError ? "rgba(255,106,0,0.6)" : "var(--overlay-lg)"}`,
                    height: 48,
                    letterSpacing: deletePinVisible ? "normal" : "0.2em",
                  }}
                  onFocus={(e) => !deleteError && (e.target.style.borderColor = "rgba(255,106,0,0.4)")}
                  onBlur={(e) => !deleteError && (e.target.style.borderColor = "var(--overlay-lg)")}
                />
                <button
                  type="button"
                  onClick={() => setDeletePinVisible((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "#374151" }}
                >
                  {deletePinVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {deleteError && (
                <p className="text-xs mt-1.5" style={{ color: "#FF6A00" }}>
                  Código incorreto. Verifique em Configurações.
                </p>
              )}
            </div>

            {/* Botões */}
            <div className="flex gap-3">
              <button
                onClick={fecharDelete}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ border: "1px solid var(--border-1)", color: "#64748b" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || !deletePin.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
                style={{
                  background: "linear-gradient(135deg,#cc5500,#991b1b)",
                  color: "var(--text-1)",
                  opacity: !deletePin.trim() ? 0.5 : 1,
                }}
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Editar pedido ── */}
      {editTarget && (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
          onClick={(e) => e.target === e.currentTarget && setEditTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold" style={{ color: "var(--text-1)" }}>Editar pedido</h2>
                <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                  {STATUS_CONFIG[editTarget.status].label} · {editTarget.tipo_pedido === "retirada" ? "Retirada" : "Delivery"}
                </p>
              </div>
              <button type="button" onClick={() => setEditTarget(null)} style={{ color: "#374151" }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              {[
                { key: "cliente_nome",     label: "Nome do cliente",    placeholder: "João da Silva" },
                { key: "cliente_telefone", label: "Telefone",           placeholder: "(11) 99999-9999" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#94a3b8" }}>{label}</label>
                  <input
                    value={editForm[key as keyof typeof editForm]}
                    onChange={(e) => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    required placeholder={placeholder}
                    className="w-full px-4 py-3 rounded-xl text-sm placeholder-slate-600 outline-none"
                    style={IS} onFocus={e => focus(e)} onBlur={blur}
                  />
                </div>
              ))}

              {editTarget.tipo_pedido === "entrega" && (
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#94a3b8" }}>Endereço de entrega</label>
                  <input
                    value={editForm.endereco_entrega}
                    onChange={(e) => setEditForm(f => ({ ...f, endereco_entrega: e.target.value }))}
                    required placeholder="Rua, número, bairro..."
                    className="w-full px-4 py-3 rounded-xl text-sm placeholder-slate-600 outline-none"
                    style={IS} onFocus={e => focus(e)} onBlur={blur}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "#94a3b8" }}>Itens do pedido</label>
                <textarea
                  value={editForm.descricao_itens}
                  onChange={(e) => setEditForm(f => ({ ...f, descricao_itens: e.target.value }))}
                  rows={2} placeholder="1x Hambúrguer..."
                  className="w-full px-4 py-3 rounded-xl text-sm placeholder-slate-600 outline-none resize-none"
                  style={IS} onFocus={e => focus(e)} onBlur={e => (e.target.style.borderColor = "var(--border-1)")}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#94a3b8" }}>Valor produtos</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium" style={{ color: "#64748b" }}>R$</span>
                    <input type="number" min="0" step="0.01"
                      value={editForm.valor_pedido}
                      onChange={(e) => setEditForm(f => ({ ...f, valor_pedido: e.target.value }))}
                      placeholder="0,00"
                      className="w-full pl-8 pr-3 py-3 rounded-xl text-sm placeholder-slate-600 outline-none"
                      style={IS} onFocus={e => (e.target.style.borderColor = "#FF6A00")} onBlur={e => (e.target.style.borderColor = "var(--border-1)")}
                    />
                  </div>
                </div>
                {editTarget.tipo_pedido === "entrega" && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "#fbbf24" }}>Taxa motoboy</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium" style={{ color: "#64748b" }}>R$</span>
                      <input type="number" min="0" step="0.01"
                        value={editForm.valor_motoboy}
                        onChange={(e) => setEditForm(f => ({ ...f, valor_motoboy: e.target.value }))}
                        placeholder="0,00"
                        className="w-full pl-8 pr-3 py-3 rounded-xl text-sm placeholder-slate-600 outline-none"
                        style={IS} onFocus={e => (e.target.style.borderColor = "#fbbf24")} onBlur={e => (e.target.style.borderColor = "var(--border-1)")}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Forma de pagamento (edit) */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "#94a3b8" }}>Forma de pagamento</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { v: "dinheiro",       label: "Dinheiro",  emoji: "💵" },
                    { v: "pix",            label: "PIX",       emoji: "📱" },
                    { v: "cartao_credito", label: "Crédito",   emoji: "💳" },
                    { v: "cartao_debito",  label: "Débito",    emoji: "💳" },
                    { v: "ja_pago",        label: "Já pago",   emoji: "✓" },
                  ] as const).map(({ v, label, emoji }) => (
                    <button key={v} type="button"
                      onClick={() => setEditForm(f => ({ ...f, forma_pagamento: f.forma_pagamento === v ? "" : v, troco_para: v !== "dinheiro" ? "" : f.troco_para }))}
                      className="py-2 px-2 rounded-xl text-xs font-semibold transition-all"
                      style={editForm.forma_pagamento === v
                        ? { background: v === "ja_pago" ? "rgba(34,197,94,0.15)" : "rgba(255,106,0,0.15)", color: v === "ja_pago" ? "#22c55e" : "#FF6A00", border: `1px solid ${v === "ja_pago" ? "rgba(34,197,94,0.35)" : "rgba(255,106,0,0.35)"}` }
                        : { background: "var(--overlay-xs)", color: "#475569", border: "1px solid var(--border-1)" }
                      }>
                      {emoji} {label}
                    </button>
                  ))}
                </div>
                {editForm.forma_pagamento === "dinheiro" && (
                  <div className="relative mt-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium" style={{ color: "#64748b" }}>Troco p/</span>
                    <input type="number" min="0" step="0.01"
                      value={editForm.troco_para}
                      onChange={(e) => setEditForm(f => ({ ...f, troco_para: e.target.value }))}
                      placeholder="0,00 (opcional)"
                      className="w-full pl-16 pr-4 py-2.5 rounded-xl text-sm placeholder-slate-600 outline-none"
                      style={IS}
                      onFocus={(e) => focus(e)}
                      onBlur={(e) => (e.target.style.borderColor = "var(--border-1)")}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "#94a3b8" }}>Observações</label>
                <textarea
                  value={editForm.observacoes}
                  onChange={(e) => setEditForm(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2} placeholder="Deixar com porteiro..."
                  className="w-full px-4 py-3 rounded-xl text-sm placeholder-slate-600 outline-none resize-none"
                  style={IS} onFocus={e => focus(e)} onBlur={e => (e.target.style.borderColor = "var(--border-1)")}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditTarget(null)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium"
                  style={{ border: "1px solid var(--border-1)", color: "#64748b" }}>
                  Cancelar
                </button>
                <button type="submit" disabled={editSaving}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
                  style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "var(--text-1)", opacity: editSaving ? 0.7 : 1 }}>
                  {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                  {editSaving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Route builder (painel fixo inferior) ── */}
      {rotaPedidos.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40"
          style={{ background: "var(--bg-1)", borderTop: "1px solid rgba(167,139,250,0.25)", padding: "16px 20px calc(16px + env(safe-area-inset-bottom))" }}>
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: "#a78bfa" }}>
                <Navigation size={13} />
                Rota — {rotaPedidos.length} pedido{rotaPedidos.length > 1 ? "s" : ""}
              </p>
              <button onClick={() => setRotaPedidos([])} style={{ color: "#374151" }}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-1 max-h-28 overflow-y-auto">
              {rotaPedidos.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 py-1">
                  <span className="text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }}>{p.cliente_nome}</p>
                    <p className="text-xs truncate" style={{ color: "#475569" }}>{p.endereco_entrega}</p>
                  </div>
                  <button onClick={() => toggleRotaPedido(p)} style={{ color: "#374151", flexShrink: 0 }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <select value={routeMotoboy} onChange={e => setRouteMotoboy(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "var(--bg-base)", border: "1px solid rgba(167,139,250,0.25)" }}>
                <option value="">Selecionar motoboy...</option>
                {motoboysDisp.map((mb, i) => (
                  <option key={mb.id} value={mb.id}>{i === 0 ? "★ " : ""}{mb.nome}</option>
                ))}
              </select>
              <button onClick={handleEnviarRota} disabled={!routeMotoboy || sendingRota}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold shrink-0"
                style={{
                  background: !routeMotoboy || sendingRota ? "var(--bg-3)" : "linear-gradient(135deg,#7c3aed,#6d28d9)",
                  color: !routeMotoboy || sendingRota ? "var(--text-4)" : "white",
                }}>
                {sendingRota ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />}
                {sendingRota ? "..." : "Enviar rota"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Novo pedido ── */}
      {showForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
          <div className="w-full max-w-5xl flex flex-col rounded-3xl overflow-hidden"
            style={{ maxHeight: "92vh", background: "var(--bg-1)", border: "1px solid var(--border-1)", boxShadow: "0 32px 80px rgba(0,0,0,0.65)" }}>

            {/* ── Header ── */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border-1)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(255,106,0,0.12)", border: "1px solid rgba(255,106,0,0.2)" }}>
                  <Package size={16} style={{ color: "#FF6A00" }} />
                </div>
                <div>
                  <p className="text-base font-black leading-none" style={{ color: "var(--text-1)" }}>
                    {colarStep === "colar" ? "Colar pedido" : "Novo pedido"}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-4)" }}>Preencha os dados abaixo</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {colarStep === "form" && (
                  <button type="button" onClick={() => setColarStep("colar")}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: "rgba(255,106,0,0.08)", color: "#FF6A00", border: "1px solid rgba(255,106,0,0.2)" }}>
                    <Clipboard size={11} /> Colar pedido
                  </button>
                )}
                <button type="button" onClick={resetForm}
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                  style={{ background: "var(--bg-3)", color: "var(--text-3)", border: "1px solid var(--border-1)" }}>
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col min-h-0">

            {/* ── Tela de colar ── */}
            {colarStep === "colar" && (() => {
              const parsed = colarTexto.length > 4 ? parsearPedido(colarTexto) : null;
              const temDados = parsed && (parsed.nome || parsed.endereco || parsed.descricao_itens);
              return (
                <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4 max-w-xl mx-auto">
                  <textarea
                    value={colarTexto}
                    onChange={e => setColarTexto(e.target.value)}
                    rows={7}
                    autoFocus
                    placeholder={"João Silva\nTravessa das Flores, 120\nCentro\n2x X-Burguer\n1x Coca 2L\nSem cebola\nTroco para 50"}
                    className="w-full px-4 py-3 rounded-xl text-sm placeholder-slate-600 outline-none resize-none font-mono"
                    style={{ background: "var(--bg-base)", border: "1px solid var(--border-1)", lineHeight: 1.7, color: "var(--text-1)" }}
                    onFocus={e => (e.target.style.borderColor = "#FF6A00")}
                    onBlur={e => (e.target.style.borderColor = "var(--border-1)")}
                  />

                  {temDados && (
                    <div className="rounded-xl p-4 space-y-1.5" style={{ background: "var(--bg-base)", border: "1px solid rgba(255,106,0,0.2)" }}>
                      <p className="text-xs font-bold uppercase tracking-wide mb-2.5" style={{ color: "#FF6A00" }}>Dados detectados</p>
                      {parsed!.nome && (
                        <p className="text-sm flex items-center gap-2" style={{ color: "var(--text-1)" }}>
                          <span style={{ color: "var(--text-4)" }}>👤</span> {parsed!.nome}
                        </p>
                      )}
                      {parsed!.telefone && (
                        <p className="text-sm flex items-center gap-2" style={{ color: "var(--text-3)" }}>
                          <span style={{ color: "var(--text-4)" }}>📞</span> {parsed!.telefone}
                        </p>
                      )}
                      {parsed!.endereco && (
                        <p className="text-sm flex items-center gap-2" style={{ color: "var(--text-1)" }}>
                          <span style={{ color: "var(--text-4)" }}>📍</span>
                          {parsed!.endereco}{parsed!.bairro ? ` — ${parsed!.bairro}` : ""}
                        </p>
                      )}
                      {parsed!.descricao_itens && (
                        <p className="text-sm flex items-center gap-2" style={{ color: "var(--text-3)" }}>
                          <span style={{ color: "var(--text-4)" }}>📦</span>
                          {parsed!.descricao_itens.replace(/\n/g, ", ")}
                        </p>
                      )}
                      {parsed!.valor_pedido && (
                        <p className="text-sm flex items-center gap-2" style={{ color: "var(--text-1)" }}>
                          <span style={{ color: "var(--text-4)" }}>💰</span> R$ {parsed!.valor_pedido}
                        </p>
                      )}
                      {parsed!.troco_para && (
                        <p className="text-sm flex items-center gap-2" style={{ color: "#fbbf24" }}>
                          <span style={{ color: "var(--text-4)" }}>💵</span> Troco p/ R$ {parsed!.troco_para}
                        </p>
                      )}
                      {parsed!.observacoes && (
                        <p className="text-sm italic flex items-center gap-2" style={{ color: "var(--text-3)" }}>
                          <span style={{ color: "var(--text-4)" }}>📝</span> {parsed!.observacoes}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button type="button"
                      onClick={() => { setColarTexto(""); setColarStep("form"); }}
                      className="flex-1 py-3 rounded-xl text-sm font-medium"
                      style={{ border: "1px solid var(--border-1)", color: "var(--text-3)" }}>
                      Cancelar
                    </button>
                    <button type="button"
                      disabled={!temDados}
                      onClick={() => {
                        if (parsed) aplicarColar(parsed);
                        setColarStep("form");
                        setColarTexto("");
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
                      style={{
                        background: temDados ? "linear-gradient(135deg,#cc5500,#a84400)" : "var(--bg-3)",
                        color: temDados ? "white" : "var(--text-4)",
                      }}>
                      <CheckCircle size={14} />
                      Preencher formulário
                    </button>
                  </div>
                </div>
                </div>
              );
            })()}

            {/* ── Form step ── */}
            {colarStep === "form" && (
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">

            {/* ── Compact type selector ── */}
            <div className="flex items-center gap-3 px-6 py-3 shrink-0"
              style={{ borderBottom: "1px solid var(--border-1)", background: "var(--bg-2)" }}>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-4)" }}>Tipo</span>
              {(["entrega", "retirada"] as const).map((tipo) => {
                const ativo = form.tipo_pedido === tipo;
                const Icon  = tipo === "entrega" ? Truck : ShoppingBag;
                const color = tipo === "entrega" ? "#FF6A00" : "#a78bfa";
                return (
                  <button key={tipo} type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, tipo_pedido: tipo, valor_motoboy: tipo === "retirada" ? "0" : f.valor_motoboy }));
                    }}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all"
                    style={ativo
                      ? { background: `${color}1a`, border: `1.5px solid ${color}55`, color }
                      : { background: "var(--bg-base)", border: "1.5px solid var(--border-1)", color: "var(--text-4)" }
                    }>
                    <Icon size={12} />{tipo === "entrega" ? " Delivery" : " Retirada"}
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row md:min-h-0">
            {/* ── Coluna esquerda: cliente + endereço ── */}
            <div className="md:flex-1 md:overflow-y-auto p-4 md:p-5 space-y-4 min-w-0 border-b md:border-b-0 md:border-r" style={{ borderColor: "var(--border-1)" }}>

              {/* ── Cliente ── */}
              <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border-1)" }}>
                <div className="flex items-center gap-2 px-4 py-2.5"
                  style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border-1)" }}>
                  <User size={12} style={{ color: "var(--text-4)" }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-4)" }}>Cliente</span>
                </div>
                <div style={{ borderBottom: "1px solid var(--border-1)", position: "relative" }}>
                  <input
                    value={form.cliente_nome}
                    onChange={(e) => { setForm((f) => ({ ...f, cliente_nome: e.target.value })); setClienteDropOpen(e.target.value.length > 0); }}
                    required placeholder="Nome do cliente"
                    className="w-full px-4 py-3 text-sm outline-none bg-transparent placeholder-slate-500"
                    style={{ color: "var(--text-1)" }}
                    onFocus={(e) => { (e.target.style.background = "var(--overlay-xs)"); if (form.cliente_nome.length > 0) setClienteDropOpen(true); }}
                    onBlur={(e) => { (e.target.style.background = "transparent"); setTimeout(() => setClienteDropOpen(false), 150); }}
                    autoComplete="off"
                  />
                  {clienteDropOpen && (() => {
                    const sugs = clienteHistorico
                      .filter(h => h.nome.toLowerCase().includes(form.cliente_nome.toLowerCase()))
                      .slice(0, 5);
                    return sugs.length > 0 ? (
                      <div className="absolute left-0 right-0 top-full z-40 rounded-xl overflow-hidden"
                        style={{ background: "var(--bg-1)", border: "1px solid var(--border-2)", boxShadow: "0 12px 32px rgba(0,0,0,0.4)", maxHeight: 200, overflowY: "auto" }}>
                        {sugs.map((h, i) => (
                          <button key={i} type="button"
                            onMouseDown={() => {
                              setForm(f => ({
                                ...f,
                                cliente_nome:     h.nome,
                                cliente_telefone: h.telefone,
                                ...(h.endereco && f.tipo_pedido === "entrega" && { endereco_entrega: h.endereco }),
                              }));
                              setClienteDropOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                            style={{ borderBottom: i < sugs.length - 1 ? "1px solid var(--border-1)" : "none" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,106,0,0.06)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{ background: "rgba(255,106,0,0.1)", color: "#FF6A00" }}>
                              {h.nome.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{h.nome}</p>
                              {h.telefone && <p className="text-xs" style={{ color: "var(--text-4)" }}>{h.telefone}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
                <div>
                  <input
                    value={form.cliente_telefone}
                    onChange={(e) => setForm((f) => ({ ...f, cliente_telefone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                    className="w-full px-4 py-3 text-sm outline-none bg-transparent placeholder-slate-500"
                    style={{ color: "var(--text-1)" }}
                    onFocus={(e) => (e.target.style.background = "var(--overlay-xs)")}
                    onBlur={(e) => (e.target.style.background = "transparent")}
                  />
                </div>
              </div>

              {/* ── Endereço — só para Delivery ── */}
              {form.tipo_pedido === "entrega" && (
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border-1)" }}>
                  <div className="flex items-center justify-between px-4 py-2.5"
                    style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border-1)" }}>
                    <div className="flex items-center gap-2">
                      <MapPin size={12} style={{ color: "var(--text-4)" }} />
                      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-4)" }}>Endereço</span>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs" style={{ color: "var(--text-3)" }}>Cidade / Estado</span>
                        <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-1)" }}>
                          <button type="button"
                            onClick={() => {
                              setCidadeOrigem("empresa");
                              setEndManual(e => {
                                const next = { ...e, cidade: empresaCidade ?? "", estado: empresaEstado ?? "" };
                                const street = [next.rua, next.numero].filter(Boolean).join(", ");
                                const streetWithBairro = street + (next.bairro ? ` - ${next.bairro}` : "");
                                const extras = [next.complemento, next.referencia ? `Ref: ${next.referencia}` : ""].filter(Boolean).join(", ");
                                next.routeAddress = [streetWithBairro + (extras ? `. ${extras}` : ""), next.cidade, next.estado].filter(Boolean).join(", ");
                                return next;
                              });
                            }}
                            className="px-3 py-1 text-xs font-medium transition-colors"
                            style={{ background: cidadeOrigem === "empresa" ? "rgba(96,165,250,0.15)" : "transparent", color: cidadeOrigem === "empresa" ? "#60a5fa" : "var(--text-4)" }}>
                            Da empresa
                          </button>
                          <button type="button"
                            onClick={() => {
                              setCidadeOrigem("manual");
                              setEndManual(e => {
                                const next = { ...e, cidade: "", estado: "" };
                                const street = [next.rua, next.numero].filter(Boolean).join(", ");
                                const streetWithBairro = street + (next.bairro ? ` - ${next.bairro}` : "");
                                const extras = [next.complemento, next.referencia ? `Ref: ${next.referencia}` : ""].filter(Boolean).join(", ");
                                next.routeAddress = [streetWithBairro + (extras ? `. ${extras}` : ""), next.cidade, next.estado].filter(Boolean).join(", ");
                                return next;
                              });
                            }}
                            className="px-3 py-1 text-xs font-medium transition-colors"
                            style={{ background: cidadeOrigem === "manual" ? "rgba(251,191,36,0.15)" : "transparent", color: cidadeOrigem === "manual" ? "#fbbf24" : "var(--text-4)" }}>
                            Outra cidade
                          </button>
                        </div>
                      </div>

                      {cidadeOrigem === "empresa" && (endManual.cidade || endManual.estado) && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                          style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)" }}>
                          <MapPin size={11} style={{ color: "#60a5fa" }} />
                          <span className="text-xs" style={{ color: "#60a5fa" }}>
                            {[endManual.cidade, endManual.estado].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      )}
                      {cidadeOrigem === "empresa" && !endManual.cidade && !endManual.estado && (
                        <p className="text-xs px-1" style={{ color: "#FF6A00" }}>
                          Empresa sem cidade/estado cadastrado — use "Outra cidade"
                        </p>
                      )}

                      {cidadeOrigem === "manual" && (
                        <div className="grid grid-cols-2 gap-2">
                          <input value={endManual.cidade} onChange={e => updateEndManual("cidade", e.target.value)}
                            placeholder="Cidade" required
                            className="w-full px-3 py-2.5 rounded-xl text-sm placeholder-slate-600 outline-none"
                            style={{ ...IS, color: "var(--text-1)" }} onFocus={e => focus(e, "#fbbf24")} onBlur={blur} />
                          <input value={endManual.estado} onChange={e => updateEndManual("estado", e.target.value)}
                            placeholder="Estado (ex: PE)"
                            className="w-full px-3 py-2.5 rounded-xl text-sm placeholder-slate-600 outline-none"
                            style={{ ...IS, color: "var(--text-1)" }} onFocus={e => focus(e, "#fbbf24")} onBlur={blur} />
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <input value={endManual.rua} onChange={e => updateEndManual("rua", e.target.value)}
                            placeholder="Rua / Av. / Travessa" required autoFocus
                            className="w-full px-3 py-2.5 rounded-xl text-sm placeholder-slate-600 outline-none"
                            style={{ ...IS, color: "var(--text-1)" }} onFocus={e => focus(e)} onBlur={blur} />
                        </div>
                        <input value={endManual.numero} onChange={e => updateEndManual("numero", e.target.value)}
                          placeholder="Nº"
                          className="w-full px-3 py-2.5 rounded-xl text-sm placeholder-slate-600 outline-none"
                          style={{ ...IS, color: "var(--text-1)" }} onFocus={e => focus(e)} onBlur={blur} />
                      </div>
                      <input value={endManual.bairro} onChange={e => updateEndManual("bairro", e.target.value)}
                        placeholder="Bairro" required
                        className="w-full px-3 py-2.5 rounded-xl text-sm placeholder-slate-600 outline-none"
                        style={{ ...IS, color: "var(--text-1)" }} onFocus={e => focus(e)} onBlur={blur} />
                      <div className="grid grid-cols-2 gap-2">
                        <input value={endManual.complemento} onChange={e => updateEndManual("complemento", e.target.value)}
                          placeholder="Complemento (opcional)"
                          className="w-full px-3 py-2.5 rounded-xl text-sm placeholder-slate-600 outline-none"
                          style={{ ...IS, color: "var(--text-1)" }} onFocus={e => focus(e)} onBlur={blur} />
                        <input value={endManual.referencia} onChange={e => updateEndManual("referencia", e.target.value)}
                          placeholder="Ponto de referência"
                          className="w-full px-3 py-2.5 rounded-xl text-sm placeholder-slate-600 outline-none"
                          style={{ ...IS, color: "var(--text-1)" }} onFocus={e => focus(e)} onBlur={blur} />
                      </div>
                      {endManual.routeAddress && (
                        <div className="px-3 py-2 rounded-xl" style={{ background: "var(--bg-base)", border: "1px solid var(--border-1)" }}>
                          <p className="text-xs mb-0.5" style={{ color: "var(--text-4)" }}>Endereço para rota</p>
                          <p className="text-xs" style={{ color: "var(--text-3)" }}>{endManual.routeAddress}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
            {/* ── Coluna direita: itens + pagamento + submit ── */}
            <div className="md:flex-1 md:overflow-y-auto p-4 md:p-5 space-y-4 min-w-0">

              {/* ── Itens ── */}
              <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border-1)" }}>
                <div className="flex items-center gap-2 px-4 py-2.5"
                  style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border-1)" }}>
                  <Package size={12} style={{ color: "var(--text-4)" }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-4)" }}>Itens do pedido</span>
                  {cartItems.length > 0 && (
                    <span className="ml-auto flex items-center justify-center rounded-full text-xs font-bold px-2 py-0.5"
                      style={{ background: "rgba(255,106,0,0.15)", color: "#FF6A00" }}>
                      {cartItems.reduce((s, i) => s + i.qty, 0)} itens
                    </span>
                  )}
                </div>

                {/* Resumo do carrinho */}
                {cartItems.length > 0 && (
                  <div className="px-4 py-3 space-y-2" style={{ borderBottom: "1px solid var(--border-1)" }}>
                    {cartItems.map(item => {
                      const desc = cartDescItem(item);
                      return (
                        <div key={item.cartKey} className="flex items-start gap-2">
                          {item.produto.imagem_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.produto.imagem_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{item.produto.nome}</p>
                            {desc && <p className="text-xs truncate" style={{ color: "var(--text-4)" }}>{desc}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button type="button" onClick={() => cartRemove(item.cartKey)}
                              className="w-6 h-6 rounded-lg flex items-center justify-center"
                              style={{ background: "var(--bg-2)", color: "var(--text-3)", border: "1px solid var(--border-1)" }}>
                              <Minus size={10} />
                            </button>
                            <span className="w-5 text-center text-sm font-bold" style={{ color: "var(--text-1)" }}>{item.qty}</span>
                            <button type="button" onClick={() => cartHasCustom(item.produto) ? openDetail(item.produto) : cartAdd(item.produto)}
                              className="w-6 h-6 rounded-lg flex items-center justify-center"
                              style={{ background: "rgba(255,106,0,0.1)", color: "#FF6A00", border: "1px solid rgba(255,106,0,0.2)" }}>
                              <Plus size={10} />
                            </button>
                            <button type="button" onClick={() => cartRemoveAll(item.cartKey)}
                              className="w-5 h-5 rounded-md flex items-center justify-center"
                              style={{ color: "var(--text-5)" }}>
                              <X size={10} />
                            </button>
                          </div>
                          <span className="text-xs font-semibold w-14 text-right shrink-0" style={{ color: "var(--text-3)" }}>
                            R$ {(item.precoUnit * item.qty).toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Botão abrir catálogo */}
                {produtos.length > 0 && (
                  <button type="button" onClick={() => setShowCatalogoPicker(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-all"
                    style={{ color: "#FF6A00", borderBottom: "1px solid var(--border-1)" }}>
                    <Plus size={14} />
                    Adicionar do catálogo
                    {cartItems.length > 0 && (
                      <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: "rgba(255,106,0,0.12)", color: "#FF6A00" }}>
                        {cartItems.reduce((s, i) => s + i.qty, 0)} itens
                      </span>
                    )}
                  </button>
                )}

                {/* Campo livre para itens extras / pedidos colados */}
                <textarea
                  value={form.descricao_itens}
                  onChange={(e) => setForm((f) => ({ ...f, descricao_itens: e.target.value }))}
                  rows={2} placeholder={produtos.length > 0 ? "Itens extras não catalogados..." : "1x Hambúrguer\n2x Refrigerante..."}
                  className="w-full px-4 py-3 text-sm outline-none resize-none bg-transparent placeholder-slate-500"
                  style={{ color: "var(--text-1)" }}
                />
              </div>

              {/* ── Valores ── */}
              <div className={form.tipo_pedido === "entrega" ? "grid grid-cols-2 gap-3" : ""}>
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border-1)" }}>
                  <div className="flex items-center gap-2 px-3 py-2"
                    style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border-1)" }}>
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-4)" }}>Produtos</span>
                  </div>
                  <div className="relative px-3 py-2.5">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: "var(--text-4)" }}>R$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={form.valor_pedido}
                      onChange={(e) => setForm((f) => ({ ...f, valor_pedido: e.target.value }))}
                      placeholder="0,00"
                      className="w-full pl-8 pr-2 py-1 text-sm outline-none bg-transparent placeholder-slate-500"
                      style={{ color: "var(--text-1)" }}
                    />
                  </div>
                </div>
                {form.tipo_pedido === "entrega" && (
                  <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(251,191,36,0.3)" }}>
                    <div className="flex items-center gap-2 px-3 py-2"
                      style={{ background: "rgba(251,191,36,0.06)", borderBottom: "1px solid rgba(251,191,36,0.2)" }}>
                      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#fbbf24" }}>Taxa entrega</span>
                    </div>
                    <div className="relative px-3 py-2.5">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: "#fbbf24" }}>R$</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={form.valor_motoboy}
                        onChange={(e) => setForm((f) => ({ ...f, valor_motoboy: e.target.value }))}
                        placeholder="0,00"
                        className="w-full pl-8 pr-2 py-1 text-sm outline-none bg-transparent placeholder-slate-500"
                        style={{ color: "#fbbf24" }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Pagamento ── */}
              <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border-1)" }}>
                <div className="flex items-center gap-2 px-4 py-2.5"
                  style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border-1)" }}>
                  <Banknote size={12} style={{ color: "var(--text-4)" }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-4)" }}>Pagamento</span>
                </div>
                <div className="p-3 grid grid-cols-2 gap-2">
                  {([
                    { v: "dinheiro",       label: "Dinheiro",  PgIcon: Banknote,   color: "#22c55e" },
                    { v: "pix",            label: "PIX",       PgIcon: Zap,        color: "#a78bfa" },
                    { v: "cartao_credito", label: "Crédito",   PgIcon: CreditCard, color: "#60a5fa" },
                    { v: "cartao_debito",  label: "Débito",    PgIcon: CreditCard, color: "#38bdf8" },
                  ] as const).map(({ v, label, PgIcon, color }) => {
                    const sel = form.forma_pagamento === v;
                    return (
                      <button key={v} type="button"
                        onClick={() => setForm(f => ({ ...f, forma_pagamento: f.forma_pagamento === v ? "" : v, troco_para: v !== "dinheiro" ? "" : f.troco_para }))}
                        className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-bold transition-all"
                        style={sel
                          ? { background: `${color}1a`, border: `1.5px solid ${color}55`, color }
                          : { background: "var(--bg-base)", border: "1.5px solid var(--border-1)", color: "var(--text-4)" }
                        }>
                        <PgIcon size={18} />
                        {label}
                      </button>
                    );
                  })}
                  {(() => {
                    const sel = form.forma_pagamento === "ja_pago";
                    return (
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, forma_pagamento: f.forma_pagamento === "ja_pago" ? "" : "ja_pago", troco_para: "" }))}
                        className="col-span-2 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all"
                        style={sel
                          ? { background: "rgba(34,197,94,0.12)", border: "1.5px solid rgba(34,197,94,0.4)", color: "#22c55e" }
                          : { background: "var(--bg-base)", border: "1.5px solid var(--border-1)", color: "var(--text-4)" }
                        }>
                        <CheckCircle size={16} />
                        Já pago
                      </button>
                    );
                  })()}
                </div>
                {form.forma_pagamento === "dinheiro" && (
                  <div className="px-3 pb-3 space-y-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium" style={{ color: "var(--text-4)" }}>Troco p/</span>
                      <input type="number" min="0" step="0.01"
                        value={form.troco_para}
                        onChange={(e) => setForm(f => ({ ...f, troco_para: e.target.value }))}
                        placeholder="0,00 (opcional)"
                        className="w-full pl-16 pr-4 py-2.5 rounded-xl text-sm outline-none"
                        style={{ ...IS, color: "var(--text-1)" }}
                        onFocus={(e) => focus(e)}
                        onBlur={(e) => (e.target.style.borderColor = "var(--border-1)")}
                      />
                    </div>
                    {(() => {
                      const pago = parseFloat(form.troco_para);
                      const total = (parseFloat(form.valor_pedido) || 0) + (parseFloat(form.valor_motoboy) || 0);
                      if (!pago || !total) return null;
                      const troco = pago - total;
                      return (
                        <div className="flex items-center justify-between px-3 py-2 rounded-xl"
                          style={{ background: troco >= 0 ? "rgba(34,197,94,0.08)" : "rgba(255,106,0,0.08)", border: `1px solid ${troco >= 0 ? "rgba(34,197,94,0.2)" : "rgba(255,106,0,0.2)"}` }}>
                          <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>
                            {troco >= 0 ? "Troco a devolver" : "⚠ Valor insuficiente"}
                          </span>
                          <span className="text-sm font-black" style={{ color: troco >= 0 ? "#22c55e" : "#FF6A00" }}>
                            {troco >= 0 ? `R$ ${troco.toFixed(2)}` : `Falta R$ ${Math.abs(troco).toFixed(2)}`}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* ── Observações ── */}
              <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border-1)" }}>
                <div className="flex items-center gap-2 px-4 py-2.5"
                  style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border-1)" }}>
                  <FileText size={12} style={{ color: "var(--text-4)" }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-4)" }}>Obs. (opcional)</span>
                </div>
                <textarea
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  rows={2} placeholder="Deixar com porteiro..."
                  className="w-full px-4 py-3 text-sm outline-none resize-none bg-transparent placeholder-slate-500"
                  style={{ color: "var(--text-1)" }}
                />
              </div>

              {/* ── Resumo financeiro ── */}
              {(form.valor_pedido || form.valor_motoboy) && (
                <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg-base)", border: "1px solid var(--border-1)" }}>
                  <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "var(--text-4)" }}>Resumo</p>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--text-3)" }}>Subtotal (produtos)</span>
                    <span className="font-medium" style={{ color: "var(--text-1)" }}>
                      R$ {(parseFloat(form.valor_pedido) || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--text-3)" }}>Taxa de entrega</span>
                    <span style={{ color: form.tipo_pedido === "retirada" ? "var(--text-4)" : "#fbbf24", fontWeight: 500 }}>
                      {form.tipo_pedido === "retirada" ? "R$ 0,00" : `R$ ${(parseFloat(form.valor_motoboy) || 0).toFixed(2)}`}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm pt-2" style={{ borderTop: "1px solid var(--border-1)" }}>
                    <span className="font-bold" style={{ color: "var(--text-1)" }}>Total</span>
                    <span className="font-black" style={{ color: "#FF6A00" }}>
                      R$ {(
                        (parseFloat(form.valor_pedido) || 0) +
                        (form.tipo_pedido === "entrega" ? parseFloat(form.valor_motoboy) || 0 : 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* ── CTA ── */}
              <button type="submit" disabled={saving}
                className="w-full py-4 rounded-2xl text-base font-black transition-all"
                style={{
                  background: saving ? "var(--bg-3)" : "linear-gradient(135deg,#FF6A00,#cc5500)",
                  color: saving ? "var(--text-4)" : "white",
                  boxShadow: saving ? "none" : "0 0 24px rgba(255,106,0,0.35)",
                }}
                onMouseEnter={(e) => { if (!saving) { (e.currentTarget as HTMLElement).style.transform = "scale(1.02)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 0 36px rgba(255,106,0,0.55)"; } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; (e.currentTarget as HTMLElement).style.boxShadow = saving ? "none" : "0 0 24px rgba(255,106,0,0.35)"; }}>
                {saving ? "Criando pedido..." : "Criar pedido 🚀"}
              </button>
            </div>
            </form>
            </div>
            )}

            </div>
          </div>
        </div>
      )}

      {/* ── Catálogo de produtos (estilo loja) ── */}
      {showCatalogoPicker && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCatalogoPicker(false); }}>
          <div className="w-full md:max-w-lg flex flex-col rounded-t-3xl md:rounded-3xl overflow-hidden"
            style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", maxHeight: "90vh" }}>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-1)" }}>
              <Package size={16} style={{ color: "#FF6A00" }} />
              <span className="font-bold text-base flex-1" style={{ color: "var(--text-1)" }}>Catálogo</span>
              {cartItems.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: "rgba(255,106,0,0.12)", color: "#FF6A00" }}>
                  {cartItems.reduce((s, i) => s + i.qty, 0)} itens · R$ {cartItems.reduce((s, i) => s + i.precoUnit * i.qty, 0).toFixed(2)}
                </span>
              )}
              <button type="button" onClick={() => setShowCatalogoPicker(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "var(--bg-2)", color: "var(--text-3)", border: "1px solid var(--border-1)" }}>
                <X size={14} />
              </button>
            </div>

            {/* Busca */}
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                <Search size={13} style={{ color: "var(--text-4)" }} />
                <input autoFocus type="text" placeholder="Buscar produto..." value={buscarProduto}
                  onChange={(e) => setBuscarProduto(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none placeholder-slate-500"
                  style={{ color: "var(--text-1)" }} />
                {buscarProduto && <button type="button" onClick={() => setBuscarProduto("")}><X size={12} style={{ color: "var(--text-4)" }} /></button>}
              </div>
            </div>

            {/* Abas de categoria */}
            {!buscarProduto && (() => {
              const cats = ["Todos", ...Array.from(new Set(produtos.map(p => p.categoria))).sort()];
              return (
                <div className="flex gap-2 px-4 pb-3 shrink-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {cats.map(c => (
                    <button key={c} type="button" onClick={() => setCatSel(c)}
                      className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                      style={catSel === c
                        ? { background: "#FF6A00", color: "white" }
                        : { background: "var(--bg-2)", color: "var(--text-4)", border: "1px solid var(--border-1)" }}>
                      {c}
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Lista de produtos */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
              {(() => {
                const filtrados = produtos.filter(p =>
                  (catSel === "Todos" || p.categoria === catSel) &&
                  (!buscarProduto || p.nome.toLowerCase().includes(buscarProduto.toLowerCase()) || p.categoria.toLowerCase().includes(buscarProduto.toLowerCase()))
                );
                if (filtrados.length === 0) return (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <Package size={28} style={{ color: "var(--text-5)" }} />
                    <p className="text-sm" style={{ color: "var(--text-4)" }}>Nenhum produto encontrado</p>
                  </div>
                );
                return filtrados.map(p => {
                  const qty = cartQty(p.id);
                  const custom = cartHasCustom(p);
                  return (
                    <div key={p.id} className="flex items-center gap-3 rounded-2xl overflow-hidden"
                      style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                      <div style={{ width: 72, height: 72, flexShrink: 0, background: "var(--bg-3)", position: "relative" }}>
                        {p.imagem_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={p.imagem_url} alt={p.nome} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Package size={22} style={{ color: "var(--text-5)" }} />
                            </div>
                        }
                      </div>
                      <div className="flex-1 min-w-0 py-2">
                        <p className="text-sm font-bold truncate" style={{ color: "var(--text-1)" }}>{p.nome}</p>
                        {p.descricao && <p className="text-xs truncate" style={{ color: "var(--text-4)" }}>{p.descricao}</p>}
                        <p className="text-sm font-black mt-0.5" style={{ color: "#FF6A00" }}>
                          {(p.produto_variacoes?.filter(v => v.ativo).length ?? 0) > 0
                            ? `A partir de R$${cartPrecoMin(p).toFixed(2)}`
                            : `R$${p.preco.toFixed(2)}`}
                        </p>
                      </div>
                      <div className="pr-3 shrink-0">
                        {custom ? (
                          <button type="button" onClick={() => openDetail(p)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                            style={{ background: "rgba(255,106,0,0.12)", color: "#FF6A00", border: "1px solid rgba(255,106,0,0.25)" }}>
                            <Plus size={11} />{qty > 0 ? `Ver (${qty})` : "Ver opções"}
                          </button>
                        ) : qty > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => cartRemove(cartBuildKey(p.id))}
                              className="w-7 h-7 rounded-xl flex items-center justify-center"
                              style={{ background: "var(--bg-3)", border: "1px solid var(--border-1)", color: "var(--text-3)" }}>
                              <Minus size={11} />
                            </button>
                            <span className="w-6 text-center text-sm font-black" style={{ color: "#FF6A00" }}>{qty}</span>
                            <button type="button" onClick={() => cartAdd(p)}
                              className="w-7 h-7 rounded-xl flex items-center justify-center"
                              style={{ background: "rgba(255,106,0,0.12)", color: "#FF6A00", border: "1px solid rgba(255,106,0,0.25)" }}>
                              <Plus size={11} />
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => cartAdd(p)}
                            className="w-8 h-8 rounded-xl flex items-center justify-center"
                            style={{ background: "#FF6A00", color: "white", boxShadow: "0 3px 10px rgba(255,106,0,0.35)" }}>
                            <Plus size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 shrink-0" style={{ borderTop: "1px solid var(--border-1)" }}>
              <button type="button" onClick={() => setShowCatalogoPicker(false)}
                className="w-full py-3.5 rounded-2xl text-sm font-black"
                style={{ background: "linear-gradient(135deg,#FF6A00,#cc5500)", color: "white", boxShadow: "0 0 20px rgba(255,106,0,0.3)" }}>
                {cartItems.length > 0
                  ? `Confirmar — ${cartItems.reduce((s, i) => s + i.qty, 0)} itens · R$ ${cartItems.reduce((s, i) => s + i.precoUnit * i.qty, 0).toFixed(2)}`
                  : "Fechar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal detalhe do produto (passo a passo, igual loja cliente) ── */}
      {detailProduto && (() => {
        const p    = detailProduto;
        const detailVars = p.produto_variacoes?.filter(v => v.ativo) ?? [];
        const detailAdds = p.produto_adicionais?.filter(a => a.ativo) ?? [];
        const detailGruposSabor = poolMesclavelPara(p);
        const maxSabores = p && detailVariacao
          ? cartMaxSabores(p, detailVariacao)
          : (detailVars[0] ? cartMaxSabores(p, detailVars[0]) : 1);
        const detailProdutoPrecoBase = p && detailVariacao
          ? cartPrecoVariacao(p, detailVariacao)
          : (p?.preco ?? 0);
        const detailPrecoBase = detailSaboresSel.length > 0
          ? calcularPrecoSabores(detailSaboresSel.map(s => precoDeSabor(s, detailProdutoPrecoBase, detailVariacao?.nome)))
          : detailProdutoPrecoBase;
        const detailPrecoTotal = (detailPrecoBase + detailAdicionaisSel.reduce((s, a) => s + a.preco, 0)) * detailQty;
        const detailSteps: ("variacao" | "sabores" | "adicionais")[] = [
          ...(detailVars.length > 0 ? ["variacao" as const] : []),
          ...(detailGruposSabor.some(g => g.sabores.length > 0) ? ["sabores" as const] : []),
          ...(detailAdds.length > 0 ? ["adicionais" as const] : []),
        ];
        const detailStepIdx    = Math.max(0, detailSteps.indexOf(detailStep));
        const detailIsLastStep = detailStepIdx >= detailSteps.length - 1;
        const detailCanNext    = detailStep !== "sabores" || detailSaboresSel.length > 0;

        return (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={e => { if (e.target === e.currentTarget) setDetailProduto(null); }}>
            <div style={{ width: "100%", maxWidth: 520, background: "#fff", borderRadius: "24px 24px 0 0", maxHeight: "92dvh", overflowY: "auto", boxShadow: "0 -12px 48px rgba(0,0,0,0.2)" }}>

              {/* Imagem */}
              <div style={{ position: "relative", aspectRatio: "1/1", background: "#f8fafc", overflow: "hidden" }}>
                {p.imagem_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.imagem_url} alt={p.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Package size={40} style={{ color: "#e2e8f0" }} /></div>
                }
                <button type="button" onClick={() => setDetailProduto(null)}
                  style={{ position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: 10, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
                {/* Nome + descrição */}
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-0.02em" }}>{p.nome}</h2>
                  {p.descricao && <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.5 }}>{p.descricao}</p>}
                </div>

                {/* Indicador de passos */}
                {detailSteps.length > 1 && (
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    {detailSteps.map((s, i) => (
                      <div key={s} style={{
                        height: 5, borderRadius: 3,
                        width: i === detailStepIdx ? 22 : 5,
                        background: i <= detailStepIdx ? cor : "#e2e8f0",
                        transition: "all 0.25s",
                      }} />
                    ))}
                  </div>
                )}

                {/* Passo: Variação */}
                {detailStep === "variacao" && detailVars.length > 0 && (
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>Tamanho *</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {detailVars.map(v => (
                        <button key={v.id} type="button" onClick={() => { setDetailVariacao(v); setDetailSaboresSel([]); }}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "13px 16px", borderRadius: 12,
                            border: `2px solid ${detailVariacao?.id === v.id ? cor : "#e2e8f0"}`,
                            background: detailVariacao?.id === v.id ? `${cor}08` : "#f8fafc",
                            cursor: "pointer", transition: "all 0.15s",
                          }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                              border: `2px solid ${detailVariacao?.id === v.id ? cor : "#d1d5db"}`,
                              background: detailVariacao?.id === v.id ? cor : "#fff",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              {detailVariacao?.id === v.id && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{v.nome}</span>
                            {cartMaxSabores(p, v) > 1 && (
                              <span style={{ fontSize: 11, color: "#94a3b8" }}>até {cartMaxSabores(p, v)} sab.</span>
                            )}
                          </div>
                          <span style={{ fontSize: 15, fontWeight: 900, color: cor }}>R${cartPrecoVariacao(p, v).toFixed(2)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Passo: Sabores — produtos vinculados explicitamente */}
                {detailStep === "sabores" && detailGruposSabor.some(g => g.sabores.length > 0) && (
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
                        {maxSabores > 1 ? `Sabores (até ${maxSabores})` : "Sabor *"}
                      </p>
                      <span style={{ fontSize: 12, fontWeight: 700, color: detailSaboresSel.length >= maxSabores ? cor : "#94a3b8" }}>
                        {detailSaboresSel.length}/{maxSabores} selecionado{detailSaboresSel.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {/* Calculadora — sempre visível ACIMA da lista */}
                    {detailSaboresSel.length === 0 ? (
                      <div style={{ margin: "0 0 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" }}>
                        <p style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>
                          {modoCalculo === "proporcional" ? "⚖️ Proporcional" : "🏆 Maior valor"}
                        </p>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>
                            {modoCalculo === "proporcional" ? "Média dos sabores escolhidos" : "Sabor mais caro"}
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 900, color: "#cbd5e1" }}>R${detailProdutoPrecoBase.toFixed(2)}</span>
                        </div>
                      </div>
                    ) : (() => {
                      const tamanhoNome = detailVariacao?.nome;
                      const efetivos = detailSaboresSel.map(s => ({
                        sabor: s,
                        preco: precoDeSabor(s, detailProdutoPrecoBase, tamanhoNome),
                      }));
                      const soma = efetivos.reduce((a, b) => a + b.preco, 0);
                      const maiorPreco = Math.max(...efetivos.map(e => e.preco));
                      const precoFinal = modoCalculo === "proporcional" ? soma / efetivos.length : maiorPreco;
                      return (
                        <div style={{ margin: "0 0 14px", background: `${cor}08`, border: `1px solid ${cor}25`, borderRadius: 12, padding: "12px 14px" }}>
                          <p style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>
                            {modoCalculo === "proporcional" ? "⚖️ Proporcional" : "🏆 Maior valor"}
                          </p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {efetivos.map(({ sabor: s, preco }) => {
                              const isMaior = modoCalculo === "maior_valor" && preco === maiorPreco;
                              const n = efetivos.length;
                              return (
                                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                                  <span style={{ color: isMaior ? "#0f172a" : "#64748b", fontWeight: isMaior ? 700 : 400 }}>
                                    {s.nome}
                                  </span>
                                  {modoCalculo === "proporcional" && n > 1 ? (
                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <span style={{ fontSize: 11, color: "#94a3b8" }}>R${preco.toFixed(2)} ÷ {n}</span>
                                      <span style={{ fontWeight: 700, color: "#475569" }}>= R${(preco / n).toFixed(2)}</span>
                                    </span>
                                  ) : (
                                    <span style={{ fontWeight: isMaior ? 900 : 600, color: isMaior ? cor : "#475569" }}>
                                      R${preco.toFixed(2)}{isMaior && n > 1 ? " ★" : ""}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                            <div style={{ borderTop: `1px solid ${cor}30`, marginTop: 6, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Preço base</span>
                              <span style={{ fontSize: 16, fontWeight: 900, color: cor }}>R${precoFinal.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {/* Lista de sabores agrupados por produto */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {detailGruposSabor.map(({ produto: sp, sabores }) => (
                        <div key={sp.id}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 999, padding: "2px 9px" }}>
                              {sp.nome}
                            </span>
                            <div style={{ flex: 1, height: 1, background: "#f1f5f9" }} />
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {sabores.map(s => {
                              const sel = detailSaboresSel.some(x => x.id === s.id);
                              const disabled = !sel && detailSaboresSel.length >= maxSabores;
                              return (
                                <button key={s.id} type="button"
                                  onClick={() => {
                                    if (sel) setDetailSaboresSel(prev => prev.filter(x => x.id !== s.id));
                                    else if (!disabled) setDetailSaboresSel(prev => [...prev, s]);
                                  }}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 12,
                                    padding: "11px 14px", borderRadius: 12, textAlign: "left",
                                    border: `2px solid ${sel ? cor : "#e2e8f0"}`,
                                    background: sel ? `${cor}08` : "#f8fafc",
                                    cursor: disabled ? "not-allowed" : "pointer",
                                    transition: "all 0.15s", opacity: disabled ? 0.4 : 1,
                                  }}>
                                  <div style={{
                                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                                    border: `2px solid ${sel ? cor : "#d1d5db"}`,
                                    background: sel ? cor : "#fff",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}>
                                    {sel && <div style={{ width: 8, height: 8, background: "#fff", borderRadius: 2 }} />}
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>{s.nome}</p>
                                    {s.descricao && <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0 0" }}>{s.descricao}</p>}
                                  </div>
                                  {(() => {
                                    const efetivo = precoDeSabor(s, detailProdutoPrecoBase, detailVariacao?.nome);
                                    const isBase = efetivo === detailProdutoPrecoBase;
                                    return (
                                      <span style={{ fontSize: 12, fontWeight: 800, color: isBase ? "#94a3b8" : cor, flexShrink: 0 }}>
                                        R${efetivo.toFixed(2)}
                                      </span>
                                    );
                                  })()}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Botão flutuante quando sabores preenchidos */}
                    {detailSaboresSel.length >= maxSabores && (
                      <div style={{ position: "sticky", bottom: 0, left: 0, right: 0, paddingTop: 12, background: "linear-gradient(transparent, #fff 30%)" }}>
                        <button type="button"
                          onClick={() => {
                            if (!detailIsLastStep) setDetailStep(detailSteps[detailStepIdx + 1]);
                            else confirmDetail();
                          }}
                          style={{
                            width: "100%", padding: "15px", borderRadius: 14,
                            background: cor, color: "#fff", border: "none",
                            fontSize: 15, fontWeight: 900, cursor: "pointer",
                            boxShadow: `0 6px 20px ${cor}50`,
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                          }}>
                          {detailIsLastStep
                            ? `Adicionar · R$${detailPrecoTotal.toFixed(2)}`
                            : `Próximo → R$${detailPrecoBase.toFixed(2)}`}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Passo: Adicionais */}
                {detailStep === "adicionais" && detailAdds.length > 0 && (
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>
                      Adicionais
                      <span style={{ fontWeight: 500, marginLeft: 6, color: "#94a3b8", textTransform: "none" }}>— opcional</span>
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {detailAdds.map(a => {
                        const sel = detailAdicionaisSel.some(x => x.id === a.id);
                        return (
                          <button key={a.id} type="button"
                            onClick={() => setDetailAdicionaisSel(prev => sel ? prev.filter(x => x.id !== a.id) : [...prev, a])}
                            style={{
                              display: "flex", alignItems: "center", gap: 12,
                              padding: "11px 14px", borderRadius: 12,
                              border: `2px solid ${sel ? cor : "#e2e8f0"}`,
                              background: sel ? `${cor}08` : "#f8fafc",
                              cursor: "pointer", transition: "all 0.15s", textAlign: "left",
                            }}>
                            <div style={{
                              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                              border: `2px solid ${sel ? cor : "#d1d5db"}`,
                              background: sel ? cor : "#fff",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              {sel && <div style={{ width: 8, height: 8, background: "#fff", borderRadius: 2 }} />}
                            </div>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{a.nome}</span>
                            {a.preco > 0 && (
                              <span style={{ fontSize: 13, fontWeight: 800, color: cor }}>+R${a.preco.toFixed(2)}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Rodapé: Voltar / Qty / Próximo ou Adicionar */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {detailStepIdx > 0 && (
                    <button type="button"
                      onClick={() => setDetailStep(detailSteps[detailStepIdx - 1])}
                      style={{
                        padding: "14px 18px", borderRadius: 14,
                        background: "#f1f5f9", border: "none",
                        cursor: "pointer", color: "#64748b", fontWeight: 700, fontSize: 13, flexShrink: 0,
                      }}>
                      ← Voltar
                    </button>
                  )}
                  {detailIsLastStep && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", borderRadius: 12, padding: "8px 14px", border: "1px solid #e2e8f0", flexShrink: 0 }}>
                      <button type="button" onClick={() => setDetailQty(q => Math.max(1, q - 1))}
                        style={{ width: 30, height: 30, borderRadius: 8, background: "#fff", border: "1px solid #e2e8f0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Minus size={14} style={{ color: "#64748b" }} />
                      </button>
                      <span style={{ fontSize: 17, fontWeight: 900, color: "#0f172a", minWidth: 20, textAlign: "center" }}>{detailQty}</span>
                      <button type="button" onClick={() => setDetailQty(q => q + 1)}
                        style={{ width: 30, height: 30, borderRadius: 8, background: cor, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Plus size={14} style={{ color: "#fff" }} />
                      </button>
                    </div>
                  )}
                  <button type="button"
                    onClick={() => {
                      if (!detailIsLastStep) {
                        setDetailStep(detailSteps[detailStepIdx + 1]);
                      } else {
                        confirmDetail();
                      }
                    }}
                    disabled={!detailCanNext}
                    style={{
                      flex: 1, padding: "14px", borderRadius: 14,
                      background: detailCanNext ? cor : "#e2e8f0",
                      color: detailCanNext ? "#fff" : "#94a3b8",
                      border: "none", fontSize: 14, fontWeight: 900,
                      cursor: detailCanNext ? "pointer" : "not-allowed",
                      boxShadow: detailCanNext ? `0 6px 20px ${cor}40` : "none",
                      transition: "all 0.2s",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}>
                    {detailIsLastStep ? `Adicionar · R$${detailPrecoTotal.toFixed(2)}` : "Próximo →"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

