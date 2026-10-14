"use client";

import { useEffect, useState } from "react";
import { X, Printer, Play, CheckCircle, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { saveLayout, printOrder, buildTestPedido } from "@/lib/printService";
import type { LayoutOpt, FonteOpt } from "@/lib/printService";
import { buildLayoutPreviews } from "@/lib/printLayoutPreviews";

// Bump esse sufixo (_v1 -> _v2 -> ...) se um novo aviso de layout precisar
// reaparecer pra quem já viu este. v2: corrigida a divergência entre
// impressão automática e reimpressão (liam fontes diferentes). v3: corrigido
// o agente de impressão desktop (servidor.ps1) cortando valores e trocando
// acento por caractere errado — precisa rodar o atualizador pra pegar isso.
// v4: sabores um abaixo do outro (agente v10). v5: nome/sabores em altura
// dupla e destaque que nao cabe desce de tamanho sozinho (agente v11).
// v6: cupom inteiro num tamanho so (config "Tamanho da letra"), sabores numerados (agente v13).
// v7: fonte proporcional (sem letra esticada) e bloco MEIO A MEIO (agente v14).
const SEEN_KEY = "vellox_layout_update_v7_seen";

interface Props {
  empresaId: string;
  empresaNome: string;
  fonte?: FonteOpt;
}

export default function LayoutUpdateModal({ empresaId, empresaNome, fonte }: Props) {
  const previews = buildLayoutPreviews(fonte);
  const [open,     setOpen]     = useState(false);
  const [selected, setSelected] = useState<LayoutOpt>("classico");
  const [testing,  setTesting]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== "1") setOpen(true);
    } catch { /* localStorage indisponível — não incomoda */ }
  }, []);

  function fechar() {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
    setOpen(false);
  }

  function handleTest() {
    setTesting(true);
    saveLayout(selected);
    printOrder(buildTestPedido(empresaId), empresaNome, undefined, selected, fonte);
    setTimeout(() => setTesting(false), 700);
  }

  async function handleSelect() {
    setSaving(true);
    setError("");
    saveLayout(selected);
    const supabase = createClient();
    const { error: dbError } = await supabase.from("configuracoes_print_agent")
      .upsert({ empresa_id: empresaId, layout: selected }, { onConflict: "empresa_id" });
    setSaving(false);
    if (dbError) {
      setError("Não salvou no banco: " + dbError.message);
      return;
    }
    setSaved(true);
    setTimeout(fechar, 900);
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 460, maxHeight: "92vh", overflowY: "auto",
          background: "var(--bg-1)", border: "1px solid var(--border-1)",
          borderRadius: 16, padding: 20,
        }}
      >
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--border-1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Printer size={16} style={{ color: "#E4002B" }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Cupom impresso atualizado</p>
              <p className="text-xs" style={{ color: "var(--text-4)" }}>Cupom novo: letra mais bonita e meio a meio claro</p>
            </div>
          </div>
          <button onClick={fechar} style={{ color: "var(--text-4)", flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <p className="text-xs mt-3 mb-4" style={{ color: "var(--text-3)" }}>
          O cupom inteiro agora sai num tamanho só, que você escolhe em Configurações → "Tamanho da letra". A letra não sai mais esticada, e pizza com mais de um sabor mostra "MEIO A MEIO" com cada metade numa linha (1/2 Calabresa, 1/2 Mussarela). <strong>Pra isso valer no computador da impressora, baixe o atualizador abaixo</strong> (depois dele, as próximas atualizações chegam sozinhas). Aproveite e confirme o layout.
        </p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {previews.map(opt => (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              className="rounded-xl overflow-hidden text-left transition-all"
              style={{ border: `2px solid ${selected === opt.id ? "#E4002B" : "var(--border-1)"}`, background: selected === opt.id ? "rgba(228,0,43,0.06)" : "var(--overlay-sm)", padding: 0 }}
            >
              <div style={{ background: "#fff", minHeight: 90 }}>{opt.preview}</div>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span style={{ fontSize: 11, fontWeight: 700, color: selected === opt.id ? "#E4002B" : "var(--text-2)" }}>{opt.label}</span>
                {selected === opt.id && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E4002B" }} />}
              </div>
            </button>
          ))}
        </div>

        {error && (
          <p className="text-xs mb-3" style={{ color: "#ef4444" }}>{error}</p>
        )}

        <div className="flex gap-2 mb-3">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl text-xs font-bold"
            style={{ background: "var(--overlay-sm)", border: "1px solid var(--border-1)", color: "var(--text-1)", opacity: testing ? 0.6 : 1 }}
          >
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {testing ? "Imprimindo..." : "Imprimir teste"}
          </button>
          <button
            onClick={handleSelect}
            disabled={saving}
            className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl text-xs font-bold"
            style={{ background: saved ? "rgba(34,197,94,0.15)" : "#E4002B", border: "none", color: saved ? "#4ade80" : "#fff", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle size={13} /> : null}
            {saving ? "Salvando..." : saved ? "Selecionado!" : `Usar o ${previews.find(o => o.id === selected)?.label}`}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <button onClick={fechar} className="text-xs font-semibold" style={{ color: "var(--text-4)" }}>
            Decidir depois
          </button>
          <Link
            href="/automacoes/impressao"
            onClick={fechar}
            className="flex items-center gap-1 text-xs font-bold"
            style={{ color: "#E4002B" }}
          >
            Baixar atualizador do agente <ArrowRight size={11} />
          </Link>
        </div>
      </div>
    </div>
  );
}
