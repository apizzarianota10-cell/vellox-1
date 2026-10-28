"use client";

/**
 * Aviso de premiação para o painel da loja.
 *
 * Mostra as premiações enviadas pelo dono da plataforma (painel /god) que a
 * loja ainda não viu. Lê `premiacoes` direto com o client do navegador — o RLS
 * (schema_v75) só devolve as da própria empresa, e só deixa mudar o status
 * para "vista"/"resgatada".
 *
 * Antes da schema_v75.sql a tabela não existe: o componente simplesmente não
 * aparece. Montar no layout do painel:
 *   <PremiacaoAviso empresaId={empresa.id} />
 */

import { useEffect, useState } from "react";
import { Trophy, X, CalendarPlus, Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Premiacao {
  id: string;
  titulo: string;
  mensagem: string;
  beneficio: string | null;
  valor: number | null;
  dias_bonus: number | null;
  dias_aplicados_em: string | null;
  periodo_ref: string | null;
  created_at: string;
}

const RECHECK_MS = 10 * 60 * 1000;

export default function PremiacaoAviso({ empresaId }: { empresaId: string | null | undefined }) {
  const [fila, setFila] = useState<Premiacao[]>([]);
  const [fechando, setFechando] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    const supabase = createClient();
    let ativo = true;
    async function carregar() {
      const { data, error } = await supabase
        .from("premiacoes")
        .select("id, titulo, mensagem, beneficio, valor, dias_bonus, dias_aplicados_em, periodo_ref, created_at")
        .eq("empresa_id", empresaId)
        .eq("status", "enviada")
        .order("created_at", { ascending: true })
        .limit(5);
      if (!ativo || error) return; // sem a v75: não mostra nada
      setFila((data ?? []) as Premiacao[]);
    }
    carregar();
    const t = setInterval(carregar, RECHECK_MS);
    return () => { ativo = false; clearInterval(t); };
  }, [empresaId]);

  const atual = fila[0];
  if (!atual) return null;

  async function marcar(status: "vista" | "resgatada") {
    setFechando(true);
    const supabase = createClient();
    await supabase.from("premiacoes").update({ status }).eq("id", atual.id).then(() => {}, () => {});
    setFila(f => f.slice(1));
    setFechando(false);
  }

  const beneficio = atual.beneficio ?? (atual.valor != null ? `R$ ${Number(atual.valor).toFixed(2).replace(".", ",")}` : null);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="premiacao-titulo"
      style={{ position: "fixed", inset: 0, zIndex: 9990, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={() => marcar("vista")} style={{ position: "absolute", inset: 0, background: "rgba(10,8,6,0.55)", backdropFilter: "blur(3px)" }} />
      <div style={{
        position: "relative", width: "100%", maxWidth: 420, borderRadius: 24, overflow: "hidden",
        background: "var(--bg-1, #fff)", color: "var(--text-1, #16130f)", border: "1px solid var(--border-1, #ecebe7)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.35)", animation: "premiacao-in .35s cubic-bezier(.2,.9,.3,1.2) both",
      }}>
        <style>{`@keyframes premiacao-in{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){[aria-labelledby="premiacao-titulo"] *{animation:none!important}}`}</style>
        <div style={{
          padding: "28px 24px 22px", textAlign: "center", color: "#fff",
          background: "radial-gradient(120% 90% at 50% 0%, #ff4d6d 0%, #E4002B 45%, #9b001d 100%)",
        }}>
          <button onClick={() => marcar("vista")} aria-label="Fechar"
            style={{ position: "absolute", top: 12, right: 12, width: 34, height: 34, borderRadius: 12, border: 0, background: "rgba(255,255,255,0.16)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={17} />
          </button>
          <div style={{ width: 68, height: 68, margin: "0 auto 12px", borderRadius: 22, background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25)" }}>
            <Trophy size={34} color="#FFC72C" fill="#FFC72C" />
          </div>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.85 }}>
            Premiação Vellox{atual.periodo_ref ? ` · ${atual.periodo_ref}` : ""}
          </p>
          <h2 id="premiacao-titulo" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 6, lineHeight: 1.2 }}>{atual.titulo}</h2>
        </div>
        <div style={{ padding: "20px 24px 24px" }}>
          {atual.mensagem && <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--text-2, #4a453f)", whiteSpace: "pre-line" }}>{atual.mensagem}</p>}
          {beneficio && (
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, background: "rgba(255,199,44,0.14)", border: "1px solid rgba(255,199,44,0.45)" }}>
              <Gift size={22} color="#b7791f" />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-3, #6f6a63)" }}>Seu prêmio</p>
                <p style={{ fontSize: 16, fontWeight: 800 }}>{beneficio}</p>
              </div>
            </div>
          )}
          {atual.dias_bonus && atual.dias_aplicados_em && (
            <p style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#0f7a43", fontWeight: 600 }}>
              <CalendarPlus size={16} /> +{atual.dias_bonus} dias já foram somados à sua assinatura.
            </p>
          )}
          <button onClick={() => marcar(atual.dias_aplicados_em ? "resgatada" : "vista")} disabled={fechando}
            style={{ marginTop: 20, width: "100%", height: 48, borderRadius: 14, border: 0, background: "#E4002B", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: fechando ? 0.7 : 1 }}>
            {beneficio ? "Oba, valeu!" : "Obrigado!"}
          </button>
          {fila.length > 1 && <p style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: "var(--text-3, #6f6a63)" }}>+{fila.length - 1} premiação{fila.length > 2 ? "ões" : ""} esperando</p>}
        </div>
      </div>
    </div>
  );
}
