"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Zap, Printer, MessageCircle, ChevronRight,
  CheckCircle, Loader2, AlertCircle, Clock,
} from "lucide-react";

// Confirmação automática por WhatsApp (Z-API) fica pendente por enquanto —
// é uma assinatura paga à parte, e não é pra gerar custo sem decisão
// explícita. O botão de WhatsApp grátis (telefone_contato/wa.me) continua
// ativo normalmente. Pra reativar no futuro: volte pro commit que introduziu
// essa seção (git log -S "Z_API_HABILITADO"), o backend (/api/whatsapp/notificar,
// after() em /api/loja/pedido) já está pronto e não precisa de mudança —
// só falta a UI pra preencher instance_id/token de novo.
const Z_API_HABILITADO = false;

interface Props {
  empresaId: string;
  initialConfig: {
    telefone_contato: string | null;
    whatsapp_instance_id: string | null;
    whatsapp_token: string | null;
  } | null;
  printAgentOnline: boolean;
}

export default function AutomacoesClient({ empresaId, initialConfig, printAgentOnline }: Props) {
  const supabase = createClient();

  const [telefoneContato,  setTelefoneContato]  = useState(initialConfig?.telefone_contato ?? "");
  const [saving,           setSaving]           = useState(false);
  const [saved,            setSaved]            = useState(false);
  const [error,            setError]            = useState("");

  async function salvarWhatsapp() {
    setSaving(true);
    setError("");
    const { error: err } = await supabase
      .from("configuracao_loja")
      .upsert({
        empresa_id: empresaId,
        telefone_contato: telefoneContato.trim() || null,
        // Mantém o que já estava salvo (se um dia foi configurado antes de
        // pausarmos o Z-API) em vez de apagar ao salvar só o telefone.
        whatsapp_instance_id: initialConfig?.whatsapp_instance_id ?? null,
        whatsapp_token: initialConfig?.whatsapp_token ?? null,
      }, { onConflict: "empresa_id" });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="p-4 md:p-6 max-w-lg space-y-4" style={{ background: "var(--bg-base)", minHeight: "100%" }}>

      {/* Header */}
      <div className="mb-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,106,0,0.1)" }}>
            <Zap size={17} style={{ color: "#FF6A00" }} />
          </div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-1)" }}>Automações</h1>
        </div>
        <p className="text-xs" style={{ color: "#64748b" }}>Tudo que roda sozinho quando um pedido chega — impressão e WhatsApp.</p>
      </div>

      {/* Impressão automática */}
      <Link href="/automacoes/impressao"
        className="rounded-2xl p-4 flex items-center justify-between"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)", textDecoration: "none" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,106,0,0.1)" }}>
            <Printer size={17} style={{ color: "#FF6A00" }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Impressão automática</p>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: printAgentOnline ? "#22c55e" : "#94a3b8", flexShrink: 0 }} />
            </div>
            <p className="text-xs" style={{ color: "#64748b" }}>
              {printAgentOnline ? "Agente online" : "Configurar impressora, instalador e atualizador"}
            </p>
          </div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--text-4)", flexShrink: 0 }} />
      </Link>

      {/* WhatsApp */}
      <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(37,211,102,0.12)" }}>
            <MessageCircle size={17} style={{ color: "#25D366" }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>WhatsApp</p>
            <p className="text-xs" style={{ color: "#64748b" }}>Botão de contato pro cliente falar com a loja</p>
          </div>
        </div>

        <label className="text-xs font-semibold block mb-1.5" style={{ color: "#64748b" }}>
          Telefone de contato (grátis)
        </label>
        <input
          value={telefoneContato}
          onChange={e => setTelefoneContato(e.target.value)}
          placeholder="(11) 99999-9999"
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mb-1"
          style={{ border: "1px solid var(--border-1)", color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box" }}
        />
        <p className="text-xs mb-4" style={{ color: "var(--text-4)" }}>
          Aparece como botão &quot;Falar no WhatsApp&quot; na página de acompanhamento do cliente. Não precisa de nenhuma conta paga — é só um link que abre o WhatsApp normal.
        </p>

        <button
          onClick={salvarWhatsapp}
          disabled={saving}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold"
          style={{ background: saved ? "rgba(34,197,94,0.15)" : "#FF6A00", color: saved ? "#4ade80" : "#fff", border: "none", cursor: "pointer" }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : null}
          {saving ? "Salvando…" : saved ? "Salvo!" : "Salvar"}
        </button>
        {error && (
          <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: "#ef4444" }}>
            <AlertCircle size={12} /> {error}
          </p>
        )}

        {!Z_API_HABILITADO && (
          <>
            <div style={{ height: 1, background: "var(--border-1)", margin: "14px 0" }} />
            <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: "var(--bg-input)", border: "1px dashed var(--border-1)" }}>
              <Clock size={14} style={{ color: "var(--text-4)", flexShrink: 0 }} />
              <p className="text-xs" style={{ color: "var(--text-4)" }}>
                Confirmação automática de pedido por WhatsApp (Z-API) — em breve. É uma assinatura paga à parte, por enquanto pausada.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
