"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadImage } from "@/lib/uploadImage";
import {
  Zap, MapPin, Navigation, CheckCircle,
  WifiOff, Wifi, LogOut, Eye, EyeOff, Loader2,
  DollarSign, BarChart2, Mail, Building2,
  X, Copy, Star, Camera, Home, User, Power,
  Car, Bike, Save, Award, Hash, Clock, Package, Bell,
  Phone, MessageCircle, ChevronLeft, Send,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { Motoboy, Pedido, PedidoStatus } from "@/types";

const MotoboyMapDynamic = dynamic(
  () => import("@/components/map/MotoboyMapLeaflet"),
  {
    ssr: false,
    loading: () => (
      <div style={{ position: "absolute", inset: 0, background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#94a3b8", fontSize: 12 }}>Carregando mapa...</div>
      </div>
    ),
  }
);

const REMEMBER_KEY = "vellox_mb_remember";
const SESSION_KEY  = "vellox_mb_active";

type Tab = "inicio" | "pedidos" | "mapa" | "desempenho" | "financeiro" | "chat" | "perfil";
type ReportPeriod = "hoje" | "semana" | "mes";
interface ReportData { entregas: number; ganhos: number; }
interface Convite { id: string; empresa_id: string; empresa_nome: string; created_at: string; }
interface BadgeInfo { label: string; emoji: string; color: string; }
interface EntregaHistorico { id: string; cliente_nome: string; endereco_entrega: string; valor_motoboy: number; distancia_km: number | null; created_at: string; }
interface MensagemMotoboy { id: string; remetente: "empresa" | "motoboy"; texto: string; lido: boolean; created_at: string; }
interface PedidoFila { id: string; empresa_id: string; empresa_nome: string | null; empresa_logo_url: string | null; motoboy_id: string | null; route_id: string | null; route_address: string | null; cliente_nome: string; cliente_telefone: string; endereco_entrega: string; endereco_lat: number | null; endereco_lng: number | null; descricao_itens: string | null; valor_pedido: number; valor_motoboy: number; forma_pagamento: string | null; troco_para: number | null; distancia_km: number | null; status: PedidoStatus; observacoes: string | null; created_at: string; updated_at: string; }
interface RotaAtiva { id: string; status: "aguardando_saida" | "em_rota" | "parcialmente_entregue" | "concluida"; saiu_em: string | null; created_at: string; pedidos: PedidoFila[]; }

const TABS = [
  { key: "inicio",     Icon: Home,          label: "Início" },
  { key: "pedidos",    Icon: Package,       label: "Pedidos" },
  { key: "mapa",       Icon: MapPin,        label: "Mapa" },
  { key: "desempenho", Icon: BarChart2,     label: "Stats" },
  { key: "financeiro", Icon: DollarSign,    label: "Ganhos" },
  { key: "chat",       Icon: MessageCircle, label: "Chat" },
  { key: "perfil",     Icon: User,          label: "Perfil" },
] as const;

function periodStart(p: ReportPeriod): Date {
  const now = new Date();
  if (p === "hoje")   return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === "semana") return new Date(now.getTime() - 7 * 86400000);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const PAGAMENTO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  dinheiro:       { label: "💵 Dinheiro",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  pix:            { label: "📱 PIX",       color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  cartao_credito: { label: "💳 Crédito",   color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  cartao_debito:  { label: "💳 Débito",    color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  ja_pago:        { label: "✓ Já pago",   color: "#22c55e", bg: "rgba(34,197,94,0.12)"  },
};

function PagamentoBadge({ forma, troco, small }: { forma: string; troco: number | null; small?: boolean }) {
  const cfg = PAGAMENTO_CFG[forma];
  if (!cfg) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`font-bold rounded-lg ${small ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1.5"}`}
        style={{ background: cfg.bg, color: cfg.color }}>
        {cfg.label}
      </span>
      {forma === "dinheiro" && troco && troco > 0 && (
        <span className={`font-medium rounded-lg ${small ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1.5"}`}
          style={{ background: "rgba(251,191,36,0.06)", color: "#f59e0b", border: "1px solid rgba(251,191,36,0.2)" }}>
          Troco p/ R$ {troco.toFixed(2)}
        </span>
      )}
    </div>
  );
}

function StarRating({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size}
          style={{ color: i <= Math.round(value) ? "#fbbf24" : "#292929" }}
          fill={i <= Math.round(value) ? "#fbbf24" : "transparent"} />
      ))}
    </div>
  );
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function nearestNeighborRoute(
  pedidos: PedidoFila[],
  fromLat: number,
  fromLng: number,
): { pedido: PedidoFila; distKm: number }[] {
  const pending = pedidos.filter(p => p.status !== "entregue");
  const done    = pedidos.filter(p => p.status === "entregue");
  const result: { pedido: PedidoFila; distKm: number }[] = [];

  let curLat = fromLat;
  let curLng = fromLng;
  const remaining = [...pending];

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((p, i) => {
      if (p.endereco_lat && p.endereco_lng) {
        const d = haversineKm(curLat, curLng, p.endereco_lat, p.endereco_lng);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
    });
    const chosen = remaining.splice(bestIdx, 1)[0];
    result.push({ pedido: chosen, distKm: bestDist === Infinity ? 0 : bestDist });
    if (chosen.endereco_lat && chosen.endereco_lng) {
      curLat = chosen.endereco_lat;
      curLng = chosen.endereco_lng;
    }
  }

  done.forEach(p => result.push({ pedido: p, distKm: 0 }));
  return result;
}

function AddressMapLink({ lat, lng, label, routeAddress }: {
  lat: number | null; lng: number | null; label: string; routeAddress?: string | null;
}) {
  if (!label) return null;
  const dest = routeAddress ?? label;
  const gmapsUrl = lat && lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
  const wazeUrl = lat && lng
    ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(dest)}&navigate=yes`;
  return (
    <div className="mt-2 rounded-xl" style={{ border: "1px solid rgba(228,0,43,0.2)", background: "rgba(228,0,43,0.05)" }}>
      <div className="px-3 py-2.5">
        <p className="text-xs text-white truncate mb-2">{label}</p>
        <div className="grid grid-cols-2 gap-2">
          <a href={wazeUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold text-white"
            style={{ background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.3)" }}>
            <Navigation size={11} /> Waze
          </a>
          <a href={gmapsUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold text-white"
            style={{ background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.3)" }}>
            <MapPin size={11} /> Google Maps
          </a>
        </div>
      </div>
    </div>
  );
}

function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;
    if (value === from) return;
    const dur = 700;
    const t0 = Date.now();
    function tick() {
      const p = Math.min((Date.now() - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [value]);
  return <>{decimals > 0 ? display.toFixed(decimals) : Math.round(display)}</>;
}

function getBadges(total: number, km: number): BadgeInfo[] {
  const b: BadgeInfo[] = [];
  if (total >= 1)   b.push({ label: "Ativo",          emoji: "🏅", color: "#22c55e" });
  if (total >= 10)  b.push({ label: "Dedicado",        emoji: "⭐", color: "#60a5fa" });
  if (total >= 50)  b.push({ label: "Top Entregador",  emoji: "🏆", color: "#fbbf24" });
  if (total >= 100) b.push({ label: "Lendário",        emoji: "👑", color: "#a78bfa" });
  if (km >= 100)    b.push({ label: "Rodante",         emoji: "🛣️",  color: "#34d399" });
  if (km >= 500)    b.push({ label: "Maratonista",     emoji: "🚀", color: "#FFC72C" });
  return b;
}

export default function MotoboyApp() {
  const supabase = createClient();

  // ── Auth ──────────────────────────────────────────────────────
  const [step,       setStep]       = useState<"checking" | "login" | "app">("checking");
  const [email,      setEmail]      = useState("");
  const [senha,      setSenha]      = useState("");
  const [showPass,   setShowPass]   = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [authError,  setAuthError]  = useState("");
  const [logging,    setLogging]    = useState(false);

  // ── Core data ─────────────────────────────────────────────────
  const [motoboy,     setMotoboy]     = useState<Motoboy | null>(null);
  const [pedido,      setPedido]      = useState<Pedido | null>(null);
  const [pedidosDisp, setPedidosDisp] = useState<Pedido[]>([]);
  const [convites,    setConvites]    = useState<Convite[]>([]);
  const [empresaIds,  setEmpresaIds]  = useState<string[]>([]);

  // ── GPS ───────────────────────────────────────────────────────
  const [gpsAtivo,       setGpsAtivo]       = useState(false);
  const [gpsSolicitando, setGpsSolicitando] = useState(false);
  const [coords,         setCoords]         = useState<{ lat: number; lng: number } | null>(null);
  const watchRef = useRef<number | null>(null);
  const tabScrollRef = useRef<HTMLDivElement>(null);

  // ── Actions ───────────────────────────────────────────────────
  const [aceitando,      setAceitando]      = useState<string | null>(null);
  const [entregando,     setEntregando]     = useState(false);
  const [iniciandoRota,  setIniciandoRota]  = useState(false);
  const [respondendo,    setRespondendo]    = useState<string | null>(null);
  const [copiadoCodigo,  setCopiadoCodigo]  = useState(false);

  // ── Toast ─────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, tipo: "ok" | "erro" = "ok") {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, tipo });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }

  // ── UI ────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>("inicio");

  // ── Performance ───────────────────────────────────────────────
  const [totalEntregas, setTotalEntregas] = useState(0);
  const [entregasHoje,  setEntregasHoje]  = useState(0);
  const [kmTotais,      setKmTotais]      = useState(0);
  const [ranking,       setRanking]       = useState<number | null>(null);
  const [period,        setPeriod]        = useState<ReportPeriod>("hoje");
  const [report,        setReport]        = useState<ReportData>({ entregas: 0, ganhos: 0 });

  // ── Perfil editing ────────────────────────────────────────────
  const [editNome,     setEditNome]     = useState("");
  const [editVeiculo,  setEditVeiculo]  = useState("moto");
  const [editArea,     setEditArea]     = useState("");
  const [savingPerfil, setSavingPerfil] = useState(false);
  const [perfilSalvo,  setPerfilSalvo]  = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Financeiro extra ──────────────────────────────────────────
  const [tempoMedio,       setTempoMedio]       = useState<number | null>(null);
  const [historicoEntregas, setHistoricoEntregas] = useState<EntregaHistorico[]>([]);

  // ── Rota ativa (múltiplos pedidos) ───────────────────────────────
  const [rota,          setRota]          = useState<RotaAtiva | null>(null);
  const [entregandoItem, setEntregandoItem] = useState<string | null>(null);

  // ── Fila de pedidos da empresa ────────────────────────────────
  const [pedidosFila,    setPedidosFila]    = useState<PedidoFila[]>([]);
  const [refreshingFila, setRefreshingFila] = useState(false);

  // ── Perfil extra ──────────────────────────────────────────────
  const [togglingStatus, setTogglingStatus] = useState(false);

  // ── Pagamento interativo ──────────────────────────────────────
  const [formaPagamentoLocal, setFormaPagamentoLocal] = useState<Record<string, string>>({});
  const [salvandoPagamento,   setSalvandoPagamento]   = useState<string | null>(null);

  // ── Navegação / modal de mapa ──────────────────────────────────
  const [navModal, setNavModal] = useState<{
    lat: number | null; lng: number | null;
    endereco: string; tipo: "entrega" | "retorno";
  } | null>(null);
  const [inicioRotaAt,  setInicioRotaAt]  = useState<Date | null>(null);
  const [rotaAtivaNow,  setRotaAtivaNow]  = useState(new Date()); // updated every 30s via RotaTimer
  const [mostraRetorno, setMostraRetorno] = useState(false);
  const [retornandoBase, setRetornandoBase] = useState(false);
  const [chegouBase,    setChegouBase]    = useState(false);

  // ── Chat ──────────────────────────────────────────────────────
  const [chatMsgs,    setChatMsgs]    = useState<MensagemMotoboy[]>([]);
  const [chatTexto,   setChatTexto]   = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatUnread,  setChatUnread]  = useState(0);
  const [chatLoaded,  setChatLoaded]  = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // (map state managed by MotoboyMapDynamic component)

  // ── Reset scroll ao trocar aba (window + container) ──────────
  useEffect(() => {
    window.scrollTo(0, 0);
    if (tabScrollRef.current) tabScrollRef.current.scrollTop = 0;
  }, [tab]);

  // ── Desabilita scroll restoration do Chrome no Android ────────
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
  }, []);

  // ── Session check ─────────────────────────────────────────────
  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setStep("login"); return; }
      const isRemembered  = localStorage.getItem(REMEMBER_KEY) === "1";
      const sessionActive = sessionStorage.getItem(SESSION_KEY) === "1";
      if (!isRemembered && !sessionActive) {
        await supabase.auth.signOut();
        setStep("login");
        return;
      }
      sessionStorage.setItem(SESSION_KEY, "1");
      await inicializarApp(user.id);
    }
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Populate edit fields when motoboy loads ───────────────────
  useEffect(() => {
    if (motoboy) {
      setEditNome(motoboy.nome);
      setEditVeiculo(motoboy.veiculo_tipo ?? "moto");
      setEditArea(motoboy.area_atuacao ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motoboy?.id]);

  // ── Realtime: pedidos (uma subscription por empresa) + routes + chat ────
  useEffect(() => {
    if (!motoboy || empresaIds.length === 0) return;

    const pedChannels = empresaIds.map(empId =>
      supabase.channel(`mb-pedidos-${motoboy.id}-${empId}`)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "pedidos",
          filter: `empresa_id=eq.${empId}`,
        }, (payload) => {
          const novo = payload.new as Pedido;
          loadPedidosFila();
          if (novo.motoboy_id === motoboy.id) {
            if (novo.route_id) {
              loadRotaAtiva(motoboy.id);
            } else if (novo.status === "em_coleta" || novo.status === "em_rota_de_entrega") {
              setPedido(novo);
            } else if (novo.status === "aguardando_confirmacao" || novo.status === "entregue" || novo.status === "cancelado") {
              setPedido(null);
              loadPedidosDisponiveis(motoboy);
            }
          } else {
            loadPedidosDisponiveis(motoboy);
          }
        })
        .subscribe()
    );

    const rotaCh = supabase
      .channel(`mb-routes-${motoboy.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "delivery_routes",
        filter: `motoboy_id=eq.${motoboy.id}`,
      }, () => loadRotaAtiva(motoboy.id))
      .subscribe();
    const chatCh = supabase
      .channel(`mb-chat-${motoboy.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "mensagens",
        filter: `motoboy_id=eq.${motoboy.id}`,
      }, (payload) => {
        const nova = payload.new as MensagemMotoboy;
        setChatMsgs(prev => [...prev, nova]);
        if (nova.remetente === "empresa") {
          setChatUnread(n => n + 1);
        }
      })
      .subscribe();
    return () => {
      pedChannels.forEach(ch => supabase.removeChannel(ch));
      supabase.removeChannel(rotaCh);
      supabase.removeChannel(chatCh);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motoboy?.id, empresaIds]);

  // ── Scroll chat ao abrir ─────────────────────────────────────
  useEffect(() => {
    if (tab === "chat") {
      setChatUnread(0);
      if (motoboy) {
        supabase.from("mensagens")
          .update({ lido: true })
          .eq("motoboy_id", motoboy.id)
          .eq("remetente", "empresa")
          .eq("lido", false);
      }
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, chatMsgs.length]);

  // ── Timer de rota ativa (30s → RotaTimer cuida disso internamente) ───
  useEffect(() => {
    if (!inicioRotaAt) return;
    const id = setInterval(() => setRotaAtivaNow(new Date()), 30000);
    return () => clearInterval(id);
  }, [inicioRotaAt]);

  // ── Re-fetch ao voltar para a tela (phone unlock / tab focus) ──
  useEffect(() => {
    if (!motoboy) return;
    function onVisible() {
      if (document.visibilityState === "visible") {
        loadRotaAtiva(motoboy!.id);
        loadPedidoAtivo(motoboy!.id);
        loadPedidosFila();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motoboy?.id]);

  // ── Report on period change ───────────────────────────────────
  useEffect(() => {
    if (motoboy) loadReport(motoboy, period);
  }, [period, motoboy]); // eslint-disable-line

  // Cleanup GPS on unmount
  useEffect(() => {
    return () => {
      watchRef.current && navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  // ── Data loaders ─────────────────────────────────────────────

  async function inicializarApp(authId: string) {
    let { data: mb } = await supabase.from("motoboys").select("*").eq("auth_id", authId).single();

    // Motoboy registrado via e-mail de confirmação não tem linha na tabela → criar agora
    if (!mb) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const nome      = (authUser?.user_metadata?.nome as string | undefined) ?? authUser?.email?.split("@")[0] ?? "Motoboy";
      const telefone  = (authUser?.user_metadata?.telefone as string | undefined) ?? "";
      const email     = authUser?.email ?? "";
      const { data: newMb } = await supabase.from("motoboys").insert({
        auth_id: authId, nome, telefone, email, status: "disponivel", posicao_fila: 999,
      }).select().single();
      mb = newMb;
    }

    if (!mb) {
      await loadConvites();
      setStep("app");
      iniciarGPS();
      return;
    }
    const motoboyData = mb as Motoboy;
    setMotoboy(motoboyData);
    await Promise.all([
      loadPedidoAtivo(motoboyData.id),
      loadRotaAtiva(motoboyData.id),
      loadReport(motoboyData, "hoje"),
      loadStats(motoboyData),
      loadHistorico(motoboyData.id),
      loadConvites(),
      loadEmpresaIds(),
      loadPedidosFila(),
      loadChatMsgs(motoboyData.id, motoboyData.empresa_id),
    ]);
    setStep("app");
    iniciarGPS(motoboyData);
  }

  async function loadChatMsgs(motoboyId: string, empresaId: string | null) {
    if (!empresaId) return;
    const { data } = await supabase
      .from("mensagens")
      .select("id, remetente, texto, lido, created_at")
      .eq("empresa_id", empresaId)
      .eq("motoboy_id", motoboyId)
      .order("created_at", { ascending: true })
      .limit(200);
    const msgs = (data ?? []) as MensagemMotoboy[];
    setChatMsgs(msgs);
    setChatUnread(msgs.filter(m => m.remetente === "empresa" && !m.lido).length);
    setChatLoaded(true);
  }

  async function enviarChatMsg(motoboyId: string, empresaId: string) {
    if (!chatTexto.trim() || chatSending) return;
    const t = chatTexto.trim();
    setChatTexto("");
    setChatSending(true);
    await supabase.from("mensagens").insert({
      empresa_id: empresaId,
      motoboy_id: motoboyId,
      remetente: "motoboy",
      texto: t,
    });
    setChatSending(false);
  }

  async function loadPedidoAtivo(motoboyId: string) {
    const { data } = await supabase
      .from("pedidos")
      .select("*")
      .eq("motoboy_id", motoboyId)
      .is("route_id", null)
      .in("status", ["em_coleta", "em_rota_de_entrega"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setPedido(data as Pedido);
  }

  async function loadRotaAtiva(motoboyId: string) {
    const { data } = await supabase
      .from("delivery_routes")
      .select("*, pedidos(*)")
      .eq("motoboy_id", motoboyId)
      .in("status", ["aguardando_saida", "em_rota", "parcialmente_entregue"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRota(data ? { ...data, pedidos: (data.pedidos ?? []) as PedidoFila[] } : null);
  }

  async function loadPedidosDisponiveis(_mb?: Motoboy) {
    await loadPedidosFila();
  }

  async function loadConvites() {
    const { data } = await supabase.rpc("get_meus_convites");
    setConvites((data ?? []) as Convite[]);
  }

  async function loadEmpresaIds() {
    const { data } = await supabase.rpc("get_motoboy_empresas");
    const ids = ((data ?? []) as { empresa_id: string }[]).map(r => r.empresa_id);
    setEmpresaIds(ids);
  }

  const loadReport = useCallback(async (mb: Motoboy, p: ReportPeriod) => {
    const { data } = await supabase
      .from("pedidos")
      .select("valor_motoboy")
      .eq("motoboy_id", mb.id)
      .eq("status", "entregue")
      .gte("created_at", periodStart(p).toISOString());
    const rows = data ?? [];
    setReport({ entregas: rows.length, ganhos: rows.reduce((s, r) => s + (r.valor_motoboy ?? 0), 0) });
  }, [supabase]); // eslint-disable-line

  async function loadStats(mb: Motoboy) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("pedidos")
      .select("distancia_km, created_at, updated_at")
      .eq("motoboy_id", mb.id)
      .eq("status", "entregue");

    const entregues = data ?? [];
    setTotalEntregas(entregues.length);
    setEntregasHoje(entregues.filter(p => new Date(p.created_at) >= hoje).length);
    setKmTotais(Number(entregues.reduce((s, p) => s + (p.distancia_km ?? 0), 0).toFixed(1)));

    if (entregues.length > 0) {
      const totalMin = entregues.reduce((s, p) => {
        const diff = new Date(p.updated_at ?? p.created_at).getTime() - new Date(p.created_at).getTime();
        return s + diff / 60000;
      }, 0);
      setTempoMedio(Math.round(totalMin / entregues.length));
    }

    if (mb.empresa_id) {
      const { data: all } = await supabase
        .from("pedidos")
        .select("motoboy_id")
        .eq("empresa_id", mb.empresa_id)
        .eq("status", "entregue")
        .not("motoboy_id", "is", null);

      const counts: Record<string, number> = {};
      (all ?? []).forEach(p => {
        if (p.motoboy_id) counts[p.motoboy_id] = (counts[p.motoboy_id] || 0) + 1;
      });
      const myCount = counts[mb.id] ?? 0;
      setRanking(Object.values(counts).filter(c => c > myCount).length + 1);
    }
  }

  async function loadPedidosFila(showSpinner = false) {
    if (showSpinner) setRefreshingFila(true);
    const { data } = await supabase.rpc("get_fila_pedidos_motoboy");
    const fila = (data ?? []) as PedidoFila[];
    setPedidosFila(fila);
    setPedidosDisp(fila.filter(p => p.status === "finalizado" && !p.motoboy_id) as unknown as Pedido[]);
    if (showSpinner) setRefreshingFila(false);
  }

  async function loadHistorico(motoboyId: string) {
    const { data } = await supabase
      .from("pedidos")
      .select("id, cliente_nome, endereco_entrega, valor_motoboy, distancia_km, created_at")
      .eq("motoboy_id", motoboyId)
      .eq("status", "entregue")
      .order("created_at", { ascending: false })
      .limit(30);
    setHistoricoEntregas((data ?? []) as EntregaHistorico[]);
  }

  // ── Handlers ─────────────────────────────────────────────────

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLogging(true);
    setAuthError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error || !data.user) { setAuthError("Email ou senha inválidos."); setLogging(false); return; }
    rememberMe ? localStorage.setItem(REMEMBER_KEY, "1") : localStorage.removeItem(REMEMBER_KEY);
    sessionStorage.setItem(SESSION_KEY, "1");
    document.cookie = "vellox_mb_device=1; max-age=31536000; path=/; SameSite=Strict";
    setLogging(false);
    await inicializarApp(data.user.id);
  }

  async function aceitarPedido(pedidoId: string) {
    if (!motoboy) return;

    // Guard local: pedido sumiu da lista
    const pedidoLocal = pedidosDisp.find(p => p.id === pedidoId);
    if (!pedidoLocal) {
      showToast("Esse pedido não está mais disponível.", "erro");
      return;
    }

    setAceitando(pedidoId);

    // Pré-verificação: estado atual do pedido no banco
    const { data: pedidoDb, error: errPedido } = await supabase
      .from("pedidos")
      .select("id, status, motoboy_id")
      .eq("id", pedidoId)
      .maybeSingle();

    if (errPedido) {
      showToast("Falha na conexão com o servidor.", "erro");
      setAceitando(null);
      return;
    }
    if (!pedidoDb) {
      showToast("Pedido não encontrado.", "erro");
      await loadPedidosFila();
      setAceitando(null);
      return;
    }
    if (pedidoDb.motoboy_id) {
      showToast("Pedido já aceito por outro motoboy.", "erro");
      await loadPedidosFila();
      setAceitando(null);
      return;
    }
    if (pedidoDb.status !== "finalizado") {
      showToast("Pedido não está mais disponível.", "erro");
      await loadPedidosFila();
      setAceitando(null);
      return;
    }

    // Chamar RPC (schema_v17 — retorna jsonb com código de erro)
    const { data: resultado, error: errRpc } = await supabase
      .rpc("aceitar_pedido", { p_pedido_id: pedidoId });

    if (errRpc) {
      console.error("[aceitar] erro RPC:", errRpc);
      const msg =
        errRpc.code === "42501"
          ? "Erro de permissão ao atualizar pedido."
          : errRpc.code === "PGRST301" || errRpc.code === "401"
          ? "Sessão expirada. Faça login novamente."
          : `Falha ao aceitar (${errRpc.code ?? errRpc.message}).`;
      showToast(msg, "erro");
      setAceitando(null);
      return;
    }

    // RPC schema_v17 retorna jsonb: { ok: boolean, code: string }
    const res = resultado as { ok: boolean; code: string } | null;

    if (!res?.ok) {
      const msgs: Record<string, string> = {
        motoboy_not_found: "Motoboy não encontrado. Faça login novamente.",
        motoboy_busy:      "Você já possui uma entrega em andamento.",
        pedido_not_found:  "Pedido não encontrado.",
        already_taken:     "Pedido já aceito por outro motoboy.",
        wrong_status:      "Pedido não está mais disponível.",
        race_condition:    "Outro motoboy acabou de aceitar este pedido.",
      };
      showToast(msgs[res?.code ?? ""] ?? "Não foi possível aceitar a entrega.", "erro");
      await loadPedidosFila();
      setAceitando(null);
      return;
    }

    // — Sucesso —
    const novoPedido: Pedido = {
      ...pedidoLocal,
      status:     "em_coleta",
      motoboy_id: motoboy.id,
      updated_at: new Date().toISOString(),
    };

    // Notifica cliente via WhatsApp (fire-and-forget)
    fetch("/api/whatsapp/notificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedido_id: pedidoLocal.id }),
    }).catch(() => {});

    setMotoboy({ ...motoboy, status: "em_entrega" });
    setPedido(novoPedido);
    setMostraRetorno(false);

    setNavModal({
      lat:      novoPedido.endereco_lat ?? null,
      lng:      novoPedido.endereco_lng ?? null,
      endereco: novoPedido.endereco_entrega,
      tipo:     "entrega",
    });

    showToast("Entrega aceita! Escolha como navegar.", "ok");
    setAceitando(null);
    loadPedidosFila();
  }

  function iniciarRota() {
    if (!pedido) return;
    setNavModal({
      lat: pedido.endereco_lat ?? null,
      lng: pedido.endereco_lng ?? null,
      endereco: pedido.endereco_entrega,
      tipo: "entrega",
    });
  }

  async function handleNavEscolha(app: "waze" | "gmaps") {
    if (!navModal) return;
    const { lat, lng, endereco, tipo } = navModal;
    setNavModal(null);

    const url = app === "gmaps"
      ? lat && lng
        ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(endereco)}&travelmode=driving`
      : lat && lng
        ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
        : `https://waze.com/ul?q=${encodeURIComponent(endereco)}&navigate=yes`;

    window.open(url, "_blank");

    if (tipo === "entrega" && pedido) {
      setIniciandoRota(true);
      await supabase.from("pedidos").update({ status: "em_rota_de_entrega", updated_at: new Date().toISOString() }).eq("id", pedido.id);
      setPedido({ ...pedido, status: "em_rota_de_entrega" });
      setInicioRotaAt(new Date());
      setIniciandoRota(false);
    } else if (tipo === "retorno") {
      setRetornandoBase(true);
      setChegouBase(false);
    }
  }

  function reabrirRota() {
    if (!pedido) return;
    setNavModal({
      lat: pedido.endereco_lat ?? null,
      lng: pedido.endereco_lng ?? null,
      endereco: pedido.endereco_entrega,
      tipo: "entrega",
    });
  }

  function iniciarRetorno() {
    const eLat = parseFloat(localStorage.getItem("empresa_lat") || "0") || null;
    const eLng = parseFloat(localStorage.getItem("empresa_lng") || "0") || null;
    setNavModal({
      lat: eLat,
      lng: eLng,
      endereco: "Empresa",
      tipo: "retorno",
    });
  }

  async function confirmarChegadaBase() {
    if (!motoboy) return;
    setRetornandoBase(false);
    setChegouBase(false);
    setMostraRetorno(false);
    setInicioRotaAt(null);
    await supabase.from("motoboys").update({ status: "disponivel", posicao_fila: 999 }).eq("id", motoboy.id);
    setMotoboy({ ...motoboy, status: "disponivel" });
  }

  async function handleEntregaItemRota(pedidoId: string) {
    if (!rota || !motoboy) return;
    setEntregandoItem(pedidoId);
    await supabase.from("pedidos")
      .update({ status: "entregue", updated_at: new Date().toISOString() })
      .eq("id", pedidoId);
    const restantes = rota.pedidos.filter(p => p.id !== pedidoId && p.status !== "entregue");
    if (restantes.length === 0) {
      await supabase.from("delivery_routes").update({ status: "concluida" }).eq("id", rota.id);
      await supabase.from("motoboys").update({ status: "disponivel", posicao_fila: 999 }).eq("id", motoboy.id);
      setMotoboy({ ...motoboy, status: "disponivel" });
      setRota(null);
      setMostraRetorno(true);
      showToast("Rota concluída! ✓", "ok");
    } else {
      await supabase.from("delivery_routes").update({ status: "parcialmente_entregue" }).eq("id", rota.id);
      setRota({
        ...rota,
        status: "parcialmente_entregue",
        pedidos: rota.pedidos.map(p => p.id === pedidoId ? { ...p, status: "entregue" as PedidoStatus } : p),
      });
      showToast("Pedido entregue! ✓", "ok");
    }
    setEntregandoItem(null);
  }

  async function devolverParaFila() {
    if (!pedido || !motoboy) return;
    if (!confirm("Devolver este pedido para a fila?")) return;
    await Promise.all([
      supabase.from("pedidos").update({ motoboy_id: null, status: "finalizado" }).eq("id", pedido.id),
      supabase.from("motoboys").update({ status: "disponivel" }).eq("id", motoboy.id),
    ]);
    setPedido(null);
    setMotoboy({ ...motoboy, status: "disponivel" });
    loadPedidosFila();
  }

  async function confirmarEntrega() {
    if (!pedido || !motoboy) return;
    setEntregando(true);
    await supabase.from("pedidos").update({ status: "entregue", updated_at: new Date().toISOString() }).eq("id", pedido.id);
    await supabase.from("motoboys").update({ status: "disponivel" }).eq("id", motoboy.id);
    const novo = { ...motoboy, status: "disponivel" as const };
    setMotoboy(novo);
    setPedido(null);
    setEntregando(false);
    setMostraRetorno(true);
    setInicioRotaAt(null);
    loadStats(novo);
    loadReport(novo, period);
    loadHistorico(novo.id);
    loadPedidosFila();
  }

  async function aceitarENavegar(pedidoId: string, app: "waze" | "gmaps") {
    if (!motoboy) return;
    const pedidoLocal = pedidosDisp.find(p => p.id === pedidoId);
    if (!pedidoLocal) { showToast("Esse pedido não está mais disponível.", "erro"); return; }

    setAceitando(pedidoId);

    const { data: resultado, error: errRpc } = await supabase.rpc("aceitar_pedido", { p_pedido_id: pedidoId });

    if (errRpc) {
      const msg = errRpc.code === "42501" ? "Erro de permissão."
        : errRpc.code === "PGRST301" || errRpc.code === "401" ? "Sessão expirada. Faça login novamente."
        : `Falha ao aceitar (${errRpc.code ?? errRpc.message}).`;
      showToast(msg, "erro");
      setAceitando(null);
      return;
    }

    const res = resultado as { ok: boolean; code: string } | null;
    if (!res?.ok) {
      const msgs: Record<string, string> = {
        motoboy_not_found: "Motoboy não encontrado.",
        motoboy_busy:      "Você já possui uma entrega em andamento.",
        pedido_not_found:  "Pedido não encontrado.",
        already_taken:     "Pedido já aceito por outro motoboy.",
        wrong_status:      "Pedido não está mais disponível.",
        race_condition:    "Outro motoboy acabou de aceitar este pedido.",
      };
      showToast(msgs[res?.code ?? ""] ?? "Não foi possível aceitar.", "erro");
      await loadPedidosFila();
      setAceitando(null);
      return;
    }

    // Abre o app de navegação imediatamente (route_address = endereço limpo para GPS sem bairro/complemento)
    window.open(buildNavUrl(app, pedidoLocal.endereco_lat ?? null, pedidoLocal.endereco_lng ?? null, pedidoLocal.route_address || pedidoLocal.endereco_entrega), "_blank");

    // Já salta para em_rota_de_entrega (sem etapa intermediária)
    await supabase.from("pedidos").update({ status: "em_rota_de_entrega", updated_at: new Date().toISOString() }).eq("id", pedidoId);

    const novoPedido: Pedido = {
      ...pedidoLocal,
      status:     "em_rota_de_entrega",
      motoboy_id: motoboy.id,
      updated_at: new Date().toISOString(),
    };
    setMotoboy({ ...motoboy, status: "em_entrega" });
    setPedido(novoPedido);
    setInicioRotaAt(new Date());
    setMostraRetorno(false);
    showToast("Em rota! Boa entrega 🚀", "ok");
    setAceitando(null);
    loadPedidosFila();
  }

  async function navegarDireto(app: "waze" | "gmaps") {
    if (!pedido) return;
    window.open(buildNavUrl(app, pedido.endereco_lat ?? null, pedido.endereco_lng ?? null, (pedido as unknown as PedidoFila).route_address || pedido.endereco_entrega), "_blank");
    if (pedido.status === "em_coleta") {
      setIniciandoRota(true);
      await supabase.from("pedidos").update({ status: "em_rota_de_entrega", updated_at: new Date().toISOString() }).eq("id", pedido.id);
      setPedido({ ...pedido, status: "em_rota_de_entrega" });
      setInicioRotaAt(new Date());
      setIniciandoRota(false);
    }
  }

  async function responderConvite(id: string, aceitar: boolean) {
    setRespondendo(id);
    await supabase.rpc("responder_convite", { p_convite_id: id, p_aceitar: aceitar });
    await loadConvites();
    if (aceitar) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: mb } = await supabase.from("motoboys").select("*").eq("auth_id", user.id).single();
        if (mb) {
          const motoboyData = mb as Motoboy;
          setMotoboy(motoboyData);
          await Promise.all([
            loadPedidoAtivo(motoboyData.id),
            loadEmpresaIds(),
            loadPedidosFila(),
            loadReport(motoboyData, "hoje"),
            loadStats(motoboyData),
          ]);
          iniciarGPS(motoboyData);
        }
      }
    }
    setRespondendo(null);
  }

  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !motoboy) return;
    setUploadingFoto(true);
    try {
      const url = await uploadImage(file, "vellox/motoboys");
      await supabase.from("motoboys").update({ foto_url: url }).eq("id", motoboy.id);
      setMotoboy({ ...motoboy, foto_url: url });
    } catch (e) {
      alert(`Erro ao enviar foto: ${e instanceof Error ? e.message : "Tente novamente"}`);
    } finally {
      setUploadingFoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function salvarPerfil(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!motoboy) return;
    setSavingPerfil(true);
    await supabase.from("motoboys").update({
      nome: editNome.trim(),
      veiculo_tipo: editVeiculo,
      area_atuacao: editArea.trim() || null,
    }).eq("id", motoboy.id);
    setMotoboy({ ...motoboy, nome: editNome.trim(), veiculo_tipo: editVeiculo, area_atuacao: editArea.trim() || null });
    setSavingPerfil(false);
    setPerfilSalvo(true);
    setTimeout(() => setPerfilSalvo(false), 2500);
  }

  function copiarCodigo() {
    if (!motoboy?.codigo) return;
    navigator.clipboard.writeText(motoboy.codigo);
    setCopiadoCodigo(true);
    setTimeout(() => setCopiadoCodigo(false), 2000);
  }

  async function salvarFormaPagamento(pedidoId: string, forma: string) {
    setFormaPagamentoLocal(prev => ({ ...prev, [pedidoId]: forma }));
    setSalvandoPagamento(pedidoId);
    await supabase.from("pedidos").update({ forma_pagamento: forma }).eq("id", pedidoId);
    if (rota) {
      setRota({ ...rota, pedidos: rota.pedidos.map(p => p.id === pedidoId ? { ...p, forma_pagamento: forma } : p) });
    }
    if (pedido && pedido.id === pedidoId) {
      setPedido({ ...pedido, forma_pagamento: forma } as Pedido);
    }
    setSalvandoPagamento(null);
  }

  async function toggleStatusManual() {
    if (!motoboy || motoboy.status === "em_entrega") return;
    setTogglingStatus(true);
    const novo = motoboy.status === "offline" ? "disponivel" : "offline";
    await supabase.from("motoboys").update({ status: novo }).eq("id", motoboy.id);
    setMotoboy({ ...motoboy, status: novo as typeof motoboy.status });
    setTogglingStatus(false);
  }

  function handleLogout() {
    watchRef.current && navigator.geolocation.clearWatch(watchRef.current);
    if (motoboy) supabase.from("motoboys").update({ status: "offline", latitude: null, longitude: null }).eq("id", motoboy.id);
    supabase.auth.signOut();
    localStorage.removeItem(REMEMBER_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    document.cookie = "vellox_mb_device=; max-age=0; path=/; SameSite=Strict";
    setStep("login");
    setMotoboy(null);
    setPedido(null);
    setPedidosDisp([]);
    setGpsAtivo(false);
    setCoords(null);
    setTab("inicio");
  }

  function iniciarGPS(mb?: Motoboy) {
    if (!navigator.geolocation) { setGpsAtivo(true); return; }
    setGpsSolicitando(true);
    setGpsAtivo(false);
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        setGpsSolicitando(false);
        setGpsAtivo(true);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        if (mb) await supabase.from("motoboys").update({ latitude: lat, longitude: lng, ultima_localizacao_at: new Date().toISOString() }).eq("id", mb.id);

        // Geofence de retorno à base
        setRetornandoBase(prev => {
          if (!prev) return prev;
          const eLat = parseFloat(localStorage.getItem("empresa_lat") || "0");
          const eLng = parseFloat(localStorage.getItem("empresa_lng") || "0");
          if (eLat && eLng && haversineKm(lat, lng, eLat, eLng) < 0.2) {
            setChegouBase(true);
          }
          return prev;
        });
      },
      () => { setGpsSolicitando(false); setGpsAtivo(false); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );
  }

  function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
  }

  function buildNavUrl(app: "waze" | "gmaps", lat: number | null, lng: number | null, endereco: string): string {
    if (app === "gmaps")
      return lat && lng
        ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(endereco)}&travelmode=driving`;
    return lat && lng
      ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
      : `https://waze.com/ul?q=${encodeURIComponent(endereco)}&navigate=yes`;
  }

  function extrairBairro(endereco: string): string {
    const dashMatch = endereco.match(/[-–]\s*([^,-]{3,})/);
    if (dashMatch) return dashMatch[1].trim();
    const parts = endereco.split(",");
    return parts.length >= 2 ? parts[1].trim() : "";
  }

  function estimarTempo(distKm: number | null): string {
    if (!distKm || distKm <= 0) return "";
    const min = Math.round((distKm / 30) * 60);
    if (min < 60) return `~${min}min`;
    return `~${Math.floor(min / 60)}h${(min % 60) > 0 ? `${min % 60}min` : ""}`;
  }

  function tempoDesde(isoStr: string): string {
    const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
    if (diff < 1) return "agora";
    if (diff < 60) return `há ${diff}min`;
    return `há ${Math.floor(diff / 60)}h`;
  }

  function voltarComApp(app: "waze" | "gmaps") {
    const eLat = parseFloat(localStorage.getItem("empresa_lat") || "0") || null;
    const eLng = parseFloat(localStorage.getItem("empresa_lng") || "0") || null;
    window.open(buildNavUrl(app, eLat, eLng, "empresa"), "_blank");
    setRetornandoBase(true);
    setChegouBase(false);
  }

  function formatDuracao(from: Date, to: Date): string {
    const s = Math.floor((to.getTime() - from.getTime()) / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}min`;
    return `${m}min`;
  }

  // ── Seletor interativo de forma de pagamento ──────────────────
  function SeletorPagamento({ pedidoId, formaAtual, troco }: { pedidoId: string; formaAtual: string | null; troco: number | null }) {
    const forma   = formaPagamentoLocal[pedidoId] ?? formaAtual ?? "";
    const salvando = salvandoPagamento === pedidoId;
    const opcoes = [
      { v: "dinheiro",       emoji: "💵", label: "Dinheiro" },
      { v: "pix",            emoji: "📱", label: "PIX" },
      { v: "cartao_credito", emoji: "💳", label: "Crédito" },
      { v: "cartao_debito",  emoji: "💳", label: "Débito" },
      { v: "ja_pago",        emoji: "✓",  label: "Já pago" },
    ] as const;
    return (
      <div>
        <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: salvando ? "#22c55e" : "#94a3b8" }}>
          {salvando ? "Salvando..." : "Forma de pagamento"}
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {opcoes.map(({ v, emoji, label }) => {
            const sel = forma === v;
            const cfg = PAGAMENTO_CFG[v];
            return (
              <button key={v} type="button"
                onClick={() => !salvando && salvarFormaPagamento(pedidoId, v)}
                disabled={salvando}
                className="py-2 px-1 rounded-xl text-xs font-bold"
                style={{
                  background: sel ? cfg.bg : "var(--overlay-xs)",
                  border: `1px solid ${sel ? cfg.color + "55" : "var(--overlay-md)"}`,
                  color: sel ? cfg.color : "#94a3b8",
                  opacity: salvando && !sel ? 0.5 : 1,
                }}>
                {emoji} {label}
              </button>
            );
          })}
        </div>
        {forma === "dinheiro" && troco && troco > 0 && (
          <div className="mt-1.5 px-3 py-1.5 rounded-xl flex items-center gap-2"
            style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}>
            <span className="text-xs font-medium" style={{ color: "#f59e0b" }}>Troco p/ R$ {troco.toFixed(2)}</span>
          </div>
        )}
      </div>
    );
  }

  // ── Botões de ação do pedido ativo ────────────────────────────
  function BotoesPedido() {
    if (!pedido) return null;

    const utilButtons = (
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => navigator.clipboard.writeText(pedido.endereco_entrega)}
          className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-semibold"
          style={{ background: "rgba(148,163,184,0.07)", border: "1px solid rgba(148,163,184,0.12)", color: "#94a3b8" }}>
          <Copy size={13} /> Copiar
        </button>
        <a
          href={`tel:${pedido.cliente_telefone}`}
          className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-semibold"
          style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.15)", color: "#22c55e" }}>
          <Phone size={13} /> Ligar
        </a>
        <a
          href={`https://wa.me/55${pedido.cliente_telefone.replace(/\D/g, "")}`}
          target="_blank" rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-semibold"
          style={{ background: "rgba(37,211,102,0.07)", border: "1px solid rgba(37,211,102,0.15)", color: "#25d366" }}>
          <MessageCircle size={13} /> WhatsApp
        </a>
      </div>
    );

    if (pedido.status === "em_coleta") return (
      <div className="flex flex-col gap-2 mt-2">
        {utilButtons}
        <button
          onClick={() => navegarDireto("waze")}
          disabled={iniciandoRota}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-bold"
          style={{ background: "rgba(0,210,170,0.12)", border: "1px solid rgba(0,210,170,0.3)", color: "#00d2aa", opacity: iniciandoRota ? 0.6 : 1 }}>
          <Navigation size={15} /> IR COM WAZE
        </button>
        <button
          onClick={() => navegarDireto("gmaps")}
          disabled={iniciandoRota}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-bold"
          style={{ background: "rgba(66,133,244,0.12)", border: "1px solid rgba(66,133,244,0.3)", color: "#4285f4", opacity: iniciandoRota ? 0.6 : 1 }}>
          <Navigation size={15} /> IR COM GOOGLE MAPS
        </button>
        <button
          onClick={devolverParaFila}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold"
          style={{ background: "rgba(228,0,43,0.07)", border: "1px solid rgba(228,0,43,0.18)", color: "#E4002B" }}>
          <X size={13} /> Devolver para fila
        </button>
      </div>
    );
    return (
      <div className="flex flex-col gap-2 mt-2">
        {inicioRotaAt && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl"
            style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)" }}>
            <span className="text-xs" style={{ color: "#a78bfa" }}>⏱ Tempo em rota</span>
            <span className="text-sm font-black" style={{ color: "#a78bfa" }}>
              {formatDuracao(inicioRotaAt, rotaAtivaNow)}
            </span>
          </div>
        )}
        {utilButtons}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={reabrirRota}
            className="flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold"
            style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.25)", color: "#a78bfa" }}>
            <Navigation size={13} /> Abrir rota
          </button>
          <button onClick={confirmarEntrega} disabled={entregando}
            className="flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white"
            style={{ background: entregando ? "#14532d" : "linear-gradient(135deg,#16a34a,#15803d)", opacity: entregando ? 0.7 : 1 }}>
            <CheckCircle size={14} />
            {entregando ? "..." : "Entregue"}
          </button>
        </div>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────
  const statusColor = motoboy?.status === "em_entrega" ? "#fbbf24" : motoboy?.status === "disponivel" ? "#22c55e" : "#94a3b8";
  const statusLabel = motoboy
    ? (motoboy.status === "em_entrega" ? "Em entrega" : motoboy.status === "disponivel" ? "Disponível" : "Offline")
    : "Aguardando vínculo";
  const badges = getBadges(totalEntregas, kmTotais);
  const rating = motoboy?.avaliacao_media ?? 5;

  // ── Screens ───────────────────────────────────────────────────

  if (step === "checking") {
    return (
      <div data-theme="dark" className="min-h-screen flex items-center justify-center" style={{ background: "#080808" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "#fbbf24" }} />
      </div>
    );
  }

  if (step === "app" && motoboy && gpsSolicitando) {
    return (
      <div data-theme="dark" className="min-h-screen flex flex-col items-center justify-center gap-5 px-6" style={{ background: "#080808" }}>
        <div className="w-16 h-16 rounded-3xl flex items-center justify-center animate-pulse" style={{ background: "rgba(34,197,94,0.1)" }}>
          <Navigation size={28} style={{ color: "#22c55e" }} />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-white">Solicitando GPS...</p>
          <p className="text-sm mt-2" style={{ color: "#94a3b8" }}>Permita o acesso à localização</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (step === "app" && motoboy && !gpsAtivo) {
    return (
      <div data-theme="dark" className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "#080808" }}>
        <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-6" style={{ background: "rgba(228,0,43,0.1)" }}>
          <Navigation size={28} style={{ color: "#E4002B" }} />
        </div>
        <h2 className="text-xl font-bold text-white mb-3 text-center">GPS obrigatório</h2>
        <p className="text-sm text-center mb-2" style={{ color: "#94a3b8" }}>
          O Vellox precisa da sua localização para atribuir entregas.
        </p>
        <p className="text-xs text-center mb-8 px-4 py-3 rounded-xl"
          style={{ background: "rgba(228,0,43,0.06)", color: "#FFC72C", border: "1px solid rgba(228,0,43,0.15)" }}>
          Vá em <strong>Configurações do navegador → Permissões → Localização</strong>
        </p>
        <button onClick={() => iniciarGPS(motoboy!)}
          className="w-full max-w-xs py-4 rounded-2xl text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
          Tentar novamente
        </button>
        <button onClick={handleLogout} className="mt-4 text-xs" style={{ color: "#94a3b8" }}>Sair da conta</button>
      </div>
    );
  }

  if (step === "login") {
    return (
      <div data-theme="dark" className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "#080808" }}>
        <a href="/login"
          className="flex items-center gap-1.5 mb-8 text-xs font-semibold"
          style={{ color: "#94a3b8", textDecoration: "none" }}>
          <ChevronLeft size={14} /> Voltar para seleção de login
        </a>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: "linear-gradient(135deg,#fbbf24,#d97706)", boxShadow: "0 0 24px rgba(251,191,36,0.35)" }}>
          <Zap size={20} className="text-black" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">Vellox Motoboy</h1>
        <p className="text-sm mb-8 text-center" style={{ color: "#94a3b8" }}>Entre com seu email e senha</p>

        <form onSubmit={handleLogin} className="w-full max-w-xs space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "#94a3b8" }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus inputMode="email" placeholder="seu@email.com"
              className="w-full px-4 rounded-xl text-sm text-white placeholder-slate-600 outline-none"
              style={{ height: 52, background: "var(--bg-1)", border: "1px solid var(--border-1)" }}
              onFocus={(e) => (e.target.style.borderColor = "#fbbf24")}
              onBlur={(e)  => (e.target.style.borderColor = "var(--border-1)")} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "#94a3b8" }}>Senha</label>
            <div className="relative">
              <input type={showPass ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)} required placeholder="••••••••"
                className="w-full pl-4 pr-12 rounded-xl text-sm text-white placeholder-slate-600 outline-none"
                style={{ height: 52, background: "var(--bg-1)", border: "1px solid var(--border-1)" }}
                onFocus={(e) => (e.target.style.borderColor = "#fbbf24")}
                onBlur={(e)  => (e.target.style.borderColor = "var(--border-1)")} />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: "#94a3b8" }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div onClick={() => setRememberMe(!rememberMe)} className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all"
              style={{ background: rememberMe ? "#fbbf24" : "transparent", border: `2px solid ${rememberMe ? "#fbbf24" : "#94a3b8"}` }}>
              {rememberMe && (
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                  <path d="M1 4L4 7L10 1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className="text-sm" style={{ color: "#94a3b8" }}>Salvar acesso neste dispositivo</span>
          </label>

          {authError && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(228,0,43,0.08)", color: "#FFC72C", border: "1px solid rgba(228,0,43,0.2)" }}>
              {authError}
            </p>
          )}

          <button type="submit" disabled={logging}
            className="w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-black"
            style={{ height: 52, background: "linear-gradient(135deg,#fbbf24,#d97706)", opacity: logging ? 0.7 : 1 }}>
            {logging ? <><Loader2 size={16} className="animate-spin" /> Entrando...</> : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  // ── APP ───────────────────────────────────────────────────────
  const IS = { background: "var(--bg-input)", border: "1px solid var(--border-1)", height: 48 };

  const PERIODS: { key: ReportPeriod; label: string }[] = [
    { key: "hoje", label: "Hoje" }, { key: "semana", label: "Semana" }, { key: "mes", label: "Mês" },
  ];

  return (
    <div data-theme="dark" style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#080808" }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border-1)", flexShrink: 0 }}>
        <div className="flex items-center gap-4 px-5 py-4">
          {/* Avatar */}
          <div className="relative shrink-0 cursor-pointer" onClick={() => motoboy && fileInputRef.current?.click()}>
            <div className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center"
              style={{ background: "var(--bg-3)", border: "2px solid rgba(251,191,36,0.3)" }}>
              {uploadingFoto ? (
                <Loader2 size={20} className="animate-spin" style={{ color: "#fbbf24" }} />
              ) : motoboy?.foto_url ? (
                <img src={motoboy.foto_url} alt={motoboy.nome} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-black" style={{ color: "#fbbf24" }}>
                  {(motoboy?.nome ?? "M").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {motoboy && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: "var(--bg-3)", border: "1px solid #2a2a2a" }}>
                <Camera size={11} style={{ color: "#94a3b8" }} />
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-base font-bold text-white truncate">{motoboy?.nome ?? "Vellox Motoboy"}</p>
              {motoboy?.veiculo_tipo && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: "var(--bg-3)", color: "#94a3b8" }}>
                  {motoboy.veiculo_tipo === "carro" ? <Car size={10} /> : <Bike size={10} />}
                  {motoboy.veiculo_tipo}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: motoboy ? statusColor : "#fbbf24" }} />
              <span className="text-xs font-medium" style={{ color: motoboy ? statusColor : "#fbbf24" }}>{statusLabel}</span>
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <StarRating value={rating} size={12} />
              <span className="text-xs font-mono" style={{ color: "#94a3b8" }}>
                {rating.toFixed(1)} · {totalEntregas} entregas
              </span>
            </div>
          </div>

          {/* GPS + logout */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            {gpsAtivo
              ? <Wifi size={15} style={{ color: "#22c55e" }} />
              : <WifiOff size={15} style={{ color: "#E4002B" }} />}
            <button onClick={handleLogout} style={{ color: "#94a3b8" }}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Content area ─────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>

        {/* Scrollable tab content */}
        {tab !== "mapa" && (
        <div ref={tabScrollRef} key={tab} style={{ height: "100%", overflowY: "auto", overflowX: "hidden", overscrollBehavior: "none" }}>
            <div className="p-5 space-y-4 pb-6">

              {/* ═══ INÍCIO ═══════════════════════════════════════ */}
              {tab === "inicio" && (() => {
                const hora = new Date().getHours();
                const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
                const primeiroNome = motoboy?.nome?.split(" ")[0] ?? "Motoboy";
                const totalDistancia = historicoEntregas.reduce((s, e) => s + (e.distancia_km ?? 0), 0);
                return (
                <>
                  {/* ── Hero card ── */}
                  <div style={{ borderRadius: 20, background: "rgba(228,0,43,0.06)", border: "1px solid rgba(228,0,43,0.18)", padding: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 23, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.2 }}>
                        {saudacao}, <span style={{ color: "#E4002B" }}>{primeiroNome}!</span>
                      </p>
                      <p style={{ fontSize: 13, color: "#64748b", margin: "5px 0 14px" }}>Pronto para mais entregas?</p>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: gpsAtivo ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${gpsAtivo ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}` }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: gpsAtivo ? "#22c55e" : "#ef4444" }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: gpsAtivo ? "#22c55e" : "#ef4444" }}>{gpsAtivo ? "Online" : "Offline"}</span>
                      </div>
                    </div>
                    <div style={{ width: 72, height: 72, borderRadius: 18, background: "rgba(228,0,43,0.08)", border: "1px solid rgba(228,0,43,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 36 }}>
                      {motoboy?.foto_url
                        ? <img src={motoboy.foto_url} alt="" style={{ width: "100%", height: "100%", borderRadius: 18, objectFit: "cover" }} />
                        : "🛵"}
                    </div>
                  </div>

                  {/* ── Earnings card ── */}
                  <div style={{ borderRadius: 20, background: "linear-gradient(135deg,#E4002B 0%,#c94f00 100%)", padding: "20px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.65)", margin: 0, textTransform: "uppercase", letterSpacing: "0.07em" }}>Ganhos de hoje</p>
                        <p style={{ fontSize: 34, fontWeight: 900, color: "#fff", margin: "6px 0 0", lineHeight: 1, letterSpacing: "-0.02em" }}>
                          R$ {report.ganhos.toFixed(2).replace(".", ",")}
                        </p>
                        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", margin: "8px 0 0" }}>
                          {report.entregas} {report.entregas === 1 ? "entrega realizada" : "entregas realizadas"}
                        </p>
                      </div>
                      <div style={{ padding: "8px 10px", borderRadius: 12, background: "rgba(0,0,0,0.2)" }}>
                        <DollarSign size={22} style={{ color: "#fff" }} />
                      </div>
                    </div>
                  </div>

                  {/* ── Stats grid ── */}
                  <div style={{ display: "flex", gap: 8 }}>
                    {[
                      { label: "Entregas", value: report.entregas.toString(), icon: <Package size={14} style={{ color: "#E4002B" }} /> },
                      { label: "Distância", value: totalDistancia > 0 ? `${totalDistancia.toFixed(0)}km` : "–", icon: <Navigation size={14} style={{ color: "#a78bfa" }} /> },
                      { label: "Avaliação", value: (motoboy?.avaliacao_media ?? 5).toFixed(1), icon: <Star size={14} style={{ color: "#fbbf24" }} /> },
                      { label: "Na fila", value: pedidosDisp.length.toString(), icon: <Bell size={14} style={{ color: "#60a5fa" }} /> },
                    ].map(({ label, value, icon }) => (
                      <div key={label} style={{ flex: 1, borderRadius: 14, padding: "12px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                        {icon}
                        <div>
                          <p style={{ fontSize: 16, fontWeight: 800, color: "#ffffff", margin: 0, lineHeight: 1 }}>{value}</p>
                          <p style={{ fontSize: 9, color: "#6b7280", margin: "3px 0 0", lineHeight: 1.2 }}>{label}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── Pedido ativo / Próxima entrega ── */}
                  {pedido && (
                    <div style={{ borderRadius: 20, background: "#111", border: "1px solid rgba(228,0,43,0.25)", padding: 0 }}>
                      <div style={{ padding: "11px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <p style={{ fontSize: 11, fontWeight: 800, color: "#E4002B", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
                          {pedido.status === "em_coleta" ? "🔶 Em coleta" : "🟣 Em entrega"}
                        </p>
                      </div>
                      <div style={{ padding: "18px", display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ display: "flex", gap: 14 }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(228,0,43,0.12)", border: "1px solid rgba(228,0,43,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Package size={15} style={{ color: "#E4002B" }} />
                            </div>
                            <div style={{ width: 2, height: 24, background: "rgba(255,255,255,0.08)", margin: "5px 0" }} />
                            <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <MapPin size={15} style={{ color: "#22c55e" }} />
                            </div>
                          </div>
                          <div style={{ flex: 1, paddingTop: 2 }}>
                            <p style={{ fontSize: 10, color: "#4b5563", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>Coleta</p>
                            <p style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: "2px 0 18px" }}>Restaurante</p>
                            <p style={{ fontSize: 10, color: "#4b5563", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>Entrega</p>
                            <p style={{ fontSize: 15, fontWeight: 800, color: "#fff", margin: "2px 0 2px" }}>{pedido.cliente_nome}</p>
                            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>{pedido.endereco_entrega}</p>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: pedido.distancia_km != null ? "1fr 1fr" : "1fr", gap: 8 }}>
                          {pedido.distancia_km != null && (
                            <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
                              <p style={{ fontSize: 10, color: "#4b5563", margin: 0 }}>Distância</p>
                              <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "3px 0 0" }}>{pedido.distancia_km.toFixed(1)} km</p>
                            </div>
                          )}
                          <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.15)" }}>
                            <p style={{ fontSize: 10, color: "#f59e0b", margin: 0 }}>Seu ganho</p>
                            <p style={{ fontSize: 15, fontWeight: 700, color: "#fbbf24", margin: "3px 0 0" }}>
                              {pedido.valor_motoboy > 0 ? `R$ ${pedido.valor_motoboy.toFixed(2)}` : "A definir"}
                            </p>
                          </div>
                        </div>
                        {pedido.valor_pedido > 0 && (
                          <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
                            <p style={{ fontSize: 10, color: "#4b5563", margin: 0 }}>Cobrar do cliente</p>
                            <p style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: "3px 0 0" }}>R$ {(pedido.valor_pedido + pedido.valor_motoboy).toFixed(2)}</p>
                          </div>
                        )}
                        <SeletorPagamento
                          pedidoId={pedido.id}
                          formaAtual={pedido.forma_pagamento ?? null}
                          troco={pedido.troco_para ?? null}
                        />
                        {pedido.observacoes && (
                          <p style={{ fontSize: 12, fontStyle: "italic", color: "#6b7280", padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", margin: 0 }}>"{pedido.observacoes}"</p>
                        )}
                        <BotoesPedido />
                      </div>
                    </div>
                  )}

                  {/* ── Rota ativa (múltiplos pedidos) ── */}
                  {rota && (() => {
                    const rotaOrdenada = (coords && rota.pedidos.length >= 2)
                      ? nearestNeighborRoute(rota.pedidos, coords.lat, coords.lng)
                      : rota.pedidos.map(p => ({ pedido: p, distKm: p.endereco_lat && p.endereco_lng && coords
                          ? haversineKm(coords.lat, coords.lng, p.endereco_lat, p.endereco_lng) : null as unknown as number }));
                    const hasDistances = coords != null;
                    return (
                      <div style={{ borderRadius: 20, border: "1px solid rgba(167,139,250,0.25)", background: "var(--bg-2)" }}>
                        <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(167,139,250,0.12)", background: "rgba(167,139,250,0.08)", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "center", gap: 8 }}>
                          <Navigation size={14} style={{ color: "#a78bfa" }} />
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa", margin: 0, flex: 1 }}>
                            Rota — {rota.pedidos.filter(p => p.status !== "entregue").length}/{rota.pedidos.length} pendentes
                          </p>
                          {hasDistances && rota.pedidos.filter(p => p.status !== "entregue").length >= 2 && (
                            <span style={{ fontSize: 11, color: "#7c3aed", display: "flex", alignItems: "center", gap: 4 }}>
                              <Zap size={10} /> Otimizada
                            </span>
                          )}
                        </div>
                        <div>
                          {rotaOrdenada.map(({ pedido: p, distKm }, i) => {
                            const entregue = p.status === "entregue";
                            const navAddr = p.route_address || p.endereco_entrega;
                            const pendingIdx = rotaOrdenada.slice(0, i).filter(x => x.pedido.status !== "entregue").length;
                            return (
                              <div key={p.id} style={{ padding: "16px 20px", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none", opacity: entregue ? 0.45 : 1 }}>
                                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                                  {!entregue && (
                                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(167,139,250,0.2)", color: "#c4b5fd", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                                      {pendingIdx + 1}
                                    </div>
                                  )}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                      <p style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>{p.cliente_nome}</p>
                                      {hasDistances && !entregue && distKm > 0 && (
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(167,139,250,0.15)", color: "#c4b5fd" }}>
                                          📍 {formatDist(distKm)}
                                        </span>
                                      )}
                                      {entregue && (
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>✓ Entregue</span>
                                      )}
                                    </div>
                                    <p style={{ fontSize: 12, color: "#94a3b8", margin: "3px 0 6px" }}>{p.cliente_telefone} · {new Date(p.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                                    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                                      <MapPin size={12} style={{ color: "#E4002B", flexShrink: 0, marginTop: 1 }} />
                                      <p style={{ fontSize: 12, color: "#d1d5db", margin: 0 }}>{navAddr}</p>
                                    </div>
                                  </div>
                                </div>
                                {p.descricao_itens && !entregue && (
                                  <p style={{ fontSize: 12, color: "#94a3b8", padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", margin: "0 0 10px" }}>{p.descricao_itens}</p>
                                )}
                                {!entregue && (
                                  <>
                                    <div style={{ display: "grid", gridTemplateColumns: p.valor_pedido > 0 ? "1fr 1fr" : "1fr", gap: 8, marginBottom: 10 }}>
                                      {p.valor_pedido > 0 && (
                                        <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.04)", textAlign: "center" }}>
                                          <p style={{ fontSize: 10, color: "#64748b", margin: "0 0 2px" }}>Cobrar</p>
                                          <p style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>R$ {(p.valor_pedido + p.valor_motoboy).toFixed(2)}</p>
                                        </div>
                                      )}
                                      <div style={{ padding: 10, borderRadius: 10, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)", textAlign: "center" }}>
                                        <p style={{ fontSize: 10, color: "#f59e0b", margin: "0 0 2px" }}>Seu ganho</p>
                                        {p.valor_motoboy > 0
                                          ? <p style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24", margin: 0 }}>R$ {p.valor_motoboy.toFixed(2)}</p>
                                          : <p style={{ fontSize: 12, fontWeight: 600, color: "#d97706", margin: 0 }}>A definir</p>}
                                      </div>
                                    </div>
                                    <SeletorPagamento pedidoId={p.id} formaAtual={p.forma_pagamento ?? null} troco={p.troco_para ?? null} />
                                    {p.observacoes && (
                                      <p style={{ fontSize: 11, fontStyle: "italic", color: "#94a3b8", margin: "8px 0 0" }}>"{p.observacoes}"</p>
                                    )}
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
                                      <a href={p.endereco_lat && p.endereco_lng
                                        ? `https://waze.com/ul?ll=${p.endereco_lat},${p.endereco_lng}&navigate=yes`
                                        : `https://waze.com/ul?q=${encodeURIComponent(navAddr)}&navigate=yes`}
                                        target="_blank" rel="noopener noreferrer"
                                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "10px 0", borderRadius: 10, fontSize: 12, fontWeight: 700, background: "rgba(0,210,170,0.1)", border: "1px solid rgba(0,210,170,0.25)", color: "#00d2aa", textDecoration: "none" }}>
                                        <Navigation size={11} /> Waze
                                      </a>
                                      <a href={p.endereco_lat && p.endereco_lng
                                        ? `https://www.google.com/maps/dir/?api=1&destination=${p.endereco_lat},${p.endereco_lng}&travelmode=driving`
                                        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(navAddr)}&travelmode=driving`}
                                        target="_blank" rel="noopener noreferrer"
                                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "10px 0", borderRadius: 10, fontSize: 12, fontWeight: 700, background: "rgba(66,133,244,0.1)", border: "1px solid rgba(66,133,244,0.25)", color: "#4285f4", textDecoration: "none" }}>
                                        <Navigation size={11} /> Maps
                                      </a>
                                      <button onClick={() => handleEntregaItemRota(p.id)} disabled={entregandoItem === p.id}
                                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "10px 0", borderRadius: 10, fontSize: 12, fontWeight: 700, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22c55e", cursor: "pointer" }}>
                                        {entregandoItem === p.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                                        Entregue
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Pedidos disponíveis ── */}
                  {!pedido && !rota && motoboy && pedidosDisp.length > 0 && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#60a5fa" }} />
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>
                          Pedidos prontos ({pedidosDisp.length})
                        </p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {pedidosDisp.map((p) => {
                          const bairro = extrairBairro(p.endereco_entrega);
                          const tempo  = estimarTempo(p.distancia_km ?? null);
                          const pf = p as unknown as PedidoFila;
                          return (
                            <div key={p.id} style={{ borderRadius: 20, border: "1px solid rgba(96,165,250,0.2)", background: "var(--bg-2)" }}>
                              {pf.empresa_nome && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "rgba(0,0,0,0.25)", borderBottom: "1px solid rgba(255,255,255,0.05)", borderRadius: "20px 20px 0 0" }}>
                                  {pf.empresa_logo_url
                                    ? <img src={pf.empresa_logo_url} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: "cover" }} />
                                    : <Building2 size={13} style={{ color: "#94a3b8" }} />}
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>{pf.empresa_nome}</span>
                                </div>
                              )}
                              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                                  <div>
                                    <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>{p.cliente_nome}</p>
                                    <p style={{ fontSize: 12, color: "#94a3b8", margin: "3px 0 0" }}>{p.cliente_telefone}</p>
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 }}>
                                    {tempo && (
                                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "rgba(251,191,36,0.1)", color: "#fbbf24", display: "flex", alignItems: "center", gap: 3 }}>
                                        <Clock size={9} />{tempo}
                                      </span>
                                    )}
                                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(96,165,250,0.08)", color: "#60a5fa" }}>
                                      {tempoDesde(p.created_at)}
                                    </span>
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                  <MapPin size={14} style={{ color: "#E4002B", flexShrink: 0, marginTop: 1 }} />
                                  <div style={{ flex: 1 }}>
                                    <p style={{ fontSize: 13, color: "#fff", margin: 0 }}>{p.endereco_entrega}</p>
                                    {bairro && <p style={{ fontSize: 12, color: "#60a5fa", margin: "3px 0 0" }}>{bairro}</p>}
                                  </div>
                                </div>
                                {(p.descricao_itens || p.observacoes) && (
                                  <div style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                                    {p.descricao_itens && <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>{p.descricao_itens}</p>}
                                    {p.observacoes && <p style={{ fontSize: 11, fontStyle: "italic", color: "#64748b", margin: p.descricao_itens ? "4px 0 0" : 0 }}>"{p.observacoes}"</p>}
                                  </div>
                                )}
                                <div style={{ display: "flex", gap: 8 }}>
                                  {p.distancia_km != null && (
                                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.1)" }}>
                                      <Navigation size={12} style={{ color: "#94a3b8" }} />
                                      <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>{p.distancia_km.toFixed(1)} km</span>
                                    </div>
                                  )}
                                  {p.valor_motoboy > 0 && (
                                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 10, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)" }}>
                                      <span style={{ fontSize: 12, color: "#f59e0b" }}>Ganho</span>
                                      <span style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24" }}>R$ {p.valor_motoboy.toFixed(2)}</span>
                                    </div>
                                  )}
                                </div>
                                {aceitando === p.id ? (
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.04)", color: "#94a3b8", fontSize: 13, fontWeight: 700 }}>
                                    <Loader2 size={14} className="animate-spin" /> Aceitando...
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    <button onClick={() => aceitarENavegar(p.id, "waze")} disabled={!!aceitando}
                                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, fontSize: 13, fontWeight: 700, background: "rgba(0,210,170,0.12)", border: "1px solid rgba(0,210,170,0.3)", color: "#00d2aa", opacity: aceitando ? 0.5 : 1, cursor: aceitando ? "not-allowed" : "pointer" }}>
                                      <Navigation size={15} /> IR COM WAZE
                                    </button>
                                    <button onClick={() => aceitarENavegar(p.id, "gmaps")} disabled={!!aceitando}
                                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, fontSize: 13, fontWeight: 700, background: "rgba(66,133,244,0.12)", border: "1px solid rgba(66,133,244,0.3)", color: "#4285f4", opacity: aceitando ? 0.5 : 1, cursor: aceitando ? "not-allowed" : "pointer" }}>
                                      <Navigation size={15} /> IR COM GOOGLE MAPS
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Retorno à base (chegou) ── */}
                  {!pedido && !rota && mostraRetorno && chegouBase && (
                    <div style={{ borderRadius: 20, border: "1px solid rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.04)" }}>
                      <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(34,197,94,0.2)", background: "rgba(34,197,94,0.1)", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "center", gap: 8 }}>
                        <CheckCircle size={15} style={{ color: "#22c55e" }} />
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", margin: 0, flex: 1 }}>Você chegou à base!</p>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
                      </div>
                      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                        <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Confirme o retorno para ficar disponível para novos pedidos.</p>
                        <button onClick={confirmarChegadaBase}
                          style={{ width: "100%", padding: 14, borderRadius: 14, fontSize: 14, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#22c55e,#16a34a)", border: "none", cursor: "pointer" }}>
                          Confirmar retorno à base
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Retorno à base (em rota de volta) ── */}
                  {!pedido && !rota && mostraRetorno && !chegouBase && (
                    <div style={{ borderRadius: 20, border: "1px solid rgba(167,139,250,0.25)", background: "rgba(167,139,250,0.04)" }}>
                      <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(167,139,250,0.15)", background: "rgba(167,139,250,0.08)", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "center", gap: 8 }}>
                        <CheckCircle size={15} style={{ color: "#a78bfa" }} />
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa", margin: 0, flex: 1 }}>
                          {retornandoBase ? "Retornando à base…" : "Entrega concluída!"}
                        </p>
                        {retornandoBase && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a78bfa" }} />}
                      </div>
                      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                        {retornandoBase ? (
                          <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>GPS monitorando distância. Você receberá um alerta ao chegar.</p>
                        ) : (
                          <>
                            <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Boa entrega! Inicie a rota de volta à base.</p>
                            <button onClick={() => voltarComApp("waze")}
                              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, fontSize: 13, fontWeight: 700, background: "rgba(0,210,170,0.12)", border: "1px solid rgba(0,210,170,0.3)", color: "#00d2aa", cursor: "pointer" }}>
                              <Navigation size={15} /> VOLTAR COM WAZE
                            </button>
                            <button onClick={() => voltarComApp("gmaps")}
                              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, fontSize: 13, fontWeight: 700, background: "rgba(66,133,244,0.12)", border: "1px solid rgba(66,133,244,0.3)", color: "#4285f4", cursor: "pointer" }}>
                              <Navigation size={15} /> VOLTAR COM GOOGLE MAPS
                            </button>
                          </>
                        )}
                        <button onClick={confirmarChegadaBase}
                          style={{ width: "100%", padding: 10, borderRadius: 12, fontSize: 12, fontWeight: 600, background: "transparent", border: "1px solid rgba(167,139,250,0.2)", color: "#94a3b8", cursor: "pointer" }}>
                          Já cheguei (confirmar manualmente)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Aguardando pedidos ── */}
                  {!pedido && !rota && motoboy && pedidosDisp.length === 0 && !mostraRetorno && (
                    <div style={{ borderRadius: 20, background: "var(--bg-2)", border: "1px solid var(--border-1)", padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(34,197,94,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <CheckCircle size={24} style={{ color: "#22c55e" }} />
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>Você está livre</p>
                        <p style={{ fontSize: 13, color: "#94a3b8", margin: "6px 0 0" }}>Aguardando pedidos finalizados pela empresa</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#22c55e" }}>Na fila</span>
                      </div>
                    </div>
                  )}

                  {/* ── Sem vínculo ── */}
                  {!motoboy && (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
                      <Building2 size={18} style={{ color: "#fbbf24" }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", margin: 0 }}>Conta não vinculada</p>
                        <p style={{ fontSize: 12, color: "#94a3b8", margin: "3px 0 0" }}>Aguardando convite de uma empresa</p>
                      </div>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24", flexShrink: 0 }} />
                    </div>
                  )}

                  {/* ── Convites ── */}
                  {convites.length > 0 && (
                    <div style={{ borderRadius: 20, border: "1px solid rgba(96,165,250,0.25)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", background: "rgba(59,130,246,0.08)", borderBottom: "1px solid rgba(96,165,250,0.15)", borderRadius: "20px 20px 0 0" }}>
                        <Mail size={14} style={{ color: "#60a5fa" }} />
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", margin: 0, flex: 1 }}>Convites</p>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(96,165,250,0.2)", color: "#60a5fa" }}>{convites.length}</span>
                      </div>
                      <div style={{ background: "var(--bg-2)", borderRadius: "0 0 20px 20px" }}>
                        {convites.map((c, i) => (
                          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: i > 0 ? "1px solid var(--border-1)" : "none" }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(96,165,250,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <Building2 size={16} style={{ color: "#60a5fa" }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.empresa_nome}</p>
                              <p style={{ fontSize: 12, color: "#94a3b8", margin: "3px 0 0" }}>Convite para entrar na equipe</p>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <button onClick={() => responderConvite(c.id, true)} disabled={respondendo === c.id}
                                style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "none", cursor: "pointer" }}>
                                {respondendo === c.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                                Aceitar
                              </button>
                              <button onClick={() => responderConvite(c.id, false)} disabled={respondendo === c.id}
                                style={{ padding: "6px 8px", borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Código do motoboy (discreto, ao fundo) ── */}
                  {motoboy?.codigo && (
                    <div style={{ borderRadius: 16, padding: "14px 16px", background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.12)" }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#78350f", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>Seu código</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.12)" }}>
                          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.25em", color: "#fbbf24", fontFamily: "monospace" }}>{motoboy.codigo}</span>
                        </div>
                        <button onClick={copiarCodigo}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, flexShrink: 0, background: "rgba(251,191,36,0.1)", color: copiadoCodigo ? "#22c55e" : "#fbbf24", border: "1px solid rgba(251,191,36,0.15)", cursor: "pointer" }}>
                          {copiadoCodigo ? <CheckCircle size={14} /> : <Copy size={14} />}
                          {copiadoCodigo ? "Copiado!" : "Copiar"}
                        </button>
                      </div>
                      <p style={{ fontSize: 11, color: "#4b5563", margin: "8px 0 0" }}>Passe para a empresa te cadastrar</p>
                    </div>
                  )}

                  {/* ── Pedidos do dia (histórico) ── */}
                  {historicoEntregas.length > 0 && (
                    <div style={{ borderRadius: 20, background: "#111", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <p style={{ fontSize: 11, fontWeight: 800, color: "#E4002B", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Pedidos do dia</p>
                        <span style={{ fontSize: 11, color: "#4b5563", fontWeight: 600 }}>{historicoEntregas.length} {historicoEntregas.length === 1 ? "entrega" : "entregas"}</span>
                      </div>
                      <div>
                        {historicoEntregas.slice(0, 5).map((e, i) => (
                          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(228,0,43,0.08)", border: "1px solid rgba(228,0,43,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: "#E4002B" }}>#{i + 1}</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.cliente_nome}</p>
                              <p style={{ fontSize: 11, color: "#4b5563", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.endereco_entrega}</p>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#22c55e" }}>R$ {e.valor_motoboy.toFixed(2)}</span>
                              <span style={{ fontSize: 10, color: "#4b5563" }}>{new Date(e.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
                );
              })()}

              {/* ═══ PEDIDOS ═══════════════════════════════════════ */}
              {tab === "pedidos" && (
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-white">Meus pedidos</p>
                    <button
                      onClick={() => {
                        loadPedidosFila(true);
                        if (motoboy) { loadPedidoAtivo(motoboy.id); loadRotaAtiva(motoboy.id); }
                      }}
                      disabled={refreshingFila}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                      style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>
                      {refreshingFila ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
                      Atualizar
                    </button>
                  </div>

                  {/* ── ROTA ATIVA ── */}
                  {rota && (
                    <div className="rounded-2xl overflow-hidden"
                      style={{ border: "1px solid rgba(167,139,250,0.25)", background: "var(--bg-2)" }}>
                      <div className="px-5 py-3 flex items-center gap-2"
                        style={{ background: "rgba(167,139,250,0.08)", borderBottom: "1px solid rgba(167,139,250,0.12)" }}>
                        <Navigation size={14} style={{ color: "#a78bfa" }} />
                        <p className="text-sm font-bold" style={{ color: "#a78bfa" }}>
                          Rota — {rota.pedidos.filter(p => p.status !== "entregue").length}/{rota.pedidos.length} pendentes
                        </p>
                        <span className="ml-auto w-2 h-2 rounded-full" style={{ background: "#8b5cf6" }} />
                      </div>
                      <div className="divide-y" style={{ borderColor: "var(--border-1)" }}>
                        {rota.pedidos.map((p, i) => {
                          const entregue = p.status === "entregue";
                          const navAddr  = p.route_address || p.endereco_entrega;
                          return (
                            <div key={p.id} className="p-4 space-y-2" style={{ opacity: entregue ? 0.45 : 1 }}>
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-bold text-white">{i + 1}. {p.cliente_nome}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <p className="text-xs" style={{ color: "#94a3b8" }}>{p.cliente_telefone}</p>
                                    <span style={{ color: "#94a3b8" }}>·</span>
                                    <p className="text-xs" style={{ color: "#94a3b8" }}>
                                      {new Date(p.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                    </p>
                                  </div>
                                </div>
                                {entregue && (
                                  <span className="text-xs font-bold px-2 py-1 rounded-full shrink-0"
                                    style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>✓ Entregue</span>
                                )}
                              </div>
                              <div className="flex items-start gap-1.5">
                                <MapPin size={12} className="mt-0.5 shrink-0" style={{ color: "#E4002B" }} />
                                <p className="text-xs text-white">{navAddr}</p>
                              </div>
                              {p.descricao_itens && !entregue && (
                                <p className="text-xs px-2.5 py-1.5 rounded-lg" style={{ background: "var(--bg-1)", color: "#94a3b8" }}>{p.descricao_itens}</p>
                              )}
                              {!entregue && (
                                <>
                                  <div className="flex items-center gap-2">
                                    {p.valor_pedido > 0 && (
                                      <div className="flex-1 px-3 py-2 rounded-xl text-center"
                                        style={{ background: "var(--overlay-md)" }}>
                                        <p className="text-xs mb-0.5" style={{ color: "#94a3b8" }}>Cobrar do cliente</p>
                                        <p className="text-sm font-bold text-white">R$ {(p.valor_pedido + p.valor_motoboy).toFixed(2)}</p>
                                      </div>
                                    )}
                                    <div className="flex-1 px-3 py-2 rounded-xl text-center"
                                      style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)" }}>
                                      <p className="text-xs mb-0.5" style={{ color: "#f59e0b" }}>Seu ganho</p>
                                      {p.valor_motoboy > 0
                                        ? <p className="text-sm font-bold" style={{ color: "#fbbf24" }}>R$ {p.valor_motoboy.toFixed(2)}</p>
                                        : <p className="text-xs font-semibold" style={{ color: "#d97706" }}>A definir</p>
                                      }
                                    </div>
                                  </div>
                                  <SeletorPagamento
                                    pedidoId={p.id}
                                    formaAtual={p.forma_pagamento ?? null}
                                    troco={p.troco_para ?? null}
                                  />
                                </>
                              )}
                              {p.observacoes && (
                                <p className="text-xs italic" style={{ color: "#94a3b8" }}>"{p.observacoes}"</p>
                              )}
                              {!entregue && (
                                <div className="grid grid-cols-3 gap-2">
                                  <a href={p.endereco_lat && p.endereco_lng
                                    ? `https://waze.com/ul?ll=${p.endereco_lat},${p.endereco_lng}&navigate=yes`
                                    : `https://waze.com/ul?q=${encodeURIComponent(navAddr)}&navigate=yes`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-bold"
                                    style={{ background: "rgba(0,210,170,0.1)", border: "1px solid rgba(0,210,170,0.25)", color: "#00d2aa" }}>
                                    <Navigation size={11} /> Waze
                                  </a>
                                  <a href={p.endereco_lat && p.endereco_lng
                                    ? `https://www.google.com/maps/dir/?api=1&destination=${p.endereco_lat},${p.endereco_lng}&travelmode=driving`
                                    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(navAddr)}&travelmode=driving`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-bold"
                                    style={{ background: "rgba(66,133,244,0.1)", border: "1px solid rgba(66,133,244,0.25)", color: "#4285f4" }}>
                                    <Navigation size={11} /> Maps
                                  </a>
                                  <button onClick={() => handleEntregaItemRota(p.id)} disabled={entregandoItem === p.id}
                                    className="flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-bold"
                                    style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22c55e" }}>
                                    {entregandoItem === p.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                                    Entregue
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── PEDIDO ATIVO (atribuído pela empresa) ── */}
                  {pedido && (
                    <div className="rounded-2xl overflow-hidden"
                      style={{ border: `1px solid ${pedido.status === "em_coleta" ? "rgba(228,0,43,0.3)" : "rgba(167,139,250,0.25)"}` }}>
                      <div className="px-5 py-3 flex items-center gap-2"
                        style={{ background: pedido.status === "em_coleta" ? "rgba(228,0,43,0.08)" : "rgba(167,139,250,0.08)" }}>
                        <Bike size={14} style={{ color: pedido.status === "em_coleta" ? "#fb923c" : "#a78bfa" }} />
                        <p className="text-sm font-bold" style={{ color: pedido.status === "em_coleta" ? "#fb923c" : "#a78bfa" }}>
                          {pedido.status === "em_coleta" ? "Em coleta — vai buscar o pedido" : "Em rota — entregando ao cliente"}
                        </p>
                        <span className="ml-auto w-2 h-2 rounded-full"
                          style={{ background: pedido.status === "em_coleta" ? "#E4002B" : "#8b5cf6" }} />
                      </div>

                      <div className="p-5 space-y-3" style={{ background: "var(--bg-2)" }}>
                        <div>
                          <p className="text-lg font-bold text-white">{pedido.cliente_nome}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-sm" style={{ color: "#94a3b8" }}>{pedido.cliente_telefone}</p>
                            <span style={{ color: "#94a3b8" }}>·</span>
                            <p className="text-xs" style={{ color: "#94a3b8" }}>
                              {new Date(pedido.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                              {" às "}
                              {new Date(pedido.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: "#E4002B" }} />
                          <p className="text-sm text-white">{pedido.endereco_entrega}</p>
                        </div>
                        {pedido.distancia_km != null && (
                          <div className="flex items-center gap-1.5">
                            <Navigation size={13} style={{ color: "#94a3b8" }} />
                            <span className="text-sm font-medium" style={{ color: "#94a3b8" }}>
                              {pedido.distancia_km.toFixed(1)} km até o cliente
                            </span>
                          </div>
                        )}

                        <AddressMapLink lat={pedido.endereco_lat ?? null} lng={pedido.endereco_lng ?? null} label={pedido.endereco_entrega} routeAddress={pedido.route_address} />

                        {pedido.descricao_itens && (
                          <div className="px-3 py-2.5 rounded-xl" style={{ background: "var(--bg-1)" }}>
                            <p className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: "#94a3b8" }}>Itens</p>
                            <p className="text-sm text-white">{pedido.descricao_itens}</p>
                          </div>
                        )}

                        <div className="flex items-center gap-3">
                          {pedido.valor_pedido > 0 && (
                            <div className="flex-1 px-3 py-2 rounded-xl text-center" style={{ background: "var(--bg-1)" }}>
                              <p className="text-xs mb-0.5" style={{ color: "#94a3b8" }}>Cobrar do cliente</p>
                              <p className="text-sm font-bold text-white">R$ {(pedido.valor_pedido + pedido.valor_motoboy).toFixed(2)}</p>
                            </div>
                          )}
                          <div className="flex-1 px-3 py-2 rounded-xl text-center"
                            style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)" }}>
                            <p className="text-xs mb-0.5" style={{ color: "#f59e0b" }}>Seu ganho</p>
                            {pedido.valor_motoboy > 0
                              ? <p className="text-sm font-bold" style={{ color: "#fbbf24" }}>R$ {pedido.valor_motoboy.toFixed(2)}</p>
                              : <p className="text-xs font-semibold" style={{ color: "#d97706" }}>A definir</p>
                            }
                          </div>
                        </div>

                        <SeletorPagamento
                          pedidoId={pedido.id}
                          formaAtual={(pedido as unknown as PedidoFila).forma_pagamento ?? null}
                          troco={(pedido as unknown as PedidoFila).troco_para ?? null}
                        />

                        {pedido.observacoes && (
                          <p className="text-xs italic px-3 py-2 rounded-lg" style={{ background: "var(--bg-1)", color: "#94a3b8" }}>
                            "{pedido.observacoes}"
                          </p>
                        )}

                        <BotoesPedido />
                      </div>
                    </div>
                  )}

                  {/* ── PEDIDOS DISPONÍVEIS PARA ACEITAR ── */}
                  {!pedido && !rota && pedidosDisp.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400" />
                        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#60a5fa" }}>
                          Disponível para aceitar ({pedidosDisp.length})
                        </p>
                      </div>
                      {pedidosDisp.map((p) => {
                        const bairro = extrairBairro(p.endereco_entrega);
                        const tempo  = estimarTempo(p.distancia_km ?? null);
                        const pf = p as unknown as PedidoFila;
                        return (
                          <div key={p.id} className="rounded-2xl overflow-hidden"
                            style={{ border: "1px solid rgba(96,165,250,0.2)", background: "var(--bg-2)" }}>
                            {pf.empresa_nome && (
                              <div className="flex items-center gap-2 px-4 py-2" style={{ background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                {pf.empresa_logo_url
                                  ? <img src={pf.empresa_logo_url} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover" }} />
                                  : <Building2 size={14} style={{ color: "#94a3b8" }} />}
                                <span className="text-xs font-semibold" style={{ color: "#94a3b8" }}>{pf.empresa_nome}</span>
                              </div>
                            )}
                            <div className="p-4 space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-base font-bold text-white">{p.cliente_nome}</p>
                                  <p className="text-sm" style={{ color: "#94a3b8" }}>{p.cliente_telefone}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  {tempo && (
                                    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                                      style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
                                      <Clock size={10} className="inline mr-1" />{tempo}
                                    </span>
                                  )}
                                  <span className="text-xs px-2 py-0.5 rounded-full"
                                    style={{ background: "rgba(96,165,250,0.08)", color: "#60a5fa" }}>
                                    {tempoDesde(p.created_at)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-start gap-2">
                                <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: "#E4002B" }} />
                                <div>
                                  <p className="text-sm text-white">{p.endereco_entrega}</p>
                                  {bairro && <p className="text-xs mt-0.5" style={{ color: "#60a5fa" }}>{bairro}</p>}
                                </div>
                              </div>
                              {p.observacoes && (
                                <p className="text-xs italic px-3 py-2 rounded-lg" style={{ background: "var(--bg-1)", color: "#94a3b8" }}>
                                  "{p.observacoes}"
                                </p>
                              )}
                              {p.descricao_itens && (
                                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--bg-1)", color: "#94a3b8" }}>{p.descricao_itens}</p>
                              )}
                              <div className="flex items-center gap-2">
                                {p.distancia_km != null && (
                                  <div className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-xl"
                                    style={{ background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.1)" }}>
                                    <Navigation size={12} style={{ color: "#94a3b8" }} />
                                    <span className="text-xs font-medium" style={{ color: "#94a3b8" }}>{p.distancia_km.toFixed(1)} km</span>
                                  </div>
                                )}
                                {p.valor_motoboy > 0 && (
                                  <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl"
                                    style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)" }}>
                                    <span className="text-xs" style={{ color: "#f59e0b" }}>Ganho</span>
                                    <span className="text-sm font-bold" style={{ color: "#fbbf24" }}>R$ {p.valor_motoboy.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>
                              {aceitando === p.id ? (
                                <div className="flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-bold"
                                  style={{ background: "var(--bg-1)", color: "#94a3b8" }}>
                                  <Loader2 size={14} className="animate-spin" /> Aceitando...
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  <button
                                    onClick={() => aceitarENavegar(p.id, "waze")}
                                    disabled={!!aceitando}
                                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-bold"
                                    style={{ background: "rgba(0,210,170,0.12)", border: "1px solid rgba(0,210,170,0.3)", color: "#00d2aa", opacity: aceitando ? 0.5 : 1 }}>
                                    <Navigation size={15} /> IR COM WAZE
                                  </button>
                                  <button
                                    onClick={() => aceitarENavegar(p.id, "gmaps")}
                                    disabled={!!aceitando}
                                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-bold"
                                    style={{ background: "rgba(66,133,244,0.12)", border: "1px solid rgba(66,133,244,0.3)", color: "#4285f4", opacity: aceitando ? 0.5 : 1 }}>
                                    <Navigation size={15} /> IR COM GOOGLE MAPS
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── AGUARDANDO (sem pedido ativo e sem disponíveis) ── */}
                  {!pedido && !rota && pedidosDisp.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-2xl"
                      style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.08)" }}>
                        <CheckCircle size={22} style={{ color: "#22c55e" }} />
                      </div>
                      <p className="text-sm font-bold text-white">Você está livre</p>
                      {motoboy?.posicao_fila != null && (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full"
                          style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                          <span className="text-xs font-bold" style={{ color: "#fbbf24" }}>Posição #{motoboy.posicao_fila} na fila</span>
                        </div>
                      )}
                      <p className="text-xs text-center px-6" style={{ color: "#94a3b8" }}>Aguardando pedidos da empresa</p>
                    </div>
                  )}

                  {/* ── FILA DA EMPRESA ── */}
                  {pedidosFila.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#94a3b8" }}>
                        Fila da empresa ({pedidosFila.length})
                      </p>
                      <div className="space-y-2">
                        {pedidosFila.map((p, i) => {
                          const ST: Record<string, { label: string; color: string }> = {
                            em_fila:            { label: "Na fila",    color: "#94a3b8" },
                            em_preparo:         { label: "Em preparo", color: "#fbbf24" },
                            finalizado:         { label: "Pronto",     color: "#60a5fa" },
                            em_coleta:          { label: "Em coleta",  color: "#fb923c" },
                            em_rota_de_entrega: { label: "Em rota",    color: "#a78bfa" },
                          };
                          const st = ST[p.status] ?? { label: p.status, color: "#94a3b8" };
                          const isMe = p.motoboy_id === motoboy?.id;
                          return (
                            <div key={p.id} className="rounded-xl overflow-hidden"
                              style={{
                                background: isMe ? "rgba(251,191,36,0.08)" : "var(--overlay-xs)",
                                border: `1px solid ${isMe ? "rgba(251,191,36,0.25)" : "var(--overlay-sm)"}`,
                              }}>
                              {p.empresa_nome && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5" style={{ background: "rgba(0,0,0,0.2)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                  {p.empresa_logo_url
                                    ? <img src={p.empresa_logo_url} alt="" style={{ width: 14, height: 14, borderRadius: 3, objectFit: "cover" }} />
                                    : <Building2 size={10} style={{ color: "#64748b" }} />}
                                  <span className="text-xs" style={{ color: "#64748b" }}>{p.empresa_nome}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-3 px-4 py-3">
                                <span className="text-xs font-mono w-5 text-center shrink-0" style={{ color: "#94a3b8" }}>{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-white truncate">{p.cliente_nome}</p>
                                  <p className="text-xs truncate" style={{ color: "#94a3b8" }}>{p.endereco_entrega}</p>
                                </div>
                                <div className="text-right shrink-0 space-y-0.5">
                                  <span className="text-xs font-bold" style={{ color: isMe ? "#fbbf24" : st.color }}>
                                    {isMe ? "Seu pedido" : st.label}
                                  </span>
                                  {p.valor_motoboy > 0 && (
                                    <p className="text-xs" style={{ color: "#94a3b8" }}>R$ {p.valor_motoboy.toFixed(2)}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ═══ DESEMPENHO ════════════════════════════════════ */}
              {tab === "desempenho" && (
                <>
                  <div>
                    <h2 className="text-sm font-bold text-white mb-4">Desempenho</h2>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-4 rounded-2xl" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                        <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#94a3b8" }}>Total entregas</p>
                        <p className="text-3xl font-black" style={{ color: "#22c55e" }}><AnimatedNumber value={totalEntregas} /></p>
                        <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>realizadas</p>
                      </div>
                      <div className="p-4 rounded-2xl" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                        <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#94a3b8" }}>Entregas hoje</p>
                        <p className="text-3xl font-black" style={{ color: "#60a5fa" }}><AnimatedNumber value={entregasHoje} /></p>
                        <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>neste dia</p>
                      </div>
                      <div className="p-4 rounded-2xl" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                        <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#94a3b8" }}>KM rodados</p>
                        <p className="text-3xl font-black" style={{ color: "#fbbf24" }}><AnimatedNumber value={kmTotais} decimals={1} /></p>
                        <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>km no total</p>
                      </div>
                      <div className="p-4 rounded-2xl" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                        <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#94a3b8" }}>Ranking</p>
                        <p className="text-3xl font-black" style={{ color: "#a78bfa" }}>{ranking ? `#${ranking}` : "—"}</p>
                        <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>na empresa</p>
                      </div>
                    </div>
                  </div>

                  {/* Tempo médio */}
                  {tempoMedio !== null && (
                    <div className="rounded-2xl p-4 flex items-center gap-4"
                      style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: "rgba(251,191,36,0.1)" }}>
                        <Clock size={18} style={{ color: "#fbbf24" }} />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: "#94a3b8" }}>Tempo médio de entrega</p>
                        <p className="text-xl font-black text-white">
                          <AnimatedNumber value={tempoMedio} /> <span className="text-sm font-normal" style={{ color: "#94a3b8" }}>min</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Avaliação */}
                  <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                    <p className="text-xs uppercase tracking-wide mb-3" style={{ color: "#94a3b8" }}>Avaliação</p>
                    <div className="flex items-center gap-4">
                      <span className="text-4xl font-black" style={{ color: "#fbbf24" }}>{rating.toFixed(1)}</span>
                      <div>
                        <StarRating value={rating} size={20} />
                        <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>de 5.0 estrelas</p>
                      </div>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                    <div className="flex items-center gap-2 mb-3">
                      <Award size={14} style={{ color: "#fbbf24" }} />
                      <p className="text-sm font-semibold text-white">Conquistas</p>
                    </div>
                    {badges.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {badges.map((b) => (
                          <div key={b.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                            style={{ background: b.color + "15", border: `1px solid ${b.color}30` }}>
                            <span className="text-base leading-none">{b.emoji}</span>
                            <span className="text-xs font-semibold" style={{ color: b.color }}>{b.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: "#94a3b8" }}>Faça sua primeira entrega para ganhar conquistas!</p>
                    )}
                  </div>

                  {/* Próximas conquistas */}
                  {totalEntregas < 100 && (
                    <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#94a3b8" }}>Próximas conquistas</p>
                      <div className="space-y-3">
                        {[
                          { threshold: 10,  label: "Dedicado",       emoji: "⭐" },
                          { threshold: 50,  label: "Top Entregador", emoji: "🏆" },
                          { threshold: 100, label: "Lendário",       emoji: "👑" },
                        ].filter(({ threshold }) => totalEntregas < threshold).slice(0, 2).map(({ threshold, label, emoji }) => (
                          <div key={threshold}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs text-white">{emoji} {label}</span>
                              <span className="text-xs" style={{ color: "#94a3b8" }}>{totalEntregas}/{threshold}</span>
                            </div>
                            <div className="h-1.5 rounded-full" style={{ background: "var(--bg-3)" }}>
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${Math.min((totalEntregas / threshold) * 100, 100)}%`, background: "linear-gradient(90deg,#fbbf24,#d97706)" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ═══ FINANCEIRO ════════════════════════════════════ */}
              {tab === "financeiro" && (
                <>
                  <h2 className="text-sm font-bold text-white">Relatório de ganhos</h2>

                  {/* Period selector */}
                  <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--bg-1)" }}>
                    {PERIODS.map(({ key, label }) => (
                      <button key={key} onClick={() => setPeriod(key)}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                        style={period === key
                          ? { background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }
                          : { background: "transparent", color: "#94a3b8", border: "1px solid transparent" }}>
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl text-center" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                      <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#94a3b8" }}>Entregas</p>
                      <p className="text-3xl font-black text-white">{report.entregas}</p>
                    </div>
                    <div className="p-4 rounded-2xl text-center"
                      style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.1)" }}>
                      <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#f59e0b" }}>Ganhos</p>
                      <p className="text-3xl font-black" style={{ color: "#fbbf24" }}>R${report.ganhos.toFixed(2)}</p>
                    </div>
                  </div>

                  {report.entregas > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                      <span className="text-xs" style={{ color: "#94a3b8" }}>Média por entrega</span>
                      <span className="text-sm font-bold" style={{ color: "#fbbf24" }}>
                        R$ {(report.ganhos / report.entregas).toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                      <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#94a3b8" }}>KM total</p>
                      <p className="text-2xl font-black text-white"><AnimatedNumber value={kmTotais} decimals={1} /></p>
                      <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>km rodados</p>
                    </div>
                    {kmTotais > 0 && totalEntregas > 0 && (
                      <div className="p-4 rounded-2xl" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                        <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#94a3b8" }}>Média/entrega</p>
                        <p className="text-2xl font-black" style={{ color: "#34d399" }}>
                          {(kmTotais / totalEntregas).toFixed(1)}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>km por corrida</p>
                      </div>
                    )}
                  </div>

                  {report.entregas === 0 && (
                    <p className="text-xs text-center py-4" style={{ color: "#94a3b8" }}>Nenhuma entrega neste período</p>
                  )}

                  {/* Histórico de entregas */}
                  {historicoEntregas.length > 0 && (
                    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-1)" }}>
                        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#94a3b8" }}>
                          Últimas entregas
                        </p>
                      </div>
                      <div>
                        {historicoEntregas.map((e, i) => (
                          <div key={e.id}
                            className="flex items-center gap-3 px-4 py-3"
                            style={{ borderBottom: i < historicoEntregas.length - 1 ? "1px solid var(--border-1)" : "none" }}>
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#22c55e" }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{e.cliente_nome}</p>
                              <p className="text-xs truncate" style={{ color: "#94a3b8" }}>{e.endereco_entrega}</p>
                              <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>
                                {new Date(e.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                                {e.distancia_km ? ` · ${e.distancia_km.toFixed(1)} km` : ""}
                              </p>
                            </div>
                            <p className="text-sm font-bold shrink-0" style={{ color: "#fbbf24" }}>
                              R${e.valor_motoboy.toFixed(2)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ═══ CHAT ══════════════════════════════════════════ */}
              {tab === "chat" && (
                <div className="flex flex-col" style={{ height: "calc(100dvh - 160px)" }}>
                  {!motoboy || !motoboy.empresa_id ? (
                    <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12">
                      <MessageCircle size={28} style={{ color: "#94a3b8" }} />
                      <p className="text-sm" style={{ color: "#94a3b8" }}>Vincule-se a uma empresa para usar o chat</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 overflow-y-auto space-y-2 pb-2">
                        {chatMsgs.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <MessageCircle size={28} style={{ color: "#94a3b8" }} />
                            <p className="text-sm" style={{ color: "#94a3b8" }}>Nenhuma mensagem ainda</p>
                          </div>
                        ) : chatMsgs.map((m) => {
                          const isEmp = m.remetente === "empresa";
                          return (
                            <div key={m.id} className={`flex ${isEmp ? "justify-start" : "justify-end"}`}>
                              <div className="max-w-[78%] rounded-2xl px-3.5 py-2"
                                style={{
                                  background: isEmp ? "rgba(251,191,36,0.1)" : "rgba(34,197,94,0.1)",
                                  border: isEmp ? "1px solid rgba(251,191,36,0.2)" : "1px solid rgba(34,197,94,0.2)",
                                  borderBottomLeftRadius: isEmp ? 4 : 16,
                                  borderBottomRightRadius: isEmp ? 16 : 4,
                                }}>
                                <p className="text-xs font-bold mb-0.5" style={{ color: isEmp ? "#fbbf24" : "#22c55e" }}>
                                  {isEmp ? "Empresa" : "Você"}
                                </p>
                                <p className="text-sm leading-snug text-white">{m.texto}</p>
                                <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                                  {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={chatBottomRef} />
                      </div>
                      <div className="flex gap-2 items-end pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                        <textarea
                          value={chatTexto}
                          onChange={(e) => setChatTexto(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarChatMsg(motoboy.id, motoboy.empresa_id!); } }}
                          placeholder="Mensagem para a empresa..."
                          rows={1}
                          className="flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none"
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "white", maxHeight: 80 }}
                        />
                        <button
                          onClick={() => enviarChatMsg(motoboy.id, motoboy.empresa_id!)}
                          disabled={!chatTexto.trim() || chatSending}
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{
                            background: chatTexto.trim() ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
                            color: chatTexto.trim() ? "#22c55e" : "#94a3b8",
                            border: "1px solid " + (chatTexto.trim() ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"),
                          }}>
                          {chatSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ═══ PERFIL ════════════════════════════════════════ */}
              {tab === "perfil" && (
                <>
                  {/* Código de cadastro — destacado no topo */}
                  {motoboy?.codigo && (
                    <div className="rounded-2xl p-4"
                      style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)" }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Hash size={14} style={{ color: "#fbbf24" }} />
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#fbbf24" }}>Código de convite</p>
                      </div>
                      <p className="text-xs mb-3" style={{ color: "#94a3b8" }}>Compartilhe com a empresa para te cadastrar no sistema</p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 flex items-center px-4 py-3 rounded-xl"
                          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(251,191,36,0.2)" }}>
                          <span className="text-3xl font-black tracking-[0.35em]"
                            style={{ color: "#fbbf24", fontFamily: "monospace" }}>
                            {motoboy.codigo}
                          </span>
                        </div>
                        <button onClick={copiarCodigo} type="button"
                          className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold shrink-0"
                          style={{
                            background: "rgba(251,191,36,0.14)",
                            color: copiadoCodigo ? "#22c55e" : "#fbbf24",
                            border: "1px solid rgba(251,191,36,0.25)",
                          }}>
                          {copiadoCodigo ? <CheckCircle size={14} /> : <Copy size={14} />}
                          {copiadoCodigo ? "Copiado!" : "Copiar"}
                        </button>
                      </div>
                    </div>
                  )}

                  <h2 className="text-sm font-bold text-white">Editar perfil</h2>

                  {motoboy ? (
                    <form onSubmit={salvarPerfil} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "#94a3b8" }}>Nome</label>
                        <input value={editNome} onChange={(e) => setEditNome(e.target.value)} required
                          className="w-full px-4 rounded-xl text-sm text-white outline-none"
                          style={IS}
                          onFocus={(e) => (e.target.style.borderColor = "rgba(251,191,36,0.5)")}
                          onBlur={(e) => (e.target.style.borderColor = "var(--overlay-lg)")} />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "#94a3b8" }}>Veículo</label>
                        <div className="flex gap-2">
                          {[
                            { key: "moto",      label: "Moto",  Icon: Bike },
                            { key: "bicicleta", label: "Bike",  Icon: Bike },
                            { key: "carro",     label: "Carro", Icon: Car  },
                          ].map(({ key, label, Icon }) => (
                            <button key={key} type="button" onClick={() => setEditVeiculo(key)}
                              className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-all"
                              style={{
                                background: editVeiculo === key ? "rgba(251,191,36,0.12)" : "var(--overlay-xs)",
                                color: editVeiculo === key ? "#fbbf24" : "#94a3b8",
                                border: `1px solid ${editVeiculo === key ? "rgba(251,191,36,0.35)" : "var(--overlay-md)"}`,
                              }}>
                              <Icon size={18} />
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "#94a3b8" }}>Área de atuação</label>
                        <input value={editArea} onChange={(e) => setEditArea(e.target.value)}
                          placeholder="Ex: Centro, Boa Viagem, Recife - PE"
                          className="w-full px-4 rounded-xl text-sm text-white placeholder-gray-700 outline-none"
                          style={IS}
                          onFocus={(e) => (e.target.style.borderColor = "rgba(251,191,36,0.5)")}
                          onBlur={(e) => (e.target.style.borderColor = "var(--overlay-lg)")} />
                      </div>

                      <button type="submit" disabled={savingPerfil}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all"
                        style={{
                          background: perfilSalvo ? "rgba(34,197,94,0.15)" : "linear-gradient(135deg,#d97706,#b45309)",
                          color: perfilSalvo ? "#4ade80" : "white",
                        }}>
                        {savingPerfil ? <><Loader2 size={14} className="animate-spin" /> Salvando...</>
                        : perfilSalvo  ? <><CheckCircle size={14} /> Salvo!</>
                                       : <><Save size={14} /> Salvar perfil</>}
                      </button>
                    </form>
                  ) : (
                    <p className="text-xs" style={{ color: "#94a3b8" }}>Vincule-se a uma empresa para editar o perfil.</p>
                  )}

                  {/* Status manual */}
                  {motoboy && motoboy.status !== "em_entrega" && (
                    <div className="rounded-2xl p-4 flex items-center justify-between"
                      style={{
                        background: motoboy.status === "disponivel" ? "rgba(34,197,94,0.06)" : "rgba(71,85,105,0.06)",
                        border: `1px solid ${motoboy.status === "disponivel" ? "rgba(34,197,94,0.2)" : "rgba(71,85,105,0.2)"}`,
                      }}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                          style={{ background: motoboy.status === "disponivel" ? "rgba(34,197,94,0.1)" : "rgba(71,85,105,0.1)" }}>
                          <Power size={16} style={{ color: motoboy.status === "disponivel" ? "#22c55e" : "#94a3b8" }} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">
                            {motoboy.status === "disponivel" ? "Disponível" : "Offline"}
                          </p>
                          <p className="text-xs" style={{ color: "#94a3b8" }}>
                            {motoboy.status === "disponivel" ? "Você aparece para novos pedidos" : "Você está invisível"}
                          </p>
                        </div>
                      </div>
                      <button onClick={toggleStatusManual} disabled={togglingStatus}
                        className="relative w-12 h-6 rounded-full transition-all shrink-0"
                        style={{ background: motoboy.status === "disponivel" ? "#22c55e" : "#94a3b8" }}>
                        {togglingStatus
                          ? <Loader2 size={12} className="absolute inset-0 m-auto animate-spin text-white" />
                          : <span className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                              style={{ left: motoboy.status === "disponivel" ? "26px" : "4px" }} />}
                      </button>
                    </div>
                  )}

                  {/* Logout */}
                  <button onClick={handleLogout}
                    className="flex items-center gap-3 w-full p-4 rounded-2xl text-sm font-semibold"
                    style={{ background: "rgba(228,0,43,0.06)", border: "1px solid rgba(228,0,43,0.15)", color: "#FFC72C" }}>
                    <LogOut size={16} />
                    Sair da conta
                  </button>
                </>
              )}

            </div>
          </div>
        )}

        {/* ── Mapa ── */}
        {tab === "mapa" && (
          <div style={{ position: "absolute", inset: 0 }}>
            <MotoboyMapDynamic
              coords={coords}
              destLat={pedido?.endereco_lat ?? null}
              destLng={pedido?.endereco_lng ?? null}
              destAddress={pedido?.endereco_entrega}
              routeAddress={pedido?.route_address}
              pedidoId={pedido?.id ?? null}
              isDelivery={pedido?.status === "em_rota_de_entrega"}
            />
            {/* Map overlay: nav button when active delivery + location indicator */}
            <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, zIndex: 10, pointerEvents: "none" }}>
              {pedido?.endereco_lat && pedido?.endereco_lng ? (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${pedido.endereco_lat},${pedido.endereco_lng}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl text-sm font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg,#1d4ed8,#1e40af)",
                    boxShadow: "0 8px 24px rgba(29,78,216,0.4)",
                    pointerEvents: "auto",
                  }}>
                  <Navigation size={18} />
                  Iniciar rota — {pedido.endereco_entrega.split(",")[0]}
                </a>
              ) : (
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl w-fit mx-auto"
                  style={{ background: "rgba(0,0,0,0.88)", border: "1px solid rgba(255,255,255,0.08)", pointerEvents: "none" }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: gpsAtivo ? "#22c55e" : "#E4002B" }} />
                  <span className="text-xs font-medium text-white">{gpsAtivo ? "GPS ativo — posição sendo rastreada" : "GPS inativo"}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Toast ──────────────────────────────────────────────────── */}
      {toast && (
        <div
          style={{
            position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
            zIndex: 99999, pointerEvents: "none",
            background: toast.tipo === "ok" ? "rgba(34,197,94,0.95)" : "rgba(228,0,43,0.95)",
            color: "#fff", borderRadius: 14, padding: "12px 20px",
            fontSize: 14, fontWeight: 600, maxWidth: "90vw", textAlign: "center",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            backdropFilter: "blur(8px)",
          }}>
          {toast.msg}
        </div>
      )}

      {/* ── Modal de navegação ─────────────────────────────────────── */}
      {navModal && (
        <div
          onClick={() => setNavModal(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.75)", display: "flex",
            alignItems: "flex-end",
          }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", background: "var(--bg-1)",
              borderRadius: "24px 24px 0 0",
              padding: "28px 20px calc(28px + env(safe-area-inset-bottom))",
            }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-6" style={{ background: "#2a2a2a" }} />
            <p className="text-base font-bold text-white mb-1">
              {navModal.tipo === "entrega" ? "Iniciar rota de entrega" : "Rota de volta à base"}
            </p>
            <p className="text-sm mb-6 truncate" style={{ color: "#94a3b8" }}>
              {navModal.tipo === "entrega" ? navModal.endereco : "Retornar à empresa"}
            </p>
            <div className="space-y-3">
              <button
                onClick={() => handleNavEscolha("gmaps")}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left"
                style={{ background: "rgba(66,133,244,0.1)", border: "1px solid rgba(66,133,244,0.25)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(66,133,244,0.15)" }}>
                  <MapPin size={18} style={{ color: "#4285f4" }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: "#4285f4" }}>Google Maps</p>
                  <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>Abrir no Google Maps</p>
                </div>
              </button>
              <button
                onClick={() => handleNavEscolha("waze")}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left"
                style={{ background: "rgba(0,210,170,0.08)", border: "1px solid rgba(0,210,170,0.2)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(0,210,170,0.12)" }}>
                  <Navigation size={18} style={{ color: "#00d2aa" }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: "#00d2aa" }}>Waze</p>
                  <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>Abrir no Waze</p>
                </div>
              </button>
              <button
                onClick={() => setNavModal(null)}
                className="w-full py-3 rounded-xl text-sm font-semibold"
                style={{ color: "#94a3b8" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom nav ─────────────────────────────────────────────── */}
      <div style={{ background: "var(--bg-2)", borderTop: "1px solid var(--border-1)", flexShrink: 0, display: "flex" }}>
        {TABS.map(({ key, Icon, label }) => {
          const active = tab === key;
          const hasBadge = (key === "pedidos" && (pedido || pedidosDisp.length > 0)) ||
                           (key === "chat" && chatUnread > 0);
          return (
            <button key={key} onClick={() => { setTab(key as Tab); }}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                gap: 3, paddingTop: 10, paddingBottom: 10,
                background: "none", border: "none", cursor: "pointer",
                color: active ? "#E4002B" : "#4b5563", position: "relative",
              }}>
              {/* Active top bar — sem transform */}
              {active && (
                <span style={{
                  position: "absolute", top: 0, left: "25%", right: "25%",
                  height: 2, borderRadius: "0 0 3px 3px", background: "#E4002B",
                }} />
              )}
              <div style={{ position: "relative" }}>
                <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
                {hasBadge && !active && (
                  <span style={{
                    position: "absolute", top: -3, right: -3,
                    width: 7, height: 7, borderRadius: "50%", background: "#ef4444",
                  }} />
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, lineHeight: 1 }}>{label}</span>
            </button>
          );
        })}
      </div>

    </div>
  );
}


