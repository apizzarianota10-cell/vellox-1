"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { CheckCircle, Clock, ChevronRight, Package, Bike, Home, MapPin, Phone, RefreshCw, Zap, Bell, BellRing, X } from "lucide-react";

type Status =
  | "em_fila" | "em_preparo" | "finalizado"
  | "em_coleta" | "em_rota_de_entrega" | "aguardando_confirmacao"
  | "entregue" | "cancelado";

const STATUS_LABELS: Record<Status, string> = {
  em_fila: "Pedido recebido",
  em_preparo: "Seu pedido entrou em preparo",
  finalizado: "Seu pedido está pronto",
  em_coleta: "Seu pedido está pronto para entrega",
  em_rota_de_entrega: "Seu pedido saiu para entrega",
  aguardando_confirmacao: "O motoboy chegou",
  entregue: "Pedido entregue!",
  cancelado: "Pedido cancelado",
};

// Toca um bipe curto de duas notas via Web Audio — sem depender de arquivo de áudio
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1175].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
    setTimeout(() => ctx.close(), 600);
  } catch { /* Web Audio indisponível */ }
}

interface Pedido {
  id: string;
  tracking_token: string;
  status: Status;
  created_at: string;
  updated_at: string;
  cliente_nome: string;
  tipo_pedido: "entrega" | "retirada";
  endereco_entrega: string;
  bairro: string | null;
  descricao_itens: string | null;
  observacoes: string | null;
  valor_pedido: number;
  valor_motoboy: number;
  forma_pagamento: string | null;
  troco_para: number | null;
  motoboy: { nome: string; telefone: string; latitude: number | null; longitude: number | null } | null;
  empresa: { nome: string } | null;
}

const PGTO_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "PIX",
  cartao_credito: "Cartão de Crédito", cartao_debito: "Cartão de Débito",
  ja_pago: "Já pago",
};

interface Step {
  label: string;
  icon: React.ElementType;
  statuses: Status[];
}

const STEPS_ENTREGA: Step[] = [
  { label: "Pedido recebido",      icon: CheckCircle, statuses: ["em_fila"] },
  { label: "Em preparo",           icon: Clock,       statuses: ["em_preparo"] },
  { label: "Pronto para entrega",  icon: Package,     statuses: ["finalizado", "em_coleta"] },
  { label: "Em rota de entrega",   icon: Bike,        statuses: ["em_rota_de_entrega", "aguardando_confirmacao"] },
  { label: "Entregue!",            icon: Home,        statuses: ["entregue"] },
];

const STEPS_RETIRADA: Step[] = [
  { label: "Pedido recebido",     icon: CheckCircle, statuses: ["em_fila"] },
  { label: "Em preparo",          icon: Clock,       statuses: ["em_preparo"] },
  { label: "Pronto p/ retirada",  icon: Package,     statuses: ["finalizado"] },
  { label: "Retirado!",           icon: Home,        statuses: ["entregue"] },
];

function getStepIndex(steps: Step[], status: Status): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].statuses.includes(status)) return i;
  }
  return 0;
}

export default function TrackingClient({ token }: { token: string }) {
  const [pedido, setPedido]   = useState<Pedido | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [lastUp,  setLastUp]  = useState<Date>(new Date());
  const [toast,   setToast]   = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">("default");

  const prevStatusRef = useRef<Status | null>(null);
  const toastTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNotifPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  function avisarMudancaStatus(status: Status) {
    const label = STATUS_LABELS[status] ?? "Seu pedido foi atualizado";
    playChime();
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    setToast(label);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 7000);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try { new Notification(label, { body: "Toque para ver os detalhes do seu pedido.", icon: "/icon" }); } catch {}
    }
  }

  async function pedirPermissaoNotificacao() {
    if (typeof Notification === "undefined") return;
    const res = await Notification.requestPermission();
    setNotifPerm(res);
  }

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`/api/pedido/${token}`, { cache: "no-store" });
      if (!res.ok) { setError("Pedido não encontrado."); return; }
      const { pedido: p } = await res.json();
      if (prevStatusRef.current !== null && p.status !== prevStatusRef.current) {
        avisarMudancaStatus(p.status as Status);
      }
      prevStatusRef.current = p.status as Status;
      setPedido(p);
      setLastUp(new Date());
    } catch {
      setError("Erro ao carregar pedido.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 15_000);
    return () => clearInterval(id);
  }, [fetch_]);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f7f8", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid #FF6A00", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color: "#64748b", fontSize: 14 }}>Carregando pedido...</p>
      </div>
    </div>
  );

  if (error || !pedido) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f7f8", fontFamily: "system-ui,sans-serif", padding: "0 20px" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 48, margin: "0 0 12px" }}>🔍</p>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "0 0 8px" }}>Pedido não encontrado</h1>
        <p style={{ fontSize: 14, color: "#64748b" }}>{error || "O link pode estar incorreto."}</p>
        <Link href="/meus-pedidos" style={{ display: "inline-block", marginTop: 20, padding: "10px 24px", borderRadius: 12, background: "#FF6A00", color: "#fff", fontWeight: 700, textDecoration: "none", fontSize: 14 }}>
          Consultar pelo telefone
        </Link>
      </div>
    </div>
  );

  const isCancelado = pedido.status === "cancelado";
  const isEntregue  = pedido.status === "entregue";
  const isRetirada  = pedido.tipo_pedido === "retirada";
  const steps       = isRetirada ? STEPS_RETIRADA : STEPS_ENTREGA;
  const currentStep = isCancelado ? -1 : getStepIndex(steps, pedido.status);
  const total       = pedido.valor_pedido + pedido.valor_motoboy;
  const cor         = isCancelado ? "#ef4444" : isEntregue ? "#22c55e" : "#FF6A00";

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f8", fontFamily: "system-ui,sans-serif" }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideDown{from{opacity:0;transform:translate(-50%,-12px)}to{opacity:1;transform:translate(-50%,0)}}
      `}</style>

      {/* Toast de atualização de status */}
      {toast && (
        <div style={{ position: "fixed", top: 14, left: "50%", zIndex: 1000, width: "calc(100% - 32px)", maxWidth: 420, animation: "slideDown 0.3s ease" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#0f172a", color: "#fff", borderRadius: 14,
            padding: "12px 14px", boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
          }}>
            <BellRing size={17} style={{ color: "#FF6A00", flexShrink: 0 }} />
            <p style={{ flex: 1, fontSize: 13, fontWeight: 700, margin: 0 }}>{toast}</p>
            <button onClick={() => setToast(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 2, flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: cor, padding: "20px 20px 32px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.12)" }} />
        <div style={{ position: "relative", maxWidth: 480, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={18} color="#fff" />
            </div>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>
              {pedido.empresa?.nome ?? "Vellox"}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", margin: "0 0 4px" }}>
            Pedido #{pedido.id.slice(0, 8).toUpperCase()}
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.03em" }}>
            {isCancelado ? "Pedido cancelado" : isEntregue ? (isRetirada ? "Pedido retirado!" : "Pedido entregue!") : "Acompanhe seu pedido"}
          </h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", margin: 0 }}>
            {new Date(pedido.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px 40px", marginTop: -16 }}>

        {/* Timeline card */}
        <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 20px rgba(0,0,0,0.08)", overflow: "hidden", marginBottom: 16, animation: "slideUp 0.4s ease" }}>
          <div style={{ padding: "16px 20px 8px", borderBottom: "1px solid #f1f5f9" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
              Status do pedido
            </p>
          </div>

          {isCancelado ? (
            <div style={{ padding: "20px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 22 }}>❌</span>
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: "#dc2626", margin: "0 0 2px" }}>Pedido cancelado</p>
                <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>Entre em contato com a loja para mais informações</p>
              </div>
            </div>
          ) : (
            <div style={{ padding: "16px 20px" }}>
              {steps.map((step, i) => {
                const done    = i < currentStep;
                const active  = i === currentStep;
                const pending = i > currentStep;
                const Icon    = step.icon;
                const isLast  = i === steps.length - 1;
                return (
                  <div key={i} style={{ display: "flex", gap: 14, marginBottom: isLast ? 0 : 4 }}>
                    {/* Icon col */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 36, flexShrink: 0 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: done ? "#22c55e" : active ? cor : "#f1f5f9",
                        transition: "all 0.3s",
                        flexShrink: 0,
                        boxShadow: active ? `0 0 0 4px ${cor}22` : "none",
                      }}>
                        {done
                          ? <CheckCircle size={18} color="#fff" />
                          : <Icon size={17} color={active ? "#fff" : "#cbd5e1"} />}
                      </div>
                      {!isLast && (
                        <div style={{ width: 2, flex: 1, minHeight: 20, background: done ? "#22c55e" : "#e2e8f0", margin: "3px 0", borderRadius: 2 }} />
                      )}
                    </div>
                    {/* Text col */}
                    <div style={{ paddingTop: 8, paddingBottom: isLast ? 0 : 20 }}>
                      <p style={{
                        fontSize: 14, fontWeight: active ? 800 : done ? 600 : 500,
                        color: pending ? "#cbd5e1" : done ? "#22c55e" : active ? "#0f172a" : "#94a3b8",
                        margin: "0 0 2px",
                        lineHeight: 1.3,
                      }}>
                        {step.label}
                        {active && !isEntregue && (
                          <span style={{ marginLeft: 6, display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: cor, animation: "pulse 1.5s ease-in-out infinite", verticalAlign: "middle" }} />
                        )}
                      </p>
                      {active && pedido.status !== "em_fila" && (
                        <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
                          {new Date(pedido.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Motoboy card — quando em rota */}
        {pedido.motoboy && (pedido.status === "em_coleta" || pedido.status === "em_rota_de_entrega" || pedido.status === "aguardando_confirmacao") && (
          <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 20px rgba(0,0,0,0.08)", padding: "16px 20px", marginBottom: 16, animation: "slideUp 0.4s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(251,191,36,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Bike size={22} style={{ color: "#f59e0b" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Motoboy</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", margin: 0 }}>{pedido.motoboy.nome}</p>
                {pedido.motoboy.telefone && (
                  <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0" }}>{pedido.motoboy.telefone}</p>
                )}
              </div>
              {pedido.motoboy.telefone && (
                <a href={`tel:${pedido.motoboy.telefone}`}
                  style={{ width: 40, height: 40, borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, textDecoration: "none" }}>
                  <Phone size={16} style={{ color: "#16a34a" }} />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Endereço */}
        {pedido.tipo_pedido === "entrega" && (
          <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 20px rgba(0,0,0,0.08)", padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <MapPin size={16} style={{ color: "#f97316" }} />
              </div>
              <div>
                <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 3px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Endereço de entrega</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0, lineHeight: 1.4 }}>
                  {pedido.endereco_entrega}{pedido.bairro ? ` — ${pedido.bairro}` : ""}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Resumo do pedido */}
        <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 20px rgba(0,0,0,0.08)", overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #f1f5f9" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Resumo do pedido</p>
          </div>
          <div style={{ padding: "12px 20px" }}>
            {pedido.descricao_itens && (
              <pre style={{ fontSize: 13, color: "#475569", margin: "0 0 12px", fontFamily: "inherit", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {pedido.descricao_itens}
              </pre>
            )}
            {pedido.observacoes && (
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px", fontStyle: "italic" }}>Obs: {pedido.observacoes}</p>
            )}
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>Subtotal</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>R$ {pedido.valor_pedido.toFixed(2).replace(".", ",")}</span>
              </div>
              {pedido.valor_motoboy > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>Entrega</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>R$ {pedido.valor_motoboy.toFixed(2).replace(".", ",")}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Total</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.02em" }}>R$ {total.toFixed(2).replace(".", ",")}</span>
              </div>
              {pedido.forma_pagamento && (
                <p style={{ fontSize: 12, color: "#94a3b8", margin: "6px 0 0", textAlign: "right" }}>
                  {PGTO_LABELS[pedido.forma_pagamento] ?? pedido.forma_pagamento}
                  {pedido.troco_para ? ` · Troco p/ R$ ${pedido.troco_para.toFixed(2).replace(".", ",")}` : ""}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Atualização automática */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
          <RefreshCw size={12} style={{ color: "#94a3b8", animation: "spin 3s linear infinite" }} />
          <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
            Atualiza automaticamente · Último: {lastUp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        </div>

        {/* Ativar notificações */}
        {notifPerm !== "unsupported" && !isEntregue && !isCancelado && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            {notifPerm === "granted" ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#22c55e" }}>
                <BellRing size={13} /> Notificações ativadas
              </span>
            ) : (
              <button onClick={pedirPermissaoNotificacao}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 16px", borderRadius: 999,
                  background: "#fff", border: "1.5px solid #e2e8f0",
                  fontSize: 12, fontWeight: 700, color: "#0f172a", cursor: "pointer",
                }}>
                <Bell size={13} style={{ color: cor }} />
                Avisar quando o pedido mudar de status
              </button>
            )}
          </div>
        )}

        {/* Link meus pedidos */}
        <Link href="/meus-pedidos"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "14px", borderRadius: 16, background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", textDecoration: "none", color: "#64748b", fontSize: 14, fontWeight: 600 }}>
          <Package size={15} />
          Ver meus pedidos
          <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
