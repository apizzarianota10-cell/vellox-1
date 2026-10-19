"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Loader2, History, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MOVIMENTO_SELECT, isErroMigracaoPendente, type MovimentoEstoque, type ProdutoEstoque } from "@/lib/estoque";
import MovimentoLinha from "./MovimentoLinha";

const PAGINA = 50;

interface Props {
  produto: ProdutoEstoque;
  empresaId: string;
  onClose: () => void;
}

export default function HistoricoModal({ produto, empresaId, onClose }: Props) {
  const [itens, setItens]           = useState<MovimentoEstoque[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [fim, setFim]               = useState(false);
  const [erro, setErro]             = useState("");

  const carregar = useCallback(async (offset: number) => {
    setCarregando(true);
    setErro("");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("estoque_movimentos")
      .select(MOVIMENTO_SELECT)
      .eq("empresa_id", empresaId)
      .eq("produto_id", produto.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGINA - 1);
    setCarregando(false);
    if (error) {
      setErro(isErroMigracaoPendente(error)
        ? "Tabela de movimentações não encontrada — rode o schema_v67.sql no Supabase."
        : `Erro ao carregar histórico: ${error.message}`);
      return;
    }
    const novos = (data ?? []) as unknown as MovimentoEstoque[];
    setItens(prev => offset === 0 ? novos : [...prev, ...novos]);
    setFim(novos.length < PAGINA);
  }, [empresaId, produto.id]);

  useEffect(() => { carregar(0); }, [carregar]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[300] flex items-end md:items-center justify-center"
      onClick={onClose}
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full md:max-w-lg rounded-t-3xl md:rounded-2xl flex flex-col"
        style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", boxShadow: "0 -12px 48px rgba(0,0,0,0.25)", maxHeight: "85dvh" }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ borderBottom: "1px solid var(--border-1)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(167,139,250,0.15)" }}>
              <History size={15} style={{ color: "#a78bfa" }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-tight" style={{ color: "var(--text-1)" }}>Histórico</h2>
              <p className="text-xs truncate" style={{ color: "var(--text-3)" }}>{produto.nome} · saldo atual {produto.estoque_qtd}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-4)", background: "var(--bg-2)", border: "none", borderRadius: 10, padding: 7, cursor: "pointer", display: "flex" }}>
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {erro && (
            <div className="flex items-start gap-2 m-4 p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs" style={{ color: "#f87171" }}>{erro}</p>
            </div>
          )}
          {!erro && !carregando && itens.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <History size={24} style={{ color: "var(--text-5)" }} />
              <p className="text-xs" style={{ color: "var(--text-4)" }}>Nenhuma movimentação ainda.</p>
            </div>
          )}
          {itens.map(m => <MovimentoLinha key={m.id} m={m} />)}
          {carregando && (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2 size={15} className="animate-spin" style={{ color: "var(--text-4)" }} />
              <span className="text-xs" style={{ color: "var(--text-4)" }}>Carregando…</span>
            </div>
          )}
          {!carregando && !fim && !erro && (
            <div className="p-3">
              <button onClick={() => carregar(itens.length)}
                className="w-full py-2.5 rounded-xl text-xs font-bold"
                style={{ background: "var(--overlay-sm)", border: "1px solid var(--border-1)", color: "var(--text-2)" }}>
                Carregar mais
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
