"use client";

import { useState, useEffect, useRef } from "react";
import { X, Send, MessageCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Mensagem {
  id: string;
  motoboy_id: string;
  remetente: "empresa" | "motoboy";
  texto: string;
  lido: boolean;
  created_at: string;
}

interface Props {
  empresaId: string;
  motoboyId: string;
  motoboyNome: string;
  onClose: () => void;
}

export default function ChatMotoboy({ empresaId, motoboyId, motoboyNome, onClose }: Props) {
  const supabase = createClient();
  const [msgs, setMsgs]       = useState<Mensagem[]>([]);
  const [texto, setTexto]     = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function carregar() {
      const { data } = await supabase
        .from("mensagens")
        .select("id, remetente, texto, lido, created_at")
        .eq("empresa_id", empresaId)
        .eq("motoboy_id", motoboyId)
        .order("created_at", { ascending: true })
        .limit(200);
      setMsgs((data ?? []) as Mensagem[]);
      setLoading(false);
      // Marca como lidas as do motoboy
      await supabase.from("mensagens")
        .update({ lido: true })
        .eq("empresa_id", empresaId)
        .eq("motoboy_id", motoboyId)
        .eq("remetente", "motoboy")
        .eq("lido", false);
    }
    carregar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, motoboyId]);

  useEffect(() => {
    const ch = supabase
      .channel(`chat-emp-${empresaId}-mb-${motoboyId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "mensagens",
        filter: `empresa_id=eq.${empresaId}`,
      }, (payload) => {
        const nova = payload.new as Mensagem;
        if (nova.motoboy_id !== motoboyId) return;
        setMsgs(prev => [...prev, nova]);
        if (nova.remetente === "motoboy") {
          supabase.from("mensagens").update({ lido: true }).eq("id", nova.id);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, motoboyId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function enviar() {
    if (!texto.trim() || sending) return;
    const t = texto.trim();
    setTexto("");
    setSending(true);
    await supabase.from("mensagens").insert({
      empresa_id: empresaId,
      motoboy_id: motoboyId,
      remetente: "empresa",
      texto: t,
    });
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", height: "min(520px, 85dvh)" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 shrink-0"
          style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border-1)" }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
            style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa" }}>
            {motoboyNome.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate" style={{ color: "var(--text-1)" }}>{motoboyNome}</p>
            <p className="text-xs" style={{ color: "#64748b" }}>Chat direto</p>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-4)" }}><X size={18} /></button>
        </div>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin" style={{ color: "#64748b" }} />
            </div>
          ) : msgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <MessageCircle size={28} style={{ color: "#374151" }} />
              <p className="text-sm" style={{ color: "#64748b" }}>Nenhuma mensagem ainda</p>
              <p className="text-xs text-center" style={{ color: "#374151" }}>
                Envie uma mensagem para {motoboyNome}
              </p>
            </div>
          ) : msgs.map((m) => {
            const isEmp = m.remetente === "empresa";
            return (
              <div key={m.id} className={`flex ${isEmp ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[78%] rounded-2xl px-3.5 py-2"
                  style={{
                    background: isEmp ? "rgba(228,0,43,0.15)" : "var(--bg-2)",
                    border: isEmp ? "1px solid rgba(228,0,43,0.2)" : "1px solid var(--border-1)",
                    borderBottomRightRadius: isEmp ? 4 : 16,
                    borderBottomLeftRadius: isEmp ? 16 : 4,
                  }}>
                  <p className="text-sm leading-snug" style={{ color: "var(--text-1)" }}>{m.texto}</p>
                  <p className="text-xs mt-1" style={{ color: "#475569" }}>
                    {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    {isEmp && !m.lido && <span className="ml-1" style={{ color: "#64748b" }}>· não lido</span>}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 px-4 py-3 flex gap-2 items-end"
          style={{ borderTop: "1px solid var(--border-1)", background: "var(--bg-2)" }}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            placeholder="Digite uma mensagem..."
            rows={1}
            className="flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--bg-base)", border: "1px solid var(--border-1)",
              color: "var(--text-1)", maxHeight: 100,
            }}
          />
          <button onClick={enviar} disabled={!texto.trim() || sending}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all"
            style={{
              background: texto.trim() ? "rgba(228,0,43,0.15)" : "var(--bg-base)",
              color: texto.trim() ? "#E4002B" : "#374151",
              border: "1px solid " + (texto.trim() ? "rgba(228,0,43,0.2)" : "var(--border-1)"),
            }}>
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
