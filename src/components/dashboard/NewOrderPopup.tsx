"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { printOrder } from "@/lib/printService";
import type { Pedido } from "@/types";
import {
  X, Printer, ChevronLeft, ChevronRight,
  MapPin, Package, Truck, ShoppingBag, Clock, Loader2,
} from "lucide-react";

const PGTO: Record<string, string> = {
  dinheiro:       "Dinheiro",
  cartao_credito: "Cartão Crédito",
  cartao_debito:  "Cartão Débito",
  pix:            "PIX",
  ja_pago:        "Já pago",
};

interface Props {
  empresaId:    string;
  empresaNome:  string;
  empresaCnpj?: string | null;
}

export default function NewOrderPopup({ empresaId, empresaNome, empresaCnpj }: Props) {
  const [orders,      setOrders]      = useState<Pedido[]>([]);
  const [idx,         setIdx]         = useState(0);
  const [printed,     setPrinted]     = useState<Set<string>>(new Set());
  const [printingAll, setPrintingAll] = useState(false);
  const [printingIdx, setPrintingIdx] = useState<number | null>(null);

  const push = useCallback((pedido: Pedido) => {
    setOrders(prev => {
      if (prev.some(p => p.id === pedido.id)) return prev;
      return [...prev, pedido];
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`new-order-popup-${empresaId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "pedidos",
        filter: `empresa_id=eq.${empresaId}`,
      }, (payload) => {
        const p = payload.new as Pedido;
        if (p.status === "em_fila") push(p);
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "pedidos",
        filter: `empresa_id=eq.${empresaId}`,
      }, (payload) => {
        // Já foi impresso por outra via (agente/servidor) — tira do popup,
        // não precisa mais chamar atenção pra esse pedido.
        const atualizado = payload.new as Pedido;
        if (atualizado.printed_at) {
          setOrders(prev => prev.filter(o => o.id !== atualizado.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [empresaId, push]);

  // Salta para o pedido mais recente quando um novo chega
  useEffect(() => {
    if (orders.length > 0) setIdx(orders.length - 1);
  }, [orders.length]);

  if (orders.length === 0) return null;

  function dismiss() {
    setOrders([]);
    setIdx(0);
    setPrinted(new Set());
  }

  function handlePrint(p: Pedido) {
    printOrder(p, empresaNome, empresaCnpj ?? undefined);
    setPrinted(prev => new Set([...prev, p.id]));
  }

  async function handlePrintAll() {
    setPrintingAll(true);
    for (let i = 0; i < orders.length; i++) {
      setIdx(i);
      setPrintingIdx(i);
      printOrder(orders[i], empresaNome, empresaCnpj ?? undefined);
      setPrinted(prev => new Set([...prev, orders[i].id]));
      if (i < orders.length - 1) {
        await new Promise(r => setTimeout(r, 3500));
      }
    }
    setPrintingIdx(null);
    setPrintingAll(false);
  }

  return (
    <div
      className="fixed z-[9999] rounded-2xl overflow-hidden"
      style={{
        bottom: 16,
        right:  16,
        width: "min(368px, calc(100vw - 32px))",
        background: "#0f0f0f",
        border: "1px solid rgba(255,106,0,0.22)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,106,0,0.08)",
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(255,106,0,0.07)", borderBottom: "1px solid rgba(255,106,0,0.1)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="animate-pulse w-2 h-2 rounded-full inline-block"
            style={{ background: "#FF6A00" }}
          />
          <span className="text-sm font-bold text-white">
            {orders.length === 1 ? "Novo pedido!" : `${orders.length} novos pedidos!`}
          </span>
        </div>
        <button
          onClick={dismiss}
          className="w-7 h-7 flex items-center justify-center rounded-xl transition-colors"
          style={{ color: "#475569" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#475569"; }}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Dots de navegação ── */}
      {orders.length > 1 && (
        <div
          className="flex items-center justify-center gap-1.5 py-2.5"
          style={{ borderBottom: "1px solid #141414" }}
        >
          {orders.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className="rounded-full transition-all duration-200"
              style={{
                width:      i === idx ? 22 : 6,
                height:     6,
                background: i === idx ? "#FF6A00" : "#374151",
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* ── Viewport do slide ── */}
      <div style={{ overflow: "hidden" }}>
        <div
          style={{
            display:    "flex",
            transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
            transform:  `translateX(-${idx * 100}%)`,
          }}
        >
          {orders.map((p, i) => {
            const total = p.valor_pedido + p.valor_motoboy;
            return (
              <div key={p.id} style={{ minWidth: "100%", flexShrink: 0, padding: "14px 16px" }}>
                <div className="space-y-2">

                  {/* Contador */}
                  {orders.length > 1 && (
                    <p className="text-xs font-semibold" style={{ color: "#475569" }}>
                      Pedido {i + 1} de {orders.length}
                    </p>
                  )}

                  {/* Nome + hora */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-white">{p.cliente_nome}</p>
                      {p.cliente_telefone && (
                        <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>{p.cliente_telefone}</p>
                      )}
                    </div>
                    <span className="text-xs flex items-center gap-1 shrink-0 mt-0.5" style={{ color: "#475569" }}>
                      <Clock size={11} />
                      {new Date(p.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  {/* Tipo */}
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                    style={p.tipo_pedido === "retirada"
                      ? { background: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)" }
                      : { background: "rgba(249,115,22,0.1)",   color: "#fb923c", border: "1px solid rgba(249,115,22,0.25)" }}
                  >
                    {p.tipo_pedido === "retirada" ? <ShoppingBag size={10} /> : <Truck size={10} />}
                    {p.tipo_pedido === "retirada" ? "Retirada" : "Delivery"}
                  </span>

                  {/* Endereço */}
                  {p.tipo_pedido !== "retirada" && (
                    <div className="flex items-start gap-1.5">
                      <MapPin size={12} style={{ color: "#64748b", flexShrink: 0, marginTop: 2 }} />
                      <p className="text-xs leading-snug" style={{ color: "#94a3b8" }}>
                        {p.endereco_entrega}
                      </p>
                    </div>
                  )}

                  {/* Itens */}
                  {p.descricao_itens && (
                    <div className="flex items-start gap-1.5">
                      <Package size={12} style={{ color: "#64748b", flexShrink: 0, marginTop: 2 }} />
                      <p className="text-xs leading-snug" style={{ color: "#94a3b8" }}>
                        {p.descricao_itens}
                      </p>
                    </div>
                  )}

                  {/* Total + pagamento */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-white">
                        R$ {total.toFixed(2).replace(".", ",")}
                      </span>
                      {p.forma_pagamento && (
                        <span className="text-xs" style={{ color: "#64748b" }}>
                          · {PGTO[p.forma_pagamento] ?? p.forma_pagamento}
                        </span>
                      )}
                      {p.troco_para && (
                        <span className="text-xs" style={{ color: "#94a3b8" }}>
                          (troco p/ R$ {p.troco_para.toFixed(2).replace(".", ",")})
                        </span>
                      )}
                    </div>
                    {printed.has(p.id) && (
                      <span className="text-xs font-semibold shrink-0" style={{ color: "#22c55e" }}>
                        ✓ Impresso
                      </span>
                    )}
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Setas de navegação ── */}
      {orders.length > 1 && (
        <div
          className="flex items-center justify-between px-3 pt-2.5 pb-3"
          style={{ borderTop: "1px solid #141414" }}
        >
          <button
            onClick={() => setIdx(prev => Math.max(0, prev - 1))}
            disabled={idx === 0}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl transition-all"
            style={{
              background: idx === 0 ? "transparent" : "rgba(255,255,255,0.04)",
              color:      idx === 0 ? "#1f2937" : "#64748b",
              border:     `1px solid ${idx === 0 ? "transparent" : "#1f2937"}`,
              cursor:     idx === 0 ? "default" : "pointer",
            }}
          >
            <ChevronLeft size={13} /> Anterior
          </button>
          <button
            onClick={() => setIdx(prev => Math.min(orders.length - 1, prev + 1))}
            disabled={idx === orders.length - 1}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl transition-all"
            style={{
              background: idx === orders.length - 1 ? "transparent" : "rgba(255,255,255,0.04)",
              color:      idx === orders.length - 1 ? "#1f2937" : "#64748b",
              border:     `1px solid ${idx === orders.length - 1 ? "transparent" : "#1f2937"}`,
              cursor:     idx === orders.length - 1 ? "default" : "pointer",
            }}
          >
            Próximo <ChevronRight size={13} />
          </button>
        </div>
      )}

      {/* ── Botões de impressão ── */}
      <div
        className="px-4 pb-4 flex flex-col gap-2"
        style={{ borderTop: "1px solid #141414", paddingTop: 12 }}
      >
        <button
          onClick={() => handlePrint(orders[idx])}
          disabled={printingAll}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold transition-all"
          style={{
            background: "rgba(255,106,0,0.1)",
            color:      "#FF6A00",
            border:     "1px solid rgba(255,106,0,0.3)",
            opacity:    printingAll ? 0.4 : 1,
          }}
          onMouseEnter={e => { if (!printingAll) (e.currentTarget as HTMLElement).style.background = "rgba(255,106,0,0.18)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,106,0,0.1)"; }}
        >
          <Printer size={14} />
          {printed.has(orders[idx].id) ? "Reimprimir este pedido" : "Imprimir este pedido"}
        </button>

        {orders.length > 1 && (
          <button
            onClick={handlePrintAll}
            disabled={printingAll}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{
              background: printingAll ? "rgba(34,197,94,0.05)" : "rgba(34,197,94,0.1)",
              color:      "#22c55e",
              border:     "1px solid rgba(34,197,94,0.25)",
            }}
          >
            {printingAll
              ? <Loader2 size={14} className="animate-spin" />
              : <Printer size={14} />}
            {printingAll
              ? `Imprimindo ${(printingIdx ?? 0) + 1} de ${orders.length}...`
              : `Imprimir todos (${orders.length})`}
          </button>
        )}
      </div>
    </div>
  );
}
