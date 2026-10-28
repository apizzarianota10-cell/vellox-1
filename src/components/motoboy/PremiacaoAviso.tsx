"use client";

/**
 * Aviso de premiação no app do motoboy (montado por src/app/motoboy/layout.tsx).
 *
 * Tem sessão própria (igual ao NotificacoesMotoboy): descobre o motoboy logado
 * pelo auth_id e busca as premiações "enviada" dele. O RLS da schema_v75 só
 * devolve as do próprio motoboy e só deixa marcar como vista/resgatada.
 * Sem a v75 (tabela inexistente) não mostra nada.
 */

import { useEffect, useState } from "react";
import { Trophy, Gift, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Premiacao {
  id: string;
  titulo: string;
  mensagem: string;
  beneficio: string | null;
  valor: number | null;
  periodo_ref: string | null;
}

export default function PremiacaoAviso() {
  const [motoboyId, setMotoboyId] = useState<string | null>(null);
  const [fila, setFila] = useState<Premiacao[]>([]);
  const [fechando, setFechando] = useState(false);

  // Motoboy logado (acompanha login/logout feitos na página)
  useEffect(() => {
    const supabase = createClient();
    let ativo = true;
    async function carregar(userId: string | null) {
      if (!userId) { if (ativo) setMotoboyId(null); return; }
      const { data } = await supabase.from("motoboys").select("id").eq("auth_id", userId).maybeSingle();
      if (ativo) setMotoboyId((data as { id: string } | null)?.id ?? null);
    }
    supabase.auth.getUser().then(({ data }) => carregar(data.user?.id ?? null)).catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === "SIGNED_IN" || evento === "SIGNED_OUT") carregar(sessao?.user?.id ?? null);
    });
    return () => { ativo = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!motoboyId) { setFila([]); return; }
    const supabase = createClient();
    let ativo = true;
    async function buscar() {
      const { data, error } = await supabase
        .from("premiacoes")
        .select("id, titulo, mensagem, beneficio, valor, periodo_ref")
        .eq("motoboy_id", motoboyId)
        .eq("status", "enviada")
        .order("created_at", { ascending: true })
        .limit(5);
      if (ativo && !error) setFila((data ?? []) as Premiacao[]);
    }
    buscar();
    const t = setInterval(buscar, 10 * 60 * 1000);
    const vis = () => { if (document.visibilityState === "visible") buscar(); };
    document.addEventListener("visibilitychange", vis);
    return () => { ativo = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [motoboyId]);

  const atual = fila[0];
  if (!atual) return null;

  async function fechar() {
    setFechando(true);
    await createClient().from("premiacoes").update({ status: "vista" }).eq("id", atual.id).then(() => {}, () => {});
    setFila(f => f.slice(1));
    setFechando(false);
  }

  const beneficio = atual.beneficio ?? (atual.valor != null ? `R$ ${Number(atual.valor).toFixed(2).replace(".", ",")}` : null);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="premiacao-mb-titulo"
      style={{ position: "fixed", inset: 0, zIndex: 9990, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={fechar} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
      <div style={{
        position: "relative", width: "100%", maxWidth: 460, borderRadius: "26px 26px 0 0", overflow: "hidden",
        background: "#141210", color: "#f3f1ed", boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
        paddingBottom: "max(20px, env(safe-area-inset-bottom))", animation: "premiacao-mb-in .32s ease both",
      }}>
        <style>{`@keyframes premiacao-mb-in{from{transform:translateY(40px);opacity:.3}to{transform:none;opacity:1}}`}</style>
        <div style={{ padding: "26px 22px 18px", textAlign: "center", background: "radial-gradient(120% 100% at 50% 0%, #ff4d6d 0%, #E4002B 50%, #7a0017 100%)" }}>
          <button onClick={fechar} aria-label="Fechar"
            style={{ position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: 12, border: 0, background: "rgba(255,255,255,0.16)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={18} />
          </button>
          <div style={{ width: 64, height: 64, margin: "0 auto 10px", borderRadius: 20, background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trophy size={32} color="#FFC72C" fill="#FFC72C" />
          </div>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.85 }}>
            Você foi premiado{atual.periodo_ref ? ` · ${atual.periodo_ref}` : ""}
          </p>
          <h2 id="premiacao-mb-titulo" style={{ fontSize: 21, fontWeight: 800, marginTop: 6, lineHeight: 1.2 }}>{atual.titulo}</h2>
        </div>
        <div style={{ padding: "18px 22px 4px" }}>
          {atual.mensagem && <p style={{ fontSize: 15, lineHeight: 1.55, color: "#d4d0c9", whiteSpace: "pre-line" }}>{atual.mensagem}</p>}
          {beneficio && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, background: "rgba(255,199,44,0.12)", border: "1px solid rgba(255,199,44,0.4)" }}>
              <Gift size={22} color="#FFC72C" />
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#a39e96" }}>Seu prêmio</p>
                <p style={{ fontSize: 17, fontWeight: 800 }}>{beneficio}</p>
              </div>
            </div>
          )}
          <button onClick={fechar} disabled={fechando}
            style={{ marginTop: 18, width: "100%", height: 52, borderRadius: 16, border: 0, background: "#E4002B", color: "#fff", fontWeight: 800, fontSize: 16, opacity: fechando ? 0.7 : 1 }}>
            Valeu!
          </button>
          {fila.length > 1 && <p style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: "#a39e96" }}>+{fila.length - 1} esperando</p>}
        </div>
      </div>
    </div>
  );
}
