"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Clock, Loader2, XCircle } from "lucide-react";
import type { Pedido } from "@/types";

// Fluxo automático dos pedidos (enquanto a tela de Pedidos está aberta):
//   1. "Em fila" passa sozinho para "Em preparo" depois de PASSO_MIN.
//   2. "Em preparo" há PASSO_MIN → pop-up perguntando se o pedido já foi
//      despachado (ou ficou pronto, na retirada). Só avança com o "Sim" —
//      é aí que baixa o estoque e vai para o motoboy.
const PASSO_MIN = 3;
// "Ainda não" pergunta de novo depois deste tempo.
const ADIAR_MIN = 2;
const ADIAR_KEY = "vellox-preparo-adiado";

function lerAdiados(): Record<string, number> {
  try { return JSON.parse(sessionStorage.getItem(ADIAR_KEY) ?? "{}") as Record<string, number>; } catch { return {}; }
}

/** Quando o pedido entrou no status atual (updated_at é gravado a cada mudança de status). */
function desde(p: Pedido): number {
  const t = new Date(p.updated_at ?? p.created_at).getTime();
  return Number.isFinite(t) ? t : new Date(p.created_at).getTime();
}

interface Props {
  pedidos: Pedido[];
  onAvancar: (p: Pedido) => Promise<void>;
  onCancelar: (p: Pedido) => Promise<void>;
}

export default function PreparoAtrasadoModal({ pedidos, onAvancar, onCancelar }: Props) {
  const [agora, setAgora] = useState(() => Date.now());
  const [adiados, setAdiados] = useState<Record<string, number>>({});
  const [salvando, setSalvando] = useState<"finalizar" | "cancelar" | null>(null);
  const avancados = useRef<Set<string>>(new Set());

  useEffect(() => {
    setAdiados(lerAdiados());
    const t = setInterval(() => setAgora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // 1) Em fila → Em preparo, sozinho
  useEffect(() => {
    const prontos = pedidos.filter(p =>
      p.status === "em_fila" && !avancados.current.has(p.id) && agora - desde(p) >= PASSO_MIN * 60_000);
    for (const p of prontos) {
      avancados.current.add(p.id);
      onAvancar(p).catch(() => avancados.current.delete(p.id));
    }
  }, [pedidos, agora, onAvancar]);

  // 2) Em preparo há PASSO_MIN → pergunta
  const atual = useMemo(() => pedidos
    .filter(p => p.status === "em_preparo")
    .filter(p => agora - desde(p) >= PASSO_MIN * 60_000)
    .filter(p => (adiados[p.id] ?? 0) < agora)
    .sort((a, b) => desde(a) - desde(b))[0] ?? null,
  [pedidos, agora, adiados]);

  if (!atual) return null;

  const minutos = Math.max(1, Math.round((agora - desde(atual)) / 60_000));
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
      await (tipo === "finalizar" ? onAvancar(atual) : onCancelar(atual));
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
            <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>
              {retirada ? "Esse pedido já está pronto?" : "Esse pedido já foi despachado?"}
            </p>
            <p style={{ fontSize: 12.5, color: "var(--text-4)", margin: 0 }}>Em preparo há {minutos} min</p>
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
            style={{ padding: "12px 14px", background: "#22c55e", color: "#fff", border: "none", fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>
            {salvando === "finalizar" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {retirada ? "Sim, está pronto" : "Sim, foi despachado"}
          </button>
          <button onClick={adiar} disabled={salvando !== null}
            className="rounded-xl"
            style={{ padding: "11px 14px", background: "var(--bg-2)", color: "var(--text-2)", border: "1px solid var(--border-1)", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            Ainda não (perguntar de novo em {ADIAR_MIN} min)
          </button>
          <button onClick={() => agir("cancelar")} disabled={salvando !== null}
            className="flex items-center justify-center gap-2"
            style={{ padding: "8px 14px", background: "none", color: "#E4002B", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {salvando === "cancelar" ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            Foi cancelado
          </button>
        </div>
      </div>
    </div>
  );
}
