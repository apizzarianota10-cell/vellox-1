"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Plus, SlidersHorizontal, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isErroMigracaoPendente, type ProdutoEstoque } from "@/lib/estoque";

interface Props {
  produto: ProdutoEstoque;
  tipo: "entrada" | "ajuste";
  onClose: () => void;
  // Chamado com o saldo previsto (otimista) e depois com o saldo real; em
  // erro é chamado de novo com o saldo anterior pra desfazer.
  onAplicar: (produtoId: string, novoSaldo: number) => void;
  onConcluido: () => void;
}

export default function MovimentarModal({ produto, tipo, onClose, onAplicar, onConcluido }: Props) {
  const [qtd, setQtd]           = useState("");
  const [obs, setObs]           = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]         = useState("");

  const isEntrada = tipo === "entrada";
  const qtdNum = qtd.trim() === "" || qtd.trim() === "-" ? NaN : Number(qtd);
  const qtdValida = Number.isInteger(qtdNum) && (isEntrada ? qtdNum > 0 : true);
  const saldoPrevisto = qtdValida ? (isEntrada ? produto.estoque_qtd + qtdNum : qtdNum) : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !salvando) onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, salvando]);

  async function confirmar() {
    if (!qtdValida || saldoPrevisto === null) return;
    setSalvando(true);
    setErro("");
    const saldoAnterior = produto.estoque_qtd;
    onAplicar(produto.id, saldoPrevisto);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("estoque_movimentar", {
      p_produto_id: produto.id,
      p_tipo: tipo,
      p_quantidade: qtdNum,
      p_observacao: obs.trim() || null,
    });

    if (error) {
      onAplicar(produto.id, saldoAnterior);
      setSalvando(false);
      setErro(isErroMigracaoPendente(error)
        ? "Função de estoque não encontrada no banco — rode o arquivo schema_v67.sql no Supabase (SQL Editor)."
        : `Não foi possível salvar: ${error.message}`);
      return;
    }

    const saldoReal = typeof data === "number" ? data : Number(data);
    onAplicar(produto.id, Number.isFinite(saldoReal) ? saldoReal : saldoPrevisto);
    setSalvando(false);
    onConcluido();
    onClose();
  }

  const accent = isEntrada ? "#22c55e" : "#60a5fa";

  return (
    <div className="fixed inset-0 z-[300] flex items-end md:items-center justify-center"
      onClick={() => { if (!salvando) onClose(); }}
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-5"
        style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", boxShadow: "0 -12px 48px rgba(0,0,0,0.25)", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${accent}1f` }}>
              {isEntrada ? <Plus size={16} style={{ color: accent }} /> : <SlidersHorizontal size={15} style={{ color: accent }} />}
            </div>
            <h2 className="text-base font-bold" style={{ color: "var(--text-1)" }}>
              {isEntrada ? "Entrada de estoque" : "Ajustar saldo"}
            </h2>
          </div>
          <button onClick={onClose} disabled={salvando} style={{ color: "var(--text-4)", background: "var(--bg-2)", border: "none", borderRadius: 10, padding: 7, cursor: "pointer", display: "flex" }}>
            <X size={15} />
          </button>
        </div>
        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-2)" }}>{produto.nome}</p>
        <p className="text-xs mb-4" style={{ color: "var(--text-4)" }}>
          Saldo atual: <strong style={{ color: "var(--text-2)" }}>{produto.estoque_qtd}</strong>
        </p>

        <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--text-3)" }}>
          {isEntrada ? "Quantidade que entrou" : "Novo saldo (quantidade total em estoque)"}
        </label>
        <input
          autoFocus
          type="number"
          inputMode="numeric"
          step={1}
          min={isEntrada ? 1 : undefined}
          value={qtd}
          onChange={e => setQtd(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") confirmar(); }}
          placeholder={isEntrada ? "Ex.: 24" : "Ex.: 10"}
          className="w-full rounded-xl outline-none mb-3"
          style={{ background: "var(--bg-input)", border: "1px solid var(--border-1)", color: "var(--text-1)", padding: "11px 12px", fontSize: 16, fontWeight: 700 }}
        />
        {!isEntrada && (
          <p className="text-xs -mt-1.5 mb-3" style={{ color: "var(--text-4)" }}>
            Pode ser negativo. Use pra corrigir contagem, perdas ou quebra.
          </p>
        )}

        <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--text-3)" }}>Observação (opcional)</label>
        <input
          type="text"
          value={obs}
          onChange={e => setObs(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") confirmar(); }}
          maxLength={200}
          placeholder={isEntrada ? "Ex.: compra do fornecedor" : "Ex.: contagem de fim de turno"}
          className="w-full rounded-xl outline-none mb-3"
          style={{ background: "var(--bg-input)", border: "1px solid var(--border-1)", color: "var(--text-1)", padding: "10px 12px", fontSize: 13 }}
        />

        {saldoPrevisto !== null && (
          <div className="flex items-center justify-between px-3 py-2 rounded-xl mb-3" style={{ background: "var(--overlay-sm)", border: "1px solid var(--border-1)" }}>
            <span className="text-xs" style={{ color: "var(--text-3)" }}>Saldo após</span>
            <span className="text-sm font-black" style={{ color: saldoPrevisto <= 0 ? "#E4002B" : "var(--text-1)" }}>{saldoPrevisto}</span>
          </div>
        )}

        {erro && (
          <div className="flex items-start gap-2 p-3 rounded-xl mb-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
            <p className="text-xs" style={{ color: "#f87171" }}>{erro}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} disabled={salvando}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: "var(--overlay-sm)", border: "1px solid var(--border-1)", color: "var(--text-2)" }}>
            Cancelar
          </button>
          <button onClick={confirmar} disabled={!qtdValida || salvando}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: accent, color: "#fff", opacity: !qtdValida || salvando ? 0.5 : 1 }}>
            {salvando && <Loader2 size={14} className="animate-spin" />}
            {salvando ? "Salvando…" : isEntrada ? "Confirmar entrada" : "Confirmar ajuste"}
          </button>
        </div>
      </div>
    </div>
  );
}
