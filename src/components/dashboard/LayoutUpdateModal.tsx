"use client";

import { useEffect, useState } from "react";
import { X, Printer, Play, CheckCircle, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { saveLayout, printOrder, buildTestPedido } from "@/lib/printService";
import type { LayoutOpt } from "@/lib/printService";
import { LAYOUT_PREVIEWS } from "@/lib/printLayoutPreviews";

// Bump esse sufixo (_v1 -> _v2) se um novo aviso de layout precisar
// reaparecer pra quem já viu este.
const SEEN_KEY = "vellox_layout_update_v1_seen";

interface Props {
  empresaId: string;
  empresaNome: string;
}

export default function LayoutUpdateModal({ empresaId, empresaNome }: Props) {
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
    printOrder(buildTestPedido(empresaId), empresaNome);
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
              <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Layouts de impressão atualizados</p>
              <p className="text-xs" style={{ color: "var(--text-4)" }}>Escolha o que fica melhor no seu cupom</p>
            </div>
          </div>
          <button onClick={fechar} style={{ color: "var(--text-4)", flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <p className="text-xs mt-3 mb-4" style={{ color: "var(--text-3)" }}>
          Deixamos os 3 modelos de cupom mais limpos. Imprima um teste em cada um pra ver como sai na sua impressora, e depois selecione o que você quer usar.
        </p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {LAYOUT_PREVIEWS.map(opt => (
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
            {saving ? "Salvando..." : saved ? "Selecionado!" : `Usar o ${LAYOUT_PREVIEWS.find(o => o.id === selected)?.label}`}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <button onClick={fechar} className="text-xs font-semibold" style={{ color: "var(--text-4)" }}>
            Decidir depois
          </button>
          <Link
            href="/automacoes/impressao"
            onClick={fechar}
            className="flex items-center gap-1 text-xs font-semibold"
            style={{ color: "var(--text-4)" }}
          >
            Mais opções (fonte, papel, logo) <ArrowRight size={11} />
          </Link>
        </div>
      </div>
    </div>
  );
}
