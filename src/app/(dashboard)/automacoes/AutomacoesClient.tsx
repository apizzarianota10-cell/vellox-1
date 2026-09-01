"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Zap, Printer, MessageCircle, ChevronRight, ChevronDown,
  CheckCircle, Loader2, ExternalLink, AlertCircle,
} from "lucide-react";

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
  const [instanceId,       setInstanceId]       = useState(initialConfig?.whatsapp_instance_id ?? "");
  const [token,            setToken]            = useState(initialConfig?.whatsapp_token ?? "");
  const [saving,           setSaving]           = useState(false);
  const [saved,            setSaved]            = useState(false);
  const [error,            setError]            = useState("");
  const [tutorialOpen,     setTutorialOpen]     = useState(false);

  async function salvarWhatsapp() {
    setSaving(true);
    setError("");
    const { error: err } = await supabase
      .from("configuracao_loja")
      .upsert({
        empresa_id: empresaId,
        telefone_contato: telefoneContato.trim() || null,
        whatsapp_instance_id: instanceId.trim() || null,
        whatsapp_token: token.trim() || null,
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
            <p className="text-xs" style={{ color: "#64748b" }}>Botão de contato e confirmação automática de pedido</p>
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

        <div style={{ height: 1, background: "var(--border-1)", margin: "0 0 14px" }} />

        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold" style={{ color: "#64748b" }}>
            Confirmação automática (Z-API, pago)
          </label>
          <button onClick={() => setTutorialOpen(v => !v)}
            className="flex items-center gap-1 text-xs font-bold" style={{ color: "#FF6A00", background: "none", border: "none", cursor: "pointer" }}>
            Como conectar <ChevronDown size={12} style={{ transform: tutorialOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
        </div>

        {tutorialOpen && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
            <p className="text-xs mb-2" style={{ color: "var(--text-2)" }}>
              A confirmação automática usa o <strong>Z-API</strong>, um serviço de terceiros que conecta um número de WhatsApp de verdade (via QR code) a um sistema — não é a gente que manda a mensagem, é o Z-API, e ele é pago (assinatura mensal separada da Vellox). Confira o valor atual direto em{" "}
              <a href="https://www.z-api.io" target="_blank" rel="noopener noreferrer" style={{ color: "#FF6A00" }}>z-api.io</a>, não temos como garantir o preço aqui.
            </p>
            <ol className="text-xs space-y-1.5" style={{ color: "var(--text-2)", paddingLeft: 16 }}>
              <li>Crie uma conta em z-api.io e assine um plano.</li>
              <li>Dentro do painel do Z-API, crie uma nova <strong>instância</strong> — isso vai gerar um QR code.</li>
              <li>Escaneie o QR code com o WhatsApp do número que vai atender a loja (mesma forma que você conecta o WhatsApp Web).</li>
              <li>Depois de conectado, copie o <strong>ID da instância</strong> e o <strong>Token</strong> mostrados no painel do Z-API.</li>
              <li>Cole os dois campos abaixo e clique em Salvar.</li>
            </ol>
            <p className="text-xs mt-2" style={{ color: "var(--text-4)" }}>
              Sem preencher os dois campos, tudo continua funcionando normal — só não manda a confirmação automática. O botão de WhatsApp grátis acima não depende disso.
            </p>
          </div>
        )}

        <input
          value={instanceId}
          onChange={e => setInstanceId(e.target.value)}
          placeholder="Instance ID (opcional)"
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mb-2"
          style={{ border: "1px solid var(--border-1)", color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box" }}
        />
        <input
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Token (opcional)"
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
          style={{ border: "1px solid var(--border-1)", color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box" }}
        />

        <button
          onClick={salvarWhatsapp}
          disabled={saving}
          className="flex items-center justify-center gap-2 w-full mt-4 py-2.5 rounded-xl text-sm font-bold"
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
      </div>

      <a href="https://www.z-api.io" target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 text-xs font-semibold" style={{ color: "var(--text-4)", textDecoration: "none" }}>
        Abrir z-api.io <ExternalLink size={11} />
      </a>
    </div>
  );
}
