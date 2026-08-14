"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Maximize2, Minimize2, Tv, ChefHat, Bell } from "lucide-react";
import type { PedidoStatus } from "@/types";

type Modo = "ambos" | "cozinha" | "salao";

interface PedidoMonitor {
  id: string;
  empresa_id: string;
  cliente_nome: string;
  tipo_pedido: "entrega" | "retirada";
  status: PedidoStatus;
  created_at: string;
  updated_at: string;
}

const PREPARANDO: PedidoStatus[] = ["em_fila", "em_preparo"];
const PRONTO: PedidoStatus[]     = ["finalizado"];
const HIDE_AFTER_MS = 8 * 60 * 1000;

function formatNome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[1].charAt(0).toUpperCase()}.`;
}

function padNum(n: number): string {
  return String(n).padStart(3, "0");
}

function playDing() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    function note(freq: number, start: number, dur: number) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    }
    note(880,  0,    0.18);
    note(1320, 0.22, 0.30);
  } catch { /* sem audio */ }
}

export default function MonitorClient({
  initialPedidos,
  empresaId,
  empresaNome,
  modo,
}: {
  initialPedidos: PedidoMonitor[];
  empresaId: string;
  empresaNome: string;
  modo: Modo;
}) {
  const supabase     = createClient();
  const containerRef = useRef<HTMLDivElement>(null);

  const [pedidos,      setPedidos]      = useState<PedidoMonitor[]>(initialPedidos);
  const [tv,           setTv]           = useState(false);
  const [fullscreen,   setFullscreen]   = useState(false);
  const [now,          setNow]          = useState(new Date());
  const [novosProntos, setNovosProntos] = useState<Set<string>>(new Set());
  const prevProntosRef = useRef<Set<string>>(new Set());

  // Relógio
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Detecta novos PRONTO → ding + animação
  useEffect(() => {
    const atual = new Set(pedidos.filter(p => PRONTO.includes(p.status)).map(p => p.id));
    const novos = [...atual].filter(id => !prevProntosRef.current.has(id));
    if (novos.length > 0) {
      playDing();
      setNovosProntos(prev => new Set([...prev, ...novos]));
      setTimeout(() => {
        setNovosProntos(prev => {
          const next = new Set(prev);
          novos.forEach(id => next.delete(id));
          return next;
        });
      }, 4000);
    }
    prevProntosRef.current = atual;
  }, [pedidos]);

  // Numeração da fila: posição no dia ordenada por created_at
  const queueMap = new Map<string, number>();
  [...pedidos]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .forEach((p, i) => queueMap.set(p.id, i + 1));

  const reload = useCallback(async () => {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("pedidos")
      .select("id, empresa_id, cliente_nome, tipo_pedido, status, created_at, updated_at")
      .eq("empresa_id", empresaId)
      .gte("created_at", inicio.toISOString())
      .order("created_at", { ascending: true });
    if (data) setPedidos(data as PedidoMonitor[]);
  }, [supabase, empresaId]);

  useEffect(() => {
    const id = setInterval(reload, 60_000);
    return () => clearInterval(id);
  }, [reload]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`monitor-ff-${empresaId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "pedidos",
        filter: `empresa_id=eq.${empresaId}`,
      }, (payload) => {
        if (payload.eventType === "DELETE") {
          setPedidos(prev => prev.filter(p => p.id !== (payload.old as PedidoMonitor).id));
          return;
        }
        const novo = payload.new as PedidoMonitor;
        const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
        if (new Date(novo.created_at) < inicio) return;
        setPedidos(prev => {
          const sem = prev.filter(p => p.id !== novo.id);
          return [...sem, novo].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  // Fullscreen API
  useEffect(() => {
    function onChange() { setFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleTv() {
    if (!tv) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setTv(true);
    } else {
      if (document.fullscreenElement) document.exitFullscreen?.();
      setTv(false);
    }
  }

  const sz = {
    num:     tv ? 72  : 42,
    nome:    tv ? 20  : 14,
    badge:   tv ? 12  : 9,
    titulo:  tv ? 30  : 18,
    clock:   tv ? 38  : 20,
    empresa: tv ? 24  : 15,
  };

  const preparando = pedidos.filter(p => PREPARANDO.includes(p.status));
  const prontos    = pedidos.filter(p =>
    PRONTO.includes(p.status) &&
    (now.getTime() - new Date(p.updated_at).getTime()) < HIDE_AFTER_MS
  );

  const conteudo = (
    <div
      ref={containerRef}
      style={{
        background: "#050505",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Courier New', Courier, monospace",
        overflow: "hidden",
      }}
    >
      {/* ── Top bar ──────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: tv ? "18px 32px" : "12px 20px",
        borderBottom: "1px solid #111",
        background: "#0a0a0a",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width:        tv ? 44 : 30,
            height:       tv ? 44 : 30,
            borderRadius: tv ? 12 : 8,
            background:   "linear-gradient(135deg,#FF6A00,#cc5500)",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
            boxShadow:    "0 0 20px rgba(204,85,0,0.5)",
            flexShrink:   0,
          }}>
            <Tv size={tv ? 22 : 15} color="#fff" />
          </div>
          <span style={{
            fontSize:      sz.empresa,
            fontWeight:    900,
            color:         "#fff",
            letterSpacing: "-0.02em",
            fontFamily:    "system-ui, sans-serif",
          }}>
            {empresaNome || "Monitor"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: tv ? 24 : 12 }}>
          {!tv && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: 3, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {([
                { key: "ambos" as Modo,   label: "Ambos",   icon: null },
                { key: "cozinha" as Modo, label: "Cozinha", icon: ChefHat },
                { key: "salao" as Modo,   label: "Salão",   icon: Bell },
              ]).map(({ key, label, icon: Icon }) => (
                <Link
                  key={key}
                  href={key === "ambos" ? "/monitor" : `/monitor?modo=${key}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 12px", borderRadius: 8,
                    background: modo === key ? "rgba(255,106,0,0.15)" : "transparent",
                    color: modo === key ? "#FF6A00" : "#64748b",
                    fontSize: 11, fontWeight: 700,
                    textDecoration: "none",
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {Icon && <Icon size={11} />}
                  {label}
                </Link>
              ))}
            </div>
          )}
          <span style={{
            fontSize:      sz.clock,
            fontWeight:    900,
            color:         "#fff",
            letterSpacing: "-0.04em",
          }}>
            {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            onClick={toggleTv}
            style={{
              display:        "flex",
              alignItems:     "center",
              gap:            6,
              padding:        tv ? "10px 16px" : "6px 12px",
              borderRadius:   10,
              background:     tv ? "rgba(255,106,0,0.12)" : "rgba(255,255,255,0.04)",
              border:         `1px solid ${tv ? "rgba(255,106,0,0.3)" : "rgba(255,255,255,0.08)"}`,
              color:          tv ? "#FF6A00" : "#64748b",
              fontSize:       tv ? 13 : 11,
              fontWeight:     700,
              cursor:         "pointer",
              fontFamily:     "system-ui, sans-serif",
            }}
          >
            {fullscreen ? <Minimize2 size={tv ? 14 : 11} /> : <Maximize2 size={tv ? 14 : 11} />}
            {tv ? "Sair" : "Modo TV"}
          </button>
        </div>
      </div>

      {/* ── Colunas ──────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

        {/* ESQUERDA: PREPARANDO — some no modo "salao" */}
        {modo !== "salao" && <div style={{
          flex:           1,
          display:        "flex",
          flexDirection:  "column",
          borderRight:    modo === "ambos" ? "1px solid #111" : "none",
          overflow:       "hidden",
        }}>
          <div style={{
            padding:      tv ? "18px 28px" : "12px 18px",
            background:   "rgba(251,191,36,0.05)",
            borderBottom: "2px solid rgba(251,191,36,0.18)",
            display:      "flex",
            alignItems:   "center",
            gap:          12,
            flexShrink:   0,
          }}>
            <span style={{
              width:       tv ? 14 : 10,
              height:      tv ? 14 : 10,
              borderRadius: "50%",
              background:  "#fbbf24",
              boxShadow:   "0 0 14px #fbbf24",
              display:     "inline-block",
              flexShrink:  0,
            }} />
            <span style={{
              fontSize:       sz.titulo,
              fontWeight:     900,
              color:          "#fbbf24",
              letterSpacing:  "0.08em",
              textTransform:  "uppercase",
              fontFamily:     "system-ui, sans-serif",
            }}>
              Preparando
            </span>
            <span style={{
              marginLeft:   "auto",
              background:   "rgba(251,191,36,0.14)",
              color:        "#fbbf24",
              border:       "1px solid rgba(251,191,36,0.28)",
              borderRadius: 8,
              padding:      tv ? "4px 14px" : "2px 10px",
              fontSize:     tv ? 20 : 13,
              fontWeight:   900,
              fontFamily:   "system-ui, sans-serif",
            }}>
              {preparando.length}
            </span>
          </div>

          <div style={{
            flex:          1,
            overflowY:     "auto",
            padding:       tv ? "16px 20px" : "10px 14px",
            display:       "flex",
            flexDirection: "column",
            gap:           tv ? 12 : 8,
          }}>
            {preparando.length === 0 ? (
              <div style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                height:         "100%",
                color:          "#1f1f1f",
                fontSize:       tv ? 17 : 12,
                fontFamily:     "system-ui, sans-serif",
                fontWeight:     600,
              }}>
                Nenhum pedido em preparo
              </div>
            ) : preparando.map(p => {
              const num      = queueMap.get(p.id) ?? 0;
              const emFila   = p.status === "em_fila";
              return (
                <div
                  key={p.id}
                  style={{
                    display:    "flex",
                    alignItems: "center",
                    gap:        tv ? 18 : 12,
                    padding:    tv ? "16px 20px" : "10px 14px",
                    borderRadius: tv ? 16 : 12,
                    background: emFila
                      ? "rgba(251,191,36,0.03)"
                      : "rgba(251,191,36,0.09)",
                    border:     emFila
                      ? "1px solid rgba(251,191,36,0.10)"
                      : "1px solid rgba(251,191,36,0.25)",
                  }}
                >
                  <span style={{
                    fontSize:      sz.num,
                    fontWeight:    900,
                    color:         emFila ? "#3d3000" : "#fbbf24",
                    lineHeight:    1,
                    minWidth:      tv ? 96 : 58,
                    letterSpacing: "-0.04em",
                    flexShrink:    0,
                  }}>
                    {padNum(num)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize:      sz.nome,
                      fontWeight:    800,
                      color:         emFila ? "#6b6b6b" : "#fff",
                      overflow:      "hidden",
                      textOverflow:  "ellipsis",
                      whiteSpace:    "nowrap",
                      fontFamily:    "system-ui, sans-serif",
                      marginBottom:  4,
                    }}>
                      {formatNome(p.cliente_nome)}
                    </p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={{
                        fontSize:     sz.badge,
                        fontWeight:   700,
                        padding:      "2px 8px",
                        borderRadius: 6,
                        background:   emFila ? "rgba(100,116,139,0.10)" : "rgba(251,191,36,0.14)",
                        color:        emFila ? "#4b5563"                 : "#fbbf24",
                        border:       emFila ? "1px solid rgba(100,116,139,0.18)" : "1px solid rgba(251,191,36,0.28)",
                        fontFamily:   "system-ui, sans-serif",
                      }}>
                        {emFila ? "Na fila" : "Em preparo"}
                      </span>
                      <span style={{
                        fontSize:     sz.badge,
                        fontWeight:   700,
                        padding:      "2px 8px",
                        borderRadius: 6,
                        background:   p.tipo_pedido === "retirada" ? "rgba(167,139,250,0.09)" : "rgba(249,115,22,0.09)",
                        color:        p.tipo_pedido === "retirada" ? "#a78bfa"                 : "#fb923c",
                        border:       `1px solid ${p.tipo_pedido === "retirada" ? "rgba(167,139,250,0.22)" : "rgba(249,115,22,0.22)"}`,
                        fontFamily:   "system-ui, sans-serif",
                      }}>
                        {p.tipo_pedido === "retirada" ? "Retirada" : "Delivery"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>}

        {/* DIREITA: PRONTO — some no modo "cozinha" */}
        {modo !== "cozinha" && <div style={{
          flex:          1,
          display:       "flex",
          flexDirection: "column",
          overflow:      "hidden",
        }}>
          <div style={{
            padding:      tv ? "18px 28px" : "12px 18px",
            background:   "rgba(52,211,153,0.05)",
            borderBottom: "2px solid rgba(52,211,153,0.18)",
            display:      "flex",
            alignItems:   "center",
            gap:          12,
            flexShrink:   0,
          }}>
            <span style={{
              width:        tv ? 14 : 10,
              height:       tv ? 14 : 10,
              borderRadius: "50%",
              background:   "#34d399",
              boxShadow:    "0 0 14px #34d399",
              display:      "inline-block",
              flexShrink:   0,
            }} />
            <span style={{
              fontSize:      sz.titulo,
              fontWeight:    900,
              color:         "#34d399",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontFamily:    "system-ui, sans-serif",
            }}>
              Pronto
            </span>
            <span style={{
              marginLeft:   "auto",
              background:   "rgba(52,211,153,0.14)",
              color:        "#34d399",
              border:       "1px solid rgba(52,211,153,0.28)",
              borderRadius: 8,
              padding:      tv ? "4px 14px" : "2px 10px",
              fontSize:     tv ? 20 : 13,
              fontWeight:   900,
              fontFamily:   "system-ui, sans-serif",
            }}>
              {prontos.length}
            </span>
          </div>

          <div style={{
            flex:          1,
            overflowY:     "auto",
            padding:       tv ? "16px 20px" : "10px 14px",
            display:       "flex",
            flexDirection: "column",
            gap:           tv ? 12 : 8,
          }}>
            {prontos.length === 0 ? (
              <div style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                height:         "100%",
                color:          "#1f1f1f",
                fontSize:       tv ? 17 : 12,
                fontFamily:     "system-ui, sans-serif",
                fontWeight:     600,
              }}>
                Nenhum pedido pronto
              </div>
            ) : prontos.map(p => {
              const num    = queueMap.get(p.id) ?? 0;
              const isNovo = novosProntos.has(p.id);
              return (
                <div
                  key={p.id}
                  style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          tv ? 18 : 12,
                    padding:      tv ? "16px 20px" : "10px 14px",
                    borderRadius: tv ? 16 : 12,
                    background:   "rgba(52,211,153,0.09)",
                    border:       "1px solid rgba(52,211,153,0.25)",
                    animation:    isNovo ? "pronto-highlight 1s ease-in-out 0s 4" : undefined,
                  }}
                >
                  <span style={{
                    fontSize:      sz.num,
                    fontWeight:    900,
                    color:         "#34d399",
                    lineHeight:    1,
                    minWidth:      tv ? 96 : 58,
                    letterSpacing: "-0.04em",
                    flexShrink:    0,
                    textShadow:    isNovo ? "0 0 24px rgba(52,211,153,0.7)" : undefined,
                  }}>
                    {padNum(num)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize:     sz.nome,
                      fontWeight:   800,
                      color:        "#fff",
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace:   "nowrap",
                      fontFamily:   "system-ui, sans-serif",
                      marginBottom: 4,
                    }}>
                      {formatNome(p.cliente_nome)}
                    </p>
                    <span style={{
                      fontSize:     sz.badge,
                      fontWeight:   700,
                      padding:      "2px 8px",
                      borderRadius: 6,
                      background:   "rgba(52,211,153,0.14)",
                      color:        "#34d399",
                      border:       "1px solid rgba(52,211,153,0.28)",
                      fontFamily:   "system-ui, sans-serif",
                    }}>
                      {p.tipo_pedido === "retirada" ? "Retirar aqui" : "Pronto p/ entrega"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>}
      </div>
    </div>
  );

  if (tv) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, overflow: "hidden" }}>
        {conteudo}
      </div>
    );
  }

  return <div style={{ height: "100%", overflow: "hidden" }}>{conteudo}</div>;
}
