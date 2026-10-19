"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Wallet, AlertTriangle, CheckCircle, Package, Banknote } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  MSG_MIGRATION_ACERTOS, isMigrationAusente, hojeSP, inicioDiaSP, fimExclusivoSP,
  brl, dataSP, textoRepasse, normalizarAcerto,
} from "@/lib/acertos";
import type { Motoboy, MotoboyAcerto } from "@/types";

interface PedidoPrevia {
  id: string;
  cliente_nome: string;
  endereco_entrega: string;
  valor_pedido: number | null;
  valor_motoboy: number | null;
  forma_pagamento: string | null;
  troco_para: number | null;
  created_at: string;
}

const FORMA_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao_credito: "Crédito",
  cartao_debito: "Débito",
  ja_pago: "Já pago",
};

interface Props {
  motoboy: Motoboy;
  empresaId: string;
  onClose: () => void;
  onFechado?: (acerto: MotoboyAcerto) => void;
}

export default function FecharCaixaModal({ motoboy, empresaId, onClose, onFechado }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [dataInicio, setDataInicio] = useState(hojeSP);
  const [dataFim, setDataFim] = useState(hojeSP);
  const [observacao, setObservacao] = useState("");
  const [pedidos, setPedidos] = useState<PedidoPrevia[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [semMigration, setSemMigration] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<MotoboyAcerto | null>(null);

  const periodoInvalido = !dataInicio || !dataFim || dataFim < dataInicio;

  useEffect(() => {
    if (periodoInvalido) { setPedidos([]); setLoading(false); return; }
    let ativo = true;
    (async () => {
      setLoading(true);
      setErro("");
      // Mesmo filtro do RPC fechar_acerto_motoboy
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, cliente_nome, endereco_entrega, valor_pedido, valor_motoboy, forma_pagamento, troco_para, created_at")
        .eq("empresa_id", empresaId)
        .eq("motoboy_id", motoboy.id)
        .eq("status", "entregue")
        .is("acerto_id", null)
        .gte("created_at", inicioDiaSP(dataInicio))
        .lt("created_at", fimExclusivoSP(dataFim))
        .order("created_at", { ascending: true });
      if (!ativo) return;
      if (error) {
        if (isMigrationAusente(error)) setSemMigration(true);
        else setErro("Não foi possível carregar as entregas. Tente novamente.");
        setPedidos([]);
      } else {
        setPedidos((data ?? []) as PedidoPrevia[]);
      }
      setLoading(false);
    })();
    return () => { ativo = false; };
  }, [supabase, empresaId, motoboy.id, dataInicio, dataFim, periodoInvalido]);

  const resumo = useMemo(() => {
    let taxas = 0, dinheiro = 0, troco = 0;
    for (const p of pedidos) {
      const valor = Number(p.valor_pedido) || 0;
      taxas += Number(p.valor_motoboy) || 0;
      if (p.forma_pagamento === "dinheiro") {
        dinheiro += valor;
        const t = Number(p.troco_para) || 0;
        if (t > valor) troco += t - valor;
      }
    }
    return { qtd: pedidos.length, taxas, dinheiro, troco, repassar: dinheiro - taxas };
  }, [pedidos]);

  async function confirmar() {
    if (periodoInvalido || resumo.qtd === 0) return;
    setConfirmando(true);
    setErro("");
    const { data, error } = await supabase.rpc("fechar_acerto_motoboy", {
      p_motoboy_id: motoboy.id,
      p_inicio: inicioDiaSP(dataInicio),
      p_fim: fimExclusivoSP(dataFim),
      p_observacao: observacao.trim() || null,
    });
    setConfirmando(false);
    if (error) {
      if (isMigrationAusente(error)) setSemMigration(true);
      else setErro(error.message || "Não foi possível fechar o caixa.");
      return;
    }
    const acerto = normalizarAcerto((Array.isArray(data) ? data[0] : data) as MotoboyAcerto);
    setResultado(acerto);
    onFechado?.(acerto);
  }

  const repasse = textoRepasse(resultado ? resultado.valor_a_repassar : resumo.repassar);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 px-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && !confirmando && onClose()}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-1)" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(34,197,94,0.1)" }}>
            <Wallet size={18} style={{ color: "#22c55e" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold" style={{ color: "var(--text-1)" }}>Fechar caixa</p>
            <p className="text-xs truncate" style={{ color: "var(--text-3)" }}>{motoboy.nome}</p>
          </div>
          <button onClick={onClose} disabled={confirmando} style={{ color: "var(--text-3)" }} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {semMigration ? (
          <div className="p-5">
            <div className="flex items-start gap-2 rounded-xl p-3"
              style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
              <p className="text-xs" style={{ color: "#fbbf24" }}>{MSG_MIGRATION_ACERTOS}</p>
            </div>
          </div>
        ) : resultado ? (
          <div className="p-5 space-y-4">
            <div className="flex flex-col items-center text-center gap-2 py-2">
              <CheckCircle size={36} style={{ color: "#22c55e" }} />
              <p className="font-bold" style={{ color: "var(--text-1)" }}>Caixa fechado</p>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                {resultado.qtd_entregas} entrega{resultado.qtd_entregas !== 1 ? "s" : ""} · acerto registrado como pendente
              </p>
            </div>
            <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
              <p className="text-lg font-black" style={{ color: repasse.cor }}>{repasse.texto}</p>
            </div>
            <button onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-bold"
              style={{ background: "linear-gradient(135deg, #A80021, #a84400)", color: "var(--text-1)" }}>
              Concluir
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              {/* Período */}
              <div className="grid grid-cols-2 gap-3 px-5 pt-4">
                {[
                  { label: "De", value: dataInicio, set: setDataInicio },
                  { label: "Até", value: dataFim, set: setDataFim },
                ].map(({ label, value, set }) => (
                  <label key={label} className="block">
                    <span className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-3)" }}>{label}</span>
                    <input type="date" value={value} max={hojeSP()}
                      onChange={(e) => set(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg-base)", border: "1px solid var(--border-1)", color: "var(--text-1)", colorScheme: "dark light" }} />
                  </label>
                ))}
              </div>
              {periodoInvalido && (
                <p className="text-xs px-5 mt-2" style={{ color: "#FFC72C" }}>A data final deve ser igual ou posterior à inicial.</p>
              )}
              <p className="text-xs px-5 mt-2" style={{ color: "var(--text-4)" }}>
                Considera pedidos entregues criados no período (horário de Brasília) que ainda não entraram em outro acerto.
              </p>

              {/* Prévia */}
              <div className="grid grid-cols-2 gap-2 px-5 py-4">
                {[
                  { label: "Entregas", value: String(resumo.qtd), color: "#60a5fa" },
                  { label: "Taxas do motoboy", value: brl(resumo.taxas), color: "#fbbf24" },
                  { label: "Dinheiro recebido", value: brl(resumo.dinheiro), color: "#22c55e" },
                  { label: "Troco entregue", value: brl(resumo.troco), color: "var(--text-2)" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                    <p className="text-xs mb-0.5 truncate" style={{ color: "var(--text-4)" }}>{label}</p>
                    <p className="text-base font-black" style={{ color }}>{loading ? "…" : value}</p>
                  </div>
                ))}
              </div>

              <div className="mx-5 rounded-xl p-4 text-center" style={{ background: "var(--bg-2)", border: `1px solid var(--border-1)` }}>
                <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>A repassar</p>
                <p className="text-lg font-black" style={{ color: repasse.cor }}>{loading ? "…" : repasse.texto}</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-4)" }}>Dinheiro recebido − taxas do motoboy</p>
              </div>

              {/* Lista de pedidos */}
              <div className="mt-4" style={{ borderTop: "1px solid var(--border-1)" }}>
                {loading ? (
                  <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin" style={{ color: "var(--text-3)" }} /></div>
                ) : pedidos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <Package size={28} style={{ color: "var(--text-5)" }} />
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>Nenhuma entrega pendente de acerto neste período</p>
                  </div>
                ) : (
                  pedidos.map((p) => {
                    const dinheiro = p.forma_pagamento === "dinheiro";
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-5 py-2.5" style={{ borderBottom: "1px solid var(--border-1)" }}>
                        {dinheiro
                          ? <Banknote size={14} className="shrink-0" style={{ color: "#22c55e" }} />
                          : <div className="w-3.5 h-3.5 shrink-0 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--text-4)" }} /></div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>{p.cliente_nome}</p>
                          <p className="text-xs truncate" style={{ color: "var(--text-3)" }}>
                            {dataSP(p.created_at, true)} · {FORMA_LABEL[p.forma_pagamento ?? ""] ?? (p.forma_pagamento || "Sem forma")}
                            {dinheiro && Number(p.troco_para) > Number(p.valor_pedido) ? ` · troco p/ ${brl(p.troco_para)}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold" style={{ color: dinheiro ? "#22c55e" : "var(--text-2)" }}>{brl(p.valor_pedido)}</p>
                          <p className="text-xs" style={{ color: "#fbbf24" }}>taxa {brl(p.valor_motoboy)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="px-5 py-4">
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-3)" }}>Observação (opcional)</label>
                <input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300}
                  placeholder="ex: turno da noite"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: "var(--bg-base)", border: "1px solid var(--border-1)", color: "var(--text-1)" }} />
              </div>
            </div>

            {/* Rodapé */}
            <div className="px-5 py-4 shrink-0 space-y-3" style={{ borderTop: "1px solid var(--border-1)" }}>
              {erro && (
                <p className="text-xs px-3 py-2 rounded-lg"
                  style={{ background: "rgba(228,0,43,0.08)", color: "#FFC72C", border: "1px solid rgba(228,0,43,0.15)" }}>
                  {erro}
                </p>
              )}
              <div className="flex gap-3">
                <button onClick={onClose} disabled={confirmando}
                  className="flex-1 py-3 rounded-xl text-sm font-medium"
                  style={{ border: "1px solid var(--border-1)", color: "var(--text-3)" }}>
                  Cancelar
                </button>
                <button onClick={confirmar}
                  disabled={confirmando || loading || periodoInvalido || resumo.qtd === 0}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
                  style={{
                    background: resumo.qtd === 0 || periodoInvalido ? "rgba(71,85,105,0.3)" : "linear-gradient(135deg, #16a34a, #15803d)",
                    color: resumo.qtd === 0 || periodoInvalido ? "var(--text-3)" : "#fff",
                    cursor: resumo.qtd === 0 || periodoInvalido ? "not-allowed" : "pointer",
                  }}>
                  {confirmando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  {confirmando ? "Fechando..." : "Confirmar fechamento"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
