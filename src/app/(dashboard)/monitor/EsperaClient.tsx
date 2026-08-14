"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Maximize2, Minimize2, ArrowLeft } from "lucide-react";
import type { PedidoMonitor } from "./types";

const HIDE_PRONTO_MS = 12 * 60 * 1000;

function padNum(n: number) { return String(n).padStart(3, "0"); }
function firstName(nome: string) { return nome.trim().split(/\s+/)[0]; }
function formatTimer(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
}

function playReady() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    [[523,.0,.12],[659,.15,.12],[784,.30,.12],[1047,.45,.30]].forEach(([f,s,d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0, ctx.currentTime+s);
      g.gain.linearRampToValueAtTime(0.4, ctx.currentTime+s+.02);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime+s+d);
      o.start(ctx.currentTime+s); o.stop(ctx.currentTime+s+d);
    });
  } catch { /* sem áudio */ }
}

export default function EsperaClient({ initialPedidos, empresaId, empresaNome, onBack }: {
  initialPedidos: PedidoMonitor[];
  empresaId: string;
  empresaNome: string;
  onBack: () => void;
}) {
  const supabase     = createClient();
  const containerRef = useRef<HTMLDivElement>(null);

  const [pedidos,    setPedidos]    = useState<PedidoMonitor[]>(initialPedidos);
  const [now,        setNow]        = useState(new Date());
  const [fullscreen, setFullscreen] = useState(false);
  const [tv,         setTv]         = useState(false);
  const [flashing,   setFlashing]   = useState<Set<string>>(new Set());
  const prevProntos  = useRef<Set<string>>(new Set());

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);

  // Detecta novos prontos → som + flash
  useEffect(() => {
    const prontos = new Set(pedidos.filter(p => p.status === "finalizado").map(p => p.id));
    const novos   = [...prontos].filter(id => !prevProntos.current.has(id));
    if (novos.length) {
      playReady();
      setFlashing(prev => new Set([...prev, ...novos]));
      setTimeout(() => setFlashing(prev => { const n = new Set(prev); novos.forEach(id => n.delete(id)); return n; }), 4000);
    }
    prevProntos.current = prontos;
  }, [pedidos]);

  const reload = useCallback(async () => {
    const d = new Date(); d.setHours(0,0,0,0);
    const { data } = await supabase.from("pedidos")
      .select("id,empresa_id,cliente_nome,cliente_telefone,tipo_pedido,descricao_itens,observacoes,endereco_entrega,bairro,forma_pagamento,valor_pedido,valor_motoboy,troco_para,status,created_at,updated_at")
      .eq("empresa_id", empresaId).gte("created_at", d.toISOString()).order("created_at", {ascending:true});
    if (data) setPedidos(data as PedidoMonitor[]);
  }, [supabase, empresaId]);

  useEffect(() => { const id = setInterval(reload, 60_000); return () => clearInterval(id); }, [reload]);

  useEffect(() => {
    const ch = supabase.channel(`espera-${empresaId}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"pedidos", filter:`empresa_id=eq.${empresaId}` }, (payload) => {
        if (payload.eventType === "DELETE") { setPedidos(prev => prev.filter(p => p.id !== (payload.old as PedidoMonitor).id)); return; }
        const novo = payload.new as PedidoMonitor;
        const d = new Date(); d.setHours(0,0,0,0);
        if (new Date(novo.created_at) < d) return;
        setPedidos(prev => [...prev.filter(p => p.id !== novo.id), novo].sort((a,b) => new Date(a.created_at).getTime()-new Date(b.created_at).getTime()));
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    function onChange() { setFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleTv() {
    if (!tv) { containerRef.current?.requestFullscreen?.().catch(() => {}); setTv(true); }
    else { if (document.fullscreenElement) document.exitFullscreen?.(); setTv(false); }
  }

  const queueMap = new Map<string, number>();
  [...pedidos].sort((a,b) => new Date(a.created_at).getTime()-new Date(b.created_at).getTime())
    .forEach((p,i) => queueMap.set(p.id, i+1));

  const emPreparo = pedidos.filter(p => p.status === "em_fila" || p.status === "em_preparo");
  const prontos   = pedidos.filter(p =>
    p.status === "finalizado" &&
    (now.getTime() - new Date(p.updated_at).getTime()) < HIDE_PRONTO_MS
  );

  // Tamanhos responsivos
  const numSize   = tv ? 96 : 64;
  const nameSize  = tv ? 22 : 15;
  const labelSize = tv ? 12 : 9;

  const ui = (
    <div
      ref={containerRef}
      style={{
        height:        "100%",
        display:       "flex",
        flexDirection: "column",
        overflow:      "hidden",
        background:    "#0a0a0a",
        fontFamily:    "'Arial Black', 'Arial Bold', system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes esp-glow {
          0%,100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
          50%      { box-shadow: 0 0 40px 8px rgba(52,211,153,0.35); }
        }
        @keyframes esp-slide-in {
          from { opacity: 0; transform: translateY(18px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes esp-pulse-num {
          0%,100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
        }
        @keyframes dot-blink { 0%,100%{opacity:1} 50%{opacity:.25} }
        .esp-card-pronto { animation: esp-slide-in 0.4s cubic-bezier(.22,1,.36,1) both; }
        .esp-card-pronto.novo { animation: esp-slide-in 0.4s cubic-bezier(.22,1,.36,1) both, esp-glow 1.2s ease-in-out 3; }
        .esp-num-novo { animation: esp-pulse-num 0.7s ease-in-out 4; }
      `}</style>

      {/* ── Top bar ── */}
      <div style={{
        background:    "linear-gradient(90deg, #1a0000 0%, #DA291C 40%, #DA291C 60%, #1a0000 100%)",
        height:        tv ? 68 : 50,
        display:       "flex", alignItems: "center", justifyContent: "space-between",
        padding:       tv ? "0 32px" : "0 16px",
        flexShrink:    0,
        borderBottom:  "3px solid #FFC72C",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {!tv && (
            <button onClick={onBack} style={{
              background: "rgba(0,0,0,0.3)", border: "none", borderRadius: 7,
              padding: "4px 8px", cursor: "pointer", color: "#fff",
              display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
            }}>
              <ArrowLeft size={12} /> Trocar
            </button>
          )}
          {/* "M" estilizado como McDonald's */}
          <div style={{
            width: tv ? 44 : 32, height: tv ? 44 : 32,
            borderRadius: "50%", background: "#FFC72C",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: tv ? 22 : 16, fontWeight: 900, color: "#DA291C",
            flexShrink: 0, letterSpacing: "-0.04em",
          }}>
            {(empresaNome || "V")[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: tv ? 24 : 16, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              {empresaNome || "Vellox"}
            </div>
            <div style={{ fontSize: tv ? 11 : 8, color: "#FFC72C", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Acompanhe seu pedido
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: tv ? 20 : 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: tv ? 36 : 24, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em", lineHeight: 1 }}>
              {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div style={{ fontSize: tv ? 11 : 8, color: "rgba(255,255,255,0.55)", fontWeight: 700, letterSpacing: "0.06em" }}>
              {now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase()}
            </div>
          </div>
          <button onClick={toggleTv} style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: tv ? "6px 14px" : "4px 10px", borderRadius: 8,
            background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,.2)",
            color: "#fff", fontSize: tv ? 11 : 9, fontWeight: 800, cursor: "pointer",
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            {fullscreen ? <Minimize2 size={tv?12:10}/> : <Maximize2 size={tv?12:10}/>}
            {tv ? "Sair" : "TV"}
          </button>
        </div>
      </div>

      {/* ── Corpo: duas colunas ── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, gap: "2px", background: "#000" }}>

        {/* EM PREPARO */}
        <div style={{
          flex: "1 1 55%", display: "flex", flexDirection: "column",
          background: "#0d0d0d", overflow: "hidden",
        }}>
          {/* Cabeçalho da coluna */}
          <div style={{
            padding: tv ? "18px 24px 14px" : "12px 16px 10px",
            borderBottom: "2px solid rgba(251,191,36,0.20)",
            background: "rgba(251,191,36,0.04)",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                width: tv ? 12 : 9, height: tv ? 12 : 9, borderRadius: "50%",
                background: "#fbbf24", boxShadow: "0 0 12px #fbbf24",
                display: "inline-block",
                animation: emPreparo.length > 0 ? "dot-blink 2s ease-in-out infinite" : undefined,
              }} />
              <span style={{
                fontSize: tv ? 15 : 11, fontWeight: 900, color: "#fbbf24",
                letterSpacing: "0.12em", textTransform: "uppercase",
              }}>
                Em Preparo
              </span>
              <span style={{
                marginLeft: "auto",
                background: "rgba(251,191,36,0.14)", color: "#fbbf24",
                border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8,
                padding: tv ? "4px 14px" : "2px 10px",
                fontSize: tv ? 20 : 14, fontWeight: 900, minWidth: 36, textAlign: "center" as const,
              }}>
                {emPreparo.length}
              </span>
            </div>
          </div>

          {/* Grid de cards */}
          <div style={{
            flex: 1, overflowY: "auto",
            padding: tv ? "16px" : "10px",
            display: "grid",
            gridTemplateColumns: tv ? "repeat(auto-fill, minmax(180px, 1fr))" : "repeat(auto-fill, minmax(130px, 1fr))",
            gridAutoRows: "max-content",
            gap: tv ? 12 : 8,
            alignContent: "start",
          }}>
            {emPreparo.length === 0 ? (
              <div style={{
                gridColumn: "1/-1", display: "flex", alignItems: "center", justifyContent: "center",
                minHeight: tv ? 200 : 140, fontSize: tv ? 15 : 11, fontWeight: 700,
                color: "#1f2937", letterSpacing: "0.08em", textTransform: "uppercase" as const,
              }}>
                Nenhum pedido em preparo
              </div>
            ) : emPreparo.map(p => {
              const num = queueMap.get(p.id) ?? 0;
              const ms  = now.getTime() - new Date(p.created_at).getTime();
              return (
                <div key={p.id} style={{
                  background: "#141414",
                  border: "2px solid rgba(251,191,36,0.18)",
                  borderRadius: tv ? 16 : 12,
                  padding: tv ? "18px 16px" : "12px 10px",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: tv ? 8 : 5,
                  transition: "border-color 0.4s",
                }}>
                  <div style={{
                    fontSize: numSize, fontWeight: 900, color: "#fbbf24",
                    lineHeight: 1, letterSpacing: "-0.05em",
                    textShadow: "0 0 20px rgba(251,191,36,0.4)",
                  }}>
                    {padNum(num)}
                  </div>
                  <div style={{
                    fontSize: nameSize, fontWeight: 900, color: "#fff",
                    textAlign: "center", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                    maxWidth: "100%",
                  }}>
                    {firstName(p.cliente_nome)}
                  </div>
                  <div style={{
                    fontSize: labelSize, fontWeight: 800, color: "#fbbf24",
                    opacity: 0.65, letterSpacing: "0.06em",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {formatTimer(ms)}
                  </div>
                  <div style={{
                    fontSize: labelSize, fontWeight: 800,
                    color: p.tipo_pedido === "entrega" ? "#fb923c" : "#a78bfa",
                    background: p.tipo_pedido === "entrega" ? "rgba(251,115,0,0.14)" : "rgba(139,92,246,0.14)",
                    borderRadius: 4, padding: "2px 8px",
                    textTransform: "uppercase" as const, letterSpacing: "0.08em",
                  }}>
                    {p.tipo_pedido === "entrega" ? "Delivery" : "Retirada"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PRONTO */}
        <div style={{
          flex: "0 0 45%", display: "flex", flexDirection: "column",
          background: "#0a120e", overflow: "hidden",
        }}>
          {/* Cabeçalho */}
          <div style={{
            padding: tv ? "18px 24px 14px" : "12px 16px 10px",
            borderBottom: "2px solid rgba(52,211,153,0.25)",
            background: "rgba(52,211,153,0.05)",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                width: tv ? 12 : 9, height: tv ? 12 : 9, borderRadius: "50%",
                background: "#34d399", boxShadow: "0 0 14px #34d399",
                display: "inline-block",
              }} />
              <span style={{
                fontSize: tv ? 15 : 11, fontWeight: 900, color: "#34d399",
                letterSpacing: "0.12em", textTransform: "uppercase",
              }}>
                ✓ Pronto para Retirar
              </span>
              <span style={{
                marginLeft: "auto",
                background: "rgba(52,211,153,0.14)", color: "#34d399",
                border: "1px solid rgba(52,211,153,0.3)", borderRadius: 8,
                padding: tv ? "4px 14px" : "2px 10px",
                fontSize: tv ? 20 : 14, fontWeight: 900, minWidth: 36, textAlign: "center" as const,
              }}>
                {prontos.length}
              </span>
            </div>
          </div>

          {/* Lista de prontos */}
          <div style={{
            flex: 1, overflowY: "auto",
            padding: tv ? "14px" : "8px",
            display: "flex", flexDirection: "column", gap: tv ? 10 : 7,
          }}>
            {prontos.length === 0 ? (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                flex: 1, minHeight: tv ? 200 : 140,
                fontSize: tv ? 15 : 11, fontWeight: 700, color: "#14532d",
                letterSpacing: "0.08em", textTransform: "uppercase" as const,
              }}>
                Aguardando pedidos prontos
              </div>
            ) : prontos.map(p => {
              const num    = queueMap.get(p.id) ?? 0;
              const isNovo = flashing.has(p.id);
              const msSR   = now.getTime() - new Date(p.updated_at).getTime();
              const isLate = msSR > 5 * 60000;
              return (
                <div
                  key={p.id}
                  className={`esp-card-pronto${isNovo ? " novo" : ""}`}
                  style={{
                    background:   isNovo ? "rgba(52,211,153,0.12)" : "rgba(52,211,153,0.06)",
                    border:       `2px solid ${isNovo ? "#34d399" : isLate ? "rgba(248,113,113,0.45)" : "rgba(52,211,153,0.28)"}`,
                    borderRadius: tv ? 18 : 12,
                    padding:      tv ? "18px 22px" : "12px 14px",
                    display:      "flex", alignItems: "center", gap: tv ? 18 : 12,
                    transition:   "border-color 0.5s",
                  }}
                >
                  {/* Número grande */}
                  <div style={{
                    fontSize:    tv ? 80 : 56,
                    fontWeight:  900,
                    color:       isNovo ? "#34d399" : isLate ? "#f87171" : "#34d399",
                    lineHeight:  1,
                    letterSpacing: "-0.06em",
                    textShadow:  isNovo ? "0 0 30px rgba(52,211,153,0.7)" : "none",
                    flexShrink:  0,
                  }}
                    className={isNovo ? "esp-num-novo" : undefined}
                  >
                    {padNum(num)}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize:     tv ? 26 : 18,
                      fontWeight:   900,
                      color:        "#fff",
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace:   "nowrap" as const,
                      letterSpacing: "-0.02em",
                      marginBottom:  tv ? 6 : 4,
                    }}>
                      {firstName(p.cliente_nome)}
                    </div>

                    {/* Status */}
                    <div style={{
                      fontSize:      tv ? 13 : 10,
                      fontWeight:    800,
                      color:         p.tipo_pedido === "entrega" ? "#fb923c" : "#34d399",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.08em",
                      marginBottom:  tv ? 6 : 4,
                    }}>
                      {p.tipo_pedido === "entrega" ? "⚡ Saiu para entrega" : "🏃 Retire no balcão"}
                    </div>

                    {/* Tempo pronto */}
                    <div style={{
                      fontSize:  tv ? 12 : 9,
                      fontWeight: 700,
                      color:     isLate ? "#f87171" : "rgba(52,211,153,0.55)",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {isLate ? "⚠ " : ""}Pronto há {formatTimer(msSR)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rodapé com mensagem de cortesia */}
          <div style={{
            padding:    tv ? "14px 24px" : "10px 16px",
            borderTop:  "1px solid rgba(52,211,153,0.12)",
            textAlign:  "center",
            background: "rgba(0,0,0,0.3)",
            flexShrink: 0,
          }}>
            <div style={{
              fontSize:      tv ? 13 : 10,
              fontWeight:    700,
              color:         "rgba(255,255,255,0.25)",
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
            }}>
              Obrigado por escolher {empresaNome || "nosso estabelecimento"} 🙏
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (tv) return <div style={{ position: "fixed", inset: 0, zIndex: 9999, overflow: "hidden" }}>{ui}</div>;
  return <div style={{ height: "100%", overflow: "hidden" }}>{ui}</div>;
}
