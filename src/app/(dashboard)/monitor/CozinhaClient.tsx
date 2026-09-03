"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Maximize2, Minimize2, ArrowLeft } from "lucide-react";
import type { PedidoStatus } from "@/types";
import type { PedidoMonitor } from "./types";
import { PGTO_LABELS } from "./types";

const HIDE_PRONTO_MS = 10 * 60 * 1000;

function padNum(n: number) { return String(n).padStart(3, "0"); }
function formatTimer(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function firstName(nome: string) {
  return nome.trim().split(/\s+/)[0].toUpperCase();
}

// ── Parser de descricao_itens ─────────────────────────────────────────────────
// Formato: "2x Pizza Grande (Grande · Mussarela/Frango · + Borda) — R$45,00"
interface ParsedItem {
  qty: number;
  nome: string;
  variacao: string | null;   // ex: "Grande", "500ml"
  sabores: string[];         // ex: ["Mussarela", "Frango"]
  adicionais: string[];      // ex: ["Borda de Cheddar"]
  preco: string;             // ex: "45,00"
}

function parseItens(descricao: string | null): ParsedItem[] {
  if (!descricao?.trim()) return [];
  return descricao.split("\n").flatMap(line => {
    line = line.trim();
    if (!line) return [];

    // "Nx Nome (desc) — R$00,00" ou "Nx Nome — R$00,00"
    const m = line.match(/^(\d+)x\s+(.+?)\s+—\s+R\$([\d.,]+)$/);
    if (!m) return [{ qty: 1, nome: line, variacao: null, sabores: [], adicionais: [], preco: "" }];

    const qty   = parseInt(m[1]);
    const preco = m[3];
    const rest  = m[2].trim();

    // Tem parênteses com desc?
    const dm = rest.match(/^(.+?)\s+\((.+)\)$/);
    if (!dm) return [{ qty, nome: rest, variacao: null, sabores: [], adicionais: [], preco }];

    const nome  = dm[1].trim();
    const parts = dm[2].split(" · ");
    let variacao: string | null = null;
    let sabores: string[]       = [];
    let adicionais: string[]    = [];

    for (const part of parts) {
      const p = part.trim();
      if (p.startsWith("+ ")) {
        adicionais = p.slice(2).split(",").map(a => a.trim()).filter(Boolean);
      } else if (p.includes("/")) {
        sabores = p.split("/").map(s => s.trim()).filter(Boolean);
      } else if (p) {
        variacao = p;
      }
    }

    return [{ qty, nome, variacao, sabores, adicionais, preco }];
  });
}

type Urgency = "fresh" | "warm" | "hot" | "critical";
function urgency(ms: number): Urgency {
  const m = ms / 60000;
  if (m < 5)  return "fresh";
  if (m < 10) return "warm";
  if (m < 18) return "hot";
  return "critical";
}
const U: Record<Urgency, { hdr: string; bdr: string; time: string; num: string }> = {
  fresh:    { hdr: "#14532d", bdr: "#16a34a", time: "#4ade80", num: "#86efac" },
  warm:     { hdr: "#713f12", bdr: "#d97706", time: "#fbbf24", num: "#fde68a" },
  hot:      { hdr: "#5C0015", bdr: "#A80021", time: "#fb923c", num: "#fdba74" },
  critical: { hdr: "#7f1d1d", bdr: "#dc2626", time: "#f87171", num: "#fca5a5" },
};

function playDing() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    [[880,0,.15],[1109,.18,.15],[1318,.36,.28]].forEach(([f,s,d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0, ctx.currentTime+s);
      g.gain.linearRampToValueAtTime(0.35, ctx.currentTime+s+.01);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime+s+d);
      o.start(ctx.currentTime+s); o.stop(ctx.currentTime+s+d);
    });
  } catch { /* sem áudio */ }
}

// ── Card de cozinha detalhado ─────────────────────────────────────────────────
function Card({ p, num, now, tv, onBump, bumping, flash, bumpLabel, bumpColor }: {
  p: PedidoMonitor; num: number; now: Date; tv: boolean;
  onBump: () => void; bumping: boolean; flash: boolean;
  bumpLabel: string; bumpColor: string;
}) {
  const ms    = now.getTime() - new Date(p.created_at).getTime();
  const u     = U[urgency(ms)];
  const items = parseItens(p.descricao_itens);
  const total = (p.valor_pedido ?? 0) + (p.valor_motoboy ?? 0);
  const pgto  = PGTO_LABELS[p.forma_pagamento ?? ""] ?? p.forma_pagamento ?? "—";

  return (
    <div className="kds-card" style={{
      border:        `2px solid ${flash ? "#fff" : u.bdr}`,
      borderRadius:  tv ? 16 : 12,
      display:       "flex", flexDirection: "column", overflow: "hidden",
      animation:     flash ? "kds-flash 0.6s ease-in-out 5" : undefined,
      transition:    "border-color 0.5s",
    }}>

      {/* Header com número e timer */}
      <div style={{
        background: u.hdr, padding: tv ? "10px 14px" : "8px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
      }}>
        <span style={{
          fontSize: tv ? 60 : 44, fontWeight: 900, color: u.num,
          lineHeight: 1, letterSpacing: "-0.05em",
          fontFamily: "'Arial Black', system-ui, sans-serif",
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}>
          {padNum(num)}
        </span>
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontSize: tv ? 22 : 16, fontWeight: 900, color: u.time,
            fontVariantNumeric: "tabular-nums",
            fontFamily: "'Arial Black', system-ui, sans-serif", lineHeight: 1,
          }}>
            {formatTimer(ms)}
          </div>
          <div style={{
            marginTop: 4, fontSize: tv ? 11 : 9, fontWeight: 800,
            color: p.tipo_pedido === "entrega" ? "#fb923c" : "#a78bfa",
            background: p.tipo_pedido === "entrega" ? "rgba(251,115,0,0.25)" : "rgba(139,92,246,0.25)",
            borderRadius: 4, padding: "2px 7px", display: "inline-block",
            textTransform: "uppercase" as const, letterSpacing: "0.08em",
          }}>
            {p.tipo_pedido === "entrega" ? "⚡ Delivery" : "🏃 Retirada"}
          </div>
        </div>
      </div>

      {/* Dados do cliente */}
      <div style={{
        padding: tv ? "10px 14px 6px" : "7px 12px 4px",
        borderBottom: "1px solid var(--border-1)",
      }}>
        <div style={{
          fontSize: tv ? 18 : 14, fontWeight: 900, color: "var(--text-1)",
          letterSpacing: "-0.01em", marginBottom: 2,
        }}>
          {p.cliente_nome}
        </div>
        {p.cliente_telefone && (
          <div style={{ fontSize: tv ? 12 : 10, color: "var(--text-3)", fontWeight: 600 }}>
            📞 {p.cliente_telefone}
          </div>
        )}
        {p.tipo_pedido === "entrega" && (p.endereco_entrega || p.bairro) && (
          <div style={{
            marginTop: 3, fontSize: tv ? 12 : 10, color: "var(--text-2)",
            fontWeight: 700, lineHeight: 1.4,
          }}>
            📍 {[p.endereco_entrega, p.bairro].filter(Boolean).join(", ")}
          </div>
        )}
      </div>

      {/* Itens com ingredientes detalhados */}
      <div style={{
        flex: 1, padding: tv ? "8px 14px" : "6px 12px",
        display: "flex", flexDirection: "column" as const, gap: tv ? 8 : 5,
        overflowY: "auto",
        borderBottom: "1px solid var(--border-1)",
      }}>
        <div style={{
          fontSize: tv ? 10 : 8, fontWeight: 800, color: "var(--text-4)",
          textTransform: "uppercase" as const, letterSpacing: "0.10em", marginBottom: 2,
        }}>
          Itens do pedido
        </div>

        {items.length === 0
          ? <span style={{ fontSize: tv ? 12 : 10, color: "var(--text-5)" }}>—</span>
          : items.map((item, i) => (
            <div key={i} style={{
              paddingBottom: tv ? 8 : 5,
              borderBottom: i < items.length - 1 ? "1px solid var(--border-1)" : "none",
              display: "flex", flexDirection: "column" as const, gap: tv ? 4 : 3,
            }}>
              {/* Nome do produto + quantidade + preço */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                <div style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
                  <span style={{
                    fontSize: tv ? 15 : 11, fontWeight: 900, color: u.time,
                    fontVariantNumeric: "tabular-nums", flexShrink: 0,
                  }}>
                    {item.qty}×
                  </span>
                  <span style={{
                    fontSize: tv ? 15 : 11, fontWeight: 900, color: "var(--text-1)",
                    lineHeight: 1.3,
                  }}>
                    {item.nome}
                  </span>
                </div>
                {item.preco && (
                  <span style={{
                    fontSize: tv ? 12 : 9, fontWeight: 700, color: "var(--text-3)",
                    flexShrink: 0, whiteSpace: "nowrap" as const,
                  }}>
                    R${item.preco}
                  </span>
                )}
              </div>

              {/* Ingredientes / composição */}
              {(item.variacao || item.sabores.length > 0 || item.adicionais.length > 0) && (
                <div style={{
                  marginLeft: tv ? 20 : 14,
                  display: "flex", flexDirection: "column" as const, gap: tv ? 3 : 2,
                }}>
                  {item.variacao && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: tv ? 11 : 9, flexShrink: 0 }}>📐</span>
                      <span style={{ fontSize: tv ? 12 : 9.5, color: "var(--text-3)", fontWeight: 700 }}>
                        {item.variacao}
                      </span>
                    </div>
                  )}
                  {item.sabores.length > 0 && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                      <span style={{ fontSize: tv ? 11 : 9, flexShrink: 0, marginTop: 1 }}>🍕</span>
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 3 }}>
                        {item.sabores.map((s, si) => (
                          <span key={si} style={{
                            fontSize: tv ? 12 : 9.5, fontWeight: 700,
                            color: "#fff",
                            background: "rgba(251,191,36,0.14)",
                            border: "1px solid rgba(251,191,36,0.28)",
                            borderRadius: 4, padding: "1px 6px",
                          }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {item.adicionais.length > 0 && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                      <span style={{ fontSize: tv ? 11 : 9, flexShrink: 0, marginTop: 1 }}>➕</span>
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 3 }}>
                        {item.adicionais.map((a, ai) => (
                          <span key={ai} style={{
                            fontSize: tv ? 12 : 9.5, fontWeight: 700,
                            color: "#34d399",
                            background: "rgba(52,211,153,0.10)",
                            border: "1px solid rgba(52,211,153,0.25)",
                            borderRadius: 4, padding: "1px 6px",
                          }}>
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        }
      </div>

      {/* Observações */}
      {p.observacoes?.trim() && (
        <div style={{
          padding: tv ? "7px 14px" : "5px 12px",
          background: "rgba(251,191,36,0.07)",
          borderBottom: "1px solid var(--border-1)",
          borderLeft: `3px solid #fbbf24`,
        }}>
          <div style={{ fontSize: tv ? 10 : 8, fontWeight: 800, color: "#fbbf24", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 2 }}>
            ⚠ Observação
          </div>
          <div style={{ fontSize: tv ? 12 : 10, color: "var(--text-2)", fontWeight: 700, lineHeight: 1.4 }}>
            {p.observacoes}
          </div>
        </div>
      )}

      {/* Pagamento + total */}
      <div style={{
        padding: tv ? "8px 14px" : "6px 12px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: "1px solid var(--border-1)",
      }}>
        <span style={{ fontSize: tv ? 11 : 9, color: "var(--text-3)", fontWeight: 600 }}>
          {pgto}
          {p.troco_para ? ` · troco p/ R$ ${p.troco_para.toFixed(2).replace(".",",")}` : ""}
        </span>
        <span style={{
          fontSize: tv ? 15 : 12, fontWeight: 900, color: "var(--text-1)",
        }}>
          R$ {total.toFixed(2).replace(".", ",")}
        </span>
      </div>

      {/* BUMP */}
      <button
        onClick={onBump} disabled={bumping}
        style={{
          width: "100%", padding: tv ? "16px 0" : "12px 0",
          background: bumping ? "var(--bg-3)" : bumpColor,
          border: "none", cursor: bumping ? "default" : "pointer",
          color: "#fff", fontSize: tv ? 15 : 12, fontWeight: 900,
          letterSpacing: "0.12em", textTransform: "uppercase" as const,
          fontFamily: "'Arial Black', system-ui, sans-serif",
          transition: "filter 0.15s, transform 0.1s", flexShrink: 0,
        }}
        onMouseDown={e => { if (!bumping) e.currentTarget.style.filter = "brightness(0.88)"; }}
        onMouseUp={e => { e.currentTarget.style.filter = ""; }}
        onMouseLeave={e => { e.currentTarget.style.filter = ""; }}
      >
        {bumping ? "..." : bumpLabel}
      </button>
    </div>
  );
}

// ── Raia ─────────────────────────────────────────────────────────────────────
function Lane({ title, count, accent, headerBg, tv, children }: {
  title: string; count: number; accent: string; headerBg: string;
  tv: boolean; children: React.ReactNode;
}) {
  return (
    <div className="kds-lane" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{
        background: headerBg, borderBottom: `3px solid ${accent}`,
        padding: tv ? "12px 18px" : "8px 14px",
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <span style={{
          width: tv ? 11 : 8, height: tv ? 11 : 8, borderRadius: "50%",
          background: accent, boxShadow: `0 0 8px ${accent}`,
          display: "inline-block", flexShrink: 0,
          animation: count > 0 ? "dot-blink 2s ease-in-out infinite" : undefined,
        }} />
        <span style={{
          fontSize: tv ? 13 : 10, fontWeight: 900, color: accent,
          letterSpacing: "0.14em", textTransform: "uppercase" as const,
          fontFamily: "'Arial Black', system-ui, sans-serif", flex: 1,
        }}>
          {title}
        </span>
        <span style={{
          background: accent + "22", color: accent,
          border: `1px solid ${accent}55`, borderRadius: 7,
          padding: tv ? "3px 12px" : "2px 8px",
          fontSize: tv ? 18 : 13, fontWeight: 900,
          fontFamily: "'Arial Black', system-ui, sans-serif",
          minWidth: 32, textAlign: "center" as const,
        }}>
          {count}
        </span>
      </div>
      <div style={{
        flex: 1, overflowY: "auto",
        padding: tv ? "12px" : "8px",
        display: "flex", flexDirection: "column" as const, gap: tv ? 10 : 7,
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Monitor de cozinha ────────────────────────────────────────────────────────
export default function CozinhaClient({ initialPedidos, empresaId, empresaNome, onBack }: {
  initialPedidos: PedidoMonitor[];
  empresaId: string;
  empresaNome: string;
  onBack: () => void;
}) {
  const supabase     = createClient();
  const containerRef = useRef<HTMLDivElement>(null);

  const [pedidos,    setPedidos]    = useState<PedidoMonitor[]>(initialPedidos);
  const [tv,         setTv]         = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [now,        setNow]        = useState(new Date());
  const [bumping,    setBumping]    = useState<Set<string>>(new Set());
  const [flashing,   setFlashing]   = useState<Set<string>>(new Set());
  const prevIds = useRef<Set<string>>(new Set(initialPedidos.map(p => p.id)));

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);

  useEffect(() => {
    const ids = new Set(pedidos.map(p => p.id));
    const novos = [...ids].filter(id => !prevIds.current.has(id));
    if (novos.length) {
      playDing();
      setFlashing(prev => new Set([...prev, ...novos]));
      setTimeout(() => setFlashing(prev => { const n = new Set(prev); novos.forEach(id => n.delete(id)); return n; }), 3500);
    }
    prevIds.current = ids;
  }, [pedidos]);

  const queueMap = new Map<string, number>();
  [...pedidos].sort((a,b) => new Date(a.created_at).getTime()-new Date(b.created_at).getTime())
    .forEach((p,i) => queueMap.set(p.id, i+1));

  const reload = useCallback(async () => {
    const d = new Date(); d.setHours(0,0,0,0);
    const { data } = await supabase.from("pedidos")
      .select("id,empresa_id,cliente_nome,cliente_telefone,tipo_pedido,descricao_itens,observacoes,endereco_entrega,bairro,forma_pagamento,valor_pedido,valor_motoboy,troco_para,status,created_at,updated_at")
      .eq("empresa_id", empresaId).gte("created_at", d.toISOString()).order("created_at", { ascending: true });
    if (data) setPedidos(data as PedidoMonitor[]);
  }, [supabase, empresaId]);

  useEffect(() => { const id = setInterval(reload, 60_000); return () => clearInterval(id); }, [reload]);

  useEffect(() => {
    const ch = supabase.channel(`coz-${empresaId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos", filter: `empresa_id=eq.${empresaId}` }, (payload) => {
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

  async function handleBump(p: PedidoMonitor) {
    if (bumping.has(p.id)) return;
    const next: PedidoStatus = p.status === "em_fila" ? "em_preparo" : "finalizado";
    setBumping(prev => new Set([...prev, p.id]));
    await supabase.from("pedidos").update({ status: next, updated_at: new Date().toISOString() }).eq("id", p.id);
    setBumping(prev => { const n = new Set(prev); n.delete(p.id); return n; });
  }

  const fila    = pedidos.filter(p => p.status === "em_fila");
  const preparo = pedidos.filter(p => p.status === "em_preparo");
  const prontos = pedidos.filter(p => p.status === "finalizado" && (now.getTime()-new Date(p.updated_at).getTime()) < HIDE_PRONTO_MS);

  const empty = (label: string) => (
    <div className="kds-empty" style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: 100, fontSize: tv ? 14 : 11, fontWeight: 700,
      textTransform: "uppercase" as const, letterSpacing: "0.05em",
    }}>{label}</div>
  );

  const ui = (
    <div ref={containerRef} className="kds-root" style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        .kds-root { background: var(--bg-base); }
        .kds-lane { background: var(--bg-2); }
        .kds-card { background: var(--bg-1); }
        .kds-empty { color: var(--text-5); }
        @keyframes kds-flash { 0%,100%{border-color:inherit} 50%{border-color:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.2)} }
        @keyframes dot-blink  { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>

      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: tv ? "0 24px" : "0 14px", height: tv ? 56 : 40,
        background: "#DA291C", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!tv && (
            <button onClick={onBack} style={{
              background: "rgba(0,0,0,0.2)", border: "none", borderRadius: 7,
              padding: "4px 8px", cursor: "pointer", color: "#fff",
              display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
            }}>
              <ArrowLeft size={12} /> Trocar
            </button>
          )}
          <span style={{ fontSize: tv ? 18 : 13, fontWeight: 900, color: "#fff", textTransform: "uppercase" as const }}>
            {empresaNome || "Cozinha"}
          </span>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#FFC72C", background: "rgba(0,0,0,0.25)", borderRadius: 4, padding: "2px 7px", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
            Cozinha
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: tv ? 16 : 10 }}>
          <span style={{ fontSize: tv ? 28 : 18, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}>
            {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button onClick={toggleTv} style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: tv ? "5px 12px" : "3px 8px", borderRadius: 7,
            background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,.2)",
            color: "#fff", fontSize: tv ? 11 : 9, fontWeight: 800, cursor: "pointer",
            textTransform: "uppercase" as const, letterSpacing: "0.06em",
          }}>
            {fullscreen ? <Minimize2 size={tv?11:9} /> : <Maximize2 size={tv?11:9} />}
            {tv ? "Sair" : "TV"}
          </button>
        </div>
      </div>

      {/* Raias */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        flex: 1, minHeight: 0, gap: "2px", background: "var(--border-1)",
      }}>
        <Lane title="Fila" count={fila.length} accent="#fbbf24" headerBg="rgba(251,191,36,0.07)" tv={tv}>
          {fila.length === 0 ? empty("Sem pedidos na fila") : fila.map(p => (
            <Card key={p.id} p={p} num={queueMap.get(p.id)??0} now={now} tv={tv}
              onBump={() => handleBump(p)} bumping={bumping.has(p.id)} flash={flashing.has(p.id)}
              bumpLabel="▶  Iniciar Preparo" bumpColor="#d97706" />
          ))}
        </Lane>

        <Lane title="Em Preparo" count={preparo.length} accent="#60a5fa" headerBg="rgba(96,165,250,0.07)" tv={tv}>
          {preparo.length === 0 ? empty("Nada em preparo") : preparo.map(p => (
            <Card key={p.id} p={p} num={queueMap.get(p.id)??0} now={now} tv={tv}
              onBump={() => handleBump(p)} bumping={bumping.has(p.id)} flash={false}
              bumpLabel="✓  Pronto para Entrega" bumpColor="#1d4ed8" />
          ))}
        </Lane>

        <Lane title="Pronto" count={prontos.length} accent="#34d399" headerBg="rgba(52,211,153,0.07)" tv={tv}>
          {prontos.length === 0 ? empty("Nenhum pronto ainda") : prontos.map(p => {
            const msSR = now.getTime()-new Date(p.updated_at).getTime();
            return (
              <div key={p.id} className="kds-card" style={{
                border: `2px solid ${flashing.has(p.id) ? "#34d399" : "rgba(52,211,153,0.25)"}`,
                borderRadius: tv ? 14 : 10, overflow: "hidden",
                animation: flashing.has(p.id) ? "kds-flash 0.6s ease-in-out 5" : undefined,
              }}>
                <div style={{
                  padding: tv ? "12px 16px" : "9px 12px",
                  display: "flex", alignItems: "center", gap: 12,
                  borderBottom: "1px solid var(--border-1)",
                }}>
                  <span style={{ fontSize: tv ? 50 : 36, fontWeight: 900, color: "#34d399", lineHeight: 1, letterSpacing: "-0.05em" }}>
                    {padNum(queueMap.get(p.id)??0)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: tv ? 15 : 12, fontWeight: 900, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {p.cliente_nome}
                    </div>
                    <div style={{ fontSize: tv ? 11 : 9, color: msSR > 5*60000 ? "#f87171" : "#34d399", fontWeight: 700, marginTop: 2 }}>
                      Pronto há {formatTimer(msSR)}
                    </div>
                  </div>
                </div>
                <div style={{ padding: tv ? "8px 16px" : "6px 12px", fontSize: tv ? 11 : 9, color: p.tipo_pedido === "entrega" ? "#fb923c" : "#a78bfa", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                  {p.tipo_pedido === "entrega" ? "⚡ Sai para entrega" : "🏃 Aguardando retirada"}
                </div>
              </div>
            );
          })}
        </Lane>
      </div>
    </div>
  );

  if (tv) return <div style={{ position: "fixed", inset: 0, zIndex: 9999, overflow: "hidden" }}>{ui}</div>;
  return <div style={{ height: "100%", overflow: "hidden" }}>{ui}</div>;
}
