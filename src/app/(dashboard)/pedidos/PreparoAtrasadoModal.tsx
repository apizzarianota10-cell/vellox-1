"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Clock, Loader2, XCircle } from "lucide-react";
import type { Pedido } from "@/types";

// "Ainda em preparo" adia a pergunta sobre aquele pedido por este tempo.
const ADIAR_MIN = 10;
const ADIAR_KEY = "vellox-preparo-adiado";
// Sem tempo configurado na loja (ou texto sem número), usa este padrão.
const PADRAO_MIN = 40;

/** "30-45 min" → 45; "1h" → 60; "1h30" → 90; sem número → padrão. */
export function tempoEstimadoMin(texto: string | null | undefined): number {
  const t = (texto ?? "").toLowerCase();
  const h = t.match(/(\d+)\s*h\s*(\d+)?/);
  if (h) return parseInt(h[1], 10) * 60 + (h[2] ? parseInt(h[2], 10) : 0);
  const nums = (t.match(/\d+/g) ?? []).map(n => parseInt(n, 10)).filter(n => n > 0);
  return nums.length ? Math.max(...nums) : PADRAO_MIN;
}

function lerAdiados(): Record<string, number> {
  try { return JSON.parse(sessionStorage.getItem(ADIAR_KEY) ?? "{}") as Record<string, number>; } catch { return {}; }
}

interface Props {
  pedidos: Pedido[];
  tempoEstimado: string | null;
  onFinalizar: (p: Pedido) => Promise<void>;
  onCancelar: (p: Pedido) => Promise<void>;
}

/**
 * Pergunta sobre pedidos parados "em preparo" além do tempo estimado da loja
 * (contado desde a criação do pedido) — se já saiu, dá baixa como finalizado;
 * se não vai sair, cancela. Um pedido por vez.
 */
export default function PreparoAtrasadoModal({ pedidos, tempoEstimado, onFinalizar, onCancelar }: Props) {
  const limiteMin = tempoEstimadoMin(tempoEstimado);
  const [agora, setAgora] = useState(() => Date.now());
  const [adiados, setAdiados] = useState<Record<string, number>>({});
  const [salvando, setSalvando] = useState<"finalizar" | "cancelar" | null>(null);

  useEffect(() => {
    setAdiados(lerAdiados());
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const atual = useMemo(() => pedidos
    .filter(p => p.status === "em_preparo")
    .filter(p => agora - new Date(p.created_at).getTime() > limiteMin * 60_000)
    .filter(p => (adiados[p.id] ?? 0) < agora)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null,
  [pedidos, agora, adiados, limiteMin]);

  if (!atual) return null;

  const minutos = Math.round((agora - new Date(atual.created_at).getTime()) / 60_000);
  const retirada = atual.tipo_pedido === "retirada";

  function adiar() {
    if (!atual) return;
    const novo = { ...adiados, [atual.id]: Date.now() + ADIAR_MIN * 60_000 };
    setAdiados(novo);
    try { sessionStorage.setItem(ADIAR_KEY, JSON.stringify(novo)); } catch { /* só não persiste */ }
  }

  async function agir(tipo: "finalizar" | "cancelar") {
    if (!atual) return;
    setSalvando(tipo);
    try {
      await (tipo === "finalizar" ? onFinalizar(atual) : onCancelar(atual));
    } finally {
      setSalvando(null);
      // Evita reabrir para o mesmo pedido enquanto a lista não atualiza.
      adiar();
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="rounded-2xl" style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", width: "100%", maxWidth: 420, padding: 20, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(245,158,11,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Clock size={20} style={{ color: "#d97706" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>Esse pedido já saiu?</p>
            <p style={{ fontSize: 12.5, color: "var(--text-4)", margin: 0 }}>
              Em preparo há {minutos} min · estimado da loja: {limiteMin} min
            </p>
          </div>
        </div>

        <div className="rounded-xl" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)", padding: "10px 12px", marginBottom: 16 }}>
          <p className="truncate" style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{atual.cliente_nome}</p>
          <p style={{ fontSize: 12, color: "var(--text-4)", margin: "2px 0 0" }}>
            {retirada ? "Retirada" : "Delivery"} · feito às {new Date(atual.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {atual.valor_pedido > 0 ? ` · R$ ${atual.valor_pedido.toFixed(2).replace(".", ",")}` : ""}
          </p>
          {atual.descricao_itens && (
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0 0", whiteSpace: "pre-line", maxHeight: 72, overflow: "hidden" }}>{atual.descricao_itens}</p>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => agir("finalizar")} disabled={salvando !== null}
            className="flex items-center justify-center gap-2 rounded-xl"
            style={{ padding: "11px 14px", background: "#22c55e", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
            {salvando === "finalizar" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            Sim, já foi finalizado
          </button>
          <button onClick={() => agir("cancelar")} disabled={salvando !== null}
            className="flex items-center justify-center gap-2 rounded-xl"
            style={{ padding: "10px 14px", background: "rgba(228,0,43,0.08)", color: "#E4002B", border: "1px solid rgba(228,0,43,0.3)", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            {salvando === "cancelar" ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
            Foi cancelado
          </button>
          <button onClick={adiar} disabled={salvando !== null}
            style={{ padding: "8px 14px", background: "none", color: "var(--text-3)", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Ainda em preparo (perguntar de novo em {ADIAR_MIN} min)
          </button>
        </div>
      </div>
    </div>
  );
}
