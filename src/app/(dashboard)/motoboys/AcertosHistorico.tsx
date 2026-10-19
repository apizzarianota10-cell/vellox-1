"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet, Loader2, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  MSG_MIGRATION_ACERTOS, isMigrationAusente, brl, dataSP, periodoLabel, textoRepasse, normalizarAcerto,
} from "@/lib/acertos";
import type { Motoboy, MotoboyAcerto } from "@/types";

interface Props {
  empresaId: string;
  motoboys: Motoboy[];
  /** Mude o valor para forçar recarregar (ex.: após fechar um caixa). */
  refreshKey?: number;
}

type Filtro = "todos" | "pendente" | "pago";

export default function AcertosHistorico({ empresaId, motoboys, refreshKey = 0 }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [acertos, setAcertos] = useState<MotoboyAcerto[]>([]);
  const [loading, setLoading] = useState(true);
  const [semMigration, setSemMigration] = useState(false);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [motoboyFiltro, setMotoboyFiltro] = useState("");
  const [pagando, setPagando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("motoboy_acertos")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      if (isMigrationAusente(error)) setSemMigration(true);
      else setErro("Não foi possível carregar os acertos.");
      setAcertos([]);
    } else {
      setSemMigration(false);
      setErro("");
      setAcertos(((data ?? []) as MotoboyAcerto[]).map(normalizarAcerto));
    }
    setLoading(false);
  }, [supabase, empresaId]);

  useEffect(() => { carregar(); }, [carregar, refreshKey]);

  async function marcarPago(id: string) {
    setPagando(id);
    setErro("");
    const { data, error } = await supabase.rpc("marcar_acerto_pago", { p_acerto_id: id });
    setPagando(null);
    if (error) {
      if (isMigrationAusente(error)) setSemMigration(true);
      else setErro(error.message || "Não foi possível marcar como pago.");
      return;
    }
    const atualizado = normalizarAcerto((Array.isArray(data) ? data[0] : data) as MotoboyAcerto);
    setAcertos((prev) => prev.map((a) => (a.id === id ? atualizado : a)));
  }

  const nomes = useMemo(() => Object.fromEntries(motoboys.map((m) => [m.id, m.nome])), [motoboys]);
  const lista = acertos.filter((a) =>
    (filtro === "todos" || a.status === filtro) && (!motoboyFiltro || a.motoboy_id === motoboyFiltro));
  const pendentes = acertos.filter((a) => a.status === "pendente");
  const saldoPendente = pendentes.reduce((s, a) => s + a.valor_a_repassar, 0);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
      <div className="flex items-center gap-2 px-5 pt-5 pb-3 flex-wrap">
        <Wallet size={16} style={{ color: "#22c55e" }} />
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>Fechamentos de caixa</h2>
        {pendentes.length > 0 && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
            {pendentes.length} pendente{pendentes.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {semMigration ? (
        <div className="mx-5 mb-5 flex items-start gap-2 rounded-xl p-3"
          style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
          <p className="text-xs" style={{ color: "#fbbf24" }}>{MSG_MIGRATION_ACERTOS}</p>
        </div>
      ) : (
        <>
          {pendentes.length > 0 && (
            <p className="text-xs px-5 mb-3" style={{ color: "var(--text-3)" }}>
              Saldo dos pendentes: <span style={{ color: textoRepasse(saldoPendente).cor, fontWeight: 700 }}>{textoRepasse(saldoPendente).texto}</span>
            </p>
          )}

          {/* Filtros */}
          <div className="flex gap-2 px-5 mb-3 flex-wrap">
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--bg-1)" }}>
              {(["todos", "pendente", "pago"] as const).map((f) => (
                <button key={f} onClick={() => setFiltro(f)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={filtro === f
                    ? { background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }
                    : { background: "transparent", color: "var(--text-3)", border: "1px solid transparent" }}>
                  {f === "todos" ? "Todos" : f === "pendente" ? "Pendentes" : "Pagos"}
                </button>
              ))}
            </div>
            {motoboys.length > 1 && (
              <select value={motoboyFiltro} onChange={(e) => setMotoboyFiltro(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs outline-none"
                style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", color: "var(--text-1)" }}>
                <option value="">Todos os motoboys</option>
                {motoboys.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            )}
          </div>

          {erro && (
            <p className="text-xs mx-5 mb-3 px-3 py-2 rounded-lg"
              style={{ background: "rgba(228,0,43,0.08)", color: "#FFC72C", border: "1px solid rgba(228,0,43,0.15)" }}>
              {erro}
            </p>
          )}

          <div style={{ borderTop: "1px solid var(--border-1)" }}>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin" style={{ color: "var(--text-3)" }} /></div>
            ) : lista.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: "var(--text-3)" }}>
                {acertos.length === 0 ? "Nenhum fechamento de caixa ainda. Use o botão \"Fechar caixa\" de um motoboy." : "Nenhum acerto com esses filtros."}
              </p>
            ) : (
              lista.map((a) => {
                const rep = textoRepasse(a.valor_a_repassar);
                const pago = a.status === "pago";
                return (
                  <div key={a.id} className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-1)" }}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>
                            {(a.motoboy_id && nomes[a.motoboy_id]) || a.motoboy_nome || "Motoboy removido"}
                          </p>
                          <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                            style={pago
                              ? { background: "rgba(34,197,94,0.1)", color: "#22c55e" }
                              : { background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
                            {pago ? <CheckCircle size={11} /> : <Clock size={11} />}
                            {pago ? "Pago" : "Pendente"}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                          {periodoLabel(a)} · {a.qtd_entregas} entrega{a.qtd_entregas !== 1 ? "s" : ""}
                          {" · "}taxas {brl(a.total_taxas)} · dinheiro {brl(a.total_dinheiro_recebido)}
                          {a.total_troco > 0 ? ` · troco ${brl(a.total_troco)}` : ""}
                        </p>
                        <p className="text-sm font-bold mt-1" style={{ color: rep.cor }}>{rep.texto}</p>
                        {a.observacao && <p className="text-xs mt-0.5 italic" style={{ color: "var(--text-4)" }}>{a.observacao}</p>}
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-4)" }}>
                          Fechado em {dataSP(a.created_at, true)}{pago && a.pago_em ? ` · pago em ${dataSP(a.pago_em, true)}` : ""}
                        </p>
                      </div>
                      {!pago && (
                        <button onClick={() => marcarPago(a.id)} disabled={pagando === a.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold shrink-0 transition-all"
                          style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>
                          {pagando === a.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                          Marcar como pago
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
