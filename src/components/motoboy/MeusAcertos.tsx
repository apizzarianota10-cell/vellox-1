"use client";

// Lista os fechamentos de caixa (acertos) do motoboy logado — schema_v69.
// A RLS de motoboy_acertos já restringe aos acertos do próprio motoboy.
import { useEffect, useMemo, useState } from "react";
import { Wallet, Loader2, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  MSG_MIGRATION_ACERTOS, isMigrationAusente, brl, dataSP, periodoLabel, textoRepasseMotoboy, normalizarAcerto,
} from "@/lib/acertos";
import type { MotoboyAcerto } from "@/types";

interface Props {
  /** Opcional: restringe a um motoboy (por padrão a RLS já filtra pelo usuário logado). */
  motoboyId?: string;
  /** Quantidade máxima de acertos exibidos. */
  limite?: number;
}

export default function MeusAcertos({ motoboyId, limite = 30 }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [acertos, setAcertos] = useState<MotoboyAcerto[]>([]);
  const [empresas, setEmpresas] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [semMigration, setSemMigration] = useState(false);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      let query = supabase.from("motoboy_acertos").select("*").order("created_at", { ascending: false }).limit(limite);
      if (motoboyId) query = query.eq("motoboy_id", motoboyId);
      const [{ data, error }, emp] = await Promise.all([query, supabase.rpc("get_motoboy_empresas")]);
      if (!ativo) return;
      if (error) {
        if (isMigrationAusente(error)) setSemMigration(true);
        else setErro(true);
      } else {
        setAcertos(((data ?? []) as MotoboyAcerto[]).map(normalizarAcerto));
      }
      if (!emp.error && Array.isArray(emp.data)) {
        const map: Record<string, string> = {};
        for (const e of emp.data as { empresa_id: string; empresa_nome: string }[]) map[e.empresa_id] = e.empresa_nome;
        setEmpresas(map);
      }
      setLoading(false);
    })();
    return () => { ativo = false; };
  }, [supabase, motoboyId, limite]);

  const multiEmpresa = new Set(acertos.map((a) => a.empresa_id)).size > 1;
  const pendentes = acertos.filter((a) => a.status === "pendente");

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border-1)" }}>
        <Wallet size={14} style={{ color: "#22c55e" }} />
        <p className="text-xs font-bold uppercase tracking-wide flex-1" style={{ color: "#94a3b8" }}>Fechamentos de caixa</p>
        {pendentes.length > 0 && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
            {pendentes.length} pendente{pendentes.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin" style={{ color: "#94a3b8" }} /></div>
      ) : semMigration ? (
        <div className="m-4 flex items-start gap-2 rounded-xl p-3"
          style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
          <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
          <p className="text-xs" style={{ color: "#fbbf24" }}>{MSG_MIGRATION_ACERTOS}</p>
        </div>
      ) : erro ? (
        <p className="text-xs text-center py-6" style={{ color: "#94a3b8" }}>Não foi possível carregar os fechamentos.</p>
      ) : acertos.length === 0 ? (
        <p className="text-xs text-center py-6 px-4" style={{ color: "#94a3b8" }}>
          Nenhum fechamento de caixa ainda. Quando a loja fechar seu caixa, ele aparece aqui.
        </p>
      ) : (
        acertos.map((a, i) => {
          const rep = textoRepasseMotoboy(a.valor_a_repassar);
          const pago = a.status === "pago";
          return (
            <div key={a.id} className="px-4 py-3"
              style={{ borderBottom: i < acertos.length - 1 ? "1px solid var(--border-1)" : "none" }}>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white flex-1 min-w-0 truncate">
                  {periodoLabel(a)}
                  {multiEmpresa && empresas[a.empresa_id] ? ` · ${empresas[a.empresa_id]}` : ""}
                </p>
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                  style={pago
                    ? { background: "rgba(34,197,94,0.1)", color: "#22c55e" }
                    : { background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
                  {pago ? <CheckCircle size={11} /> : <Clock size={11} />}
                  {pago ? "Pago" : "Pendente"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { label: "Entregas", value: String(a.qtd_entregas), color: "#fff" },
                  { label: "Suas taxas", value: brl(a.total_taxas), color: "#fbbf24" },
                  { label: "Dinheiro", value: brl(a.total_dinheiro_recebido), color: "#22c55e" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg px-2 py-1.5" style={{ background: "var(--bg-1)" }}>
                    <p className="text-[10px] uppercase tracking-wide truncate" style={{ color: "#94a3b8" }}>{label}</p>
                    <p className="text-xs font-bold truncate" style={{ color }}>{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm font-bold mt-2" style={{ color: rep.cor }}>{rep.texto}</p>
              {a.total_troco > 0 && (
                <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>Troco entregue aos clientes: {brl(a.total_troco)}</p>
              )}
              {a.observacao && <p className="text-xs mt-0.5 italic" style={{ color: "#94a3b8" }}>{a.observacao}</p>}
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                Fechado em {dataSP(a.created_at, true)}{pago && a.pago_em ? ` · acertado em ${dataSP(a.pago_em, true)}` : ""}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}
