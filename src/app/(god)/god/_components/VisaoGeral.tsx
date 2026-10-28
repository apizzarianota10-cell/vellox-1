"use client";

import { useState } from "react";
import { Building2, ShoppingBag, Wallet, Bike, Sparkles, CalendarDays, AlertTriangle, ChevronRight } from "lucide-react";
import {
  Kpi, Seg, Secao, GraficoDias, Carregando, Aviso, Vazio, useJson,
  fmtBRL, fmtBRLCurto, fmtNum, fmtData, diasRestantes, type PontoSerie,
} from "./ui";

interface Overview {
  rotulo: string;
  parcial: boolean;
  kpis: {
    lojas_total: number; lojas_ativas: number; novas_lojas: number;
    pedidos_hoje: number; pedidos_mes: number; pedidos_periodo: number; pedidos_total: number | null;
    faturamento_hoje: number; faturamento_mes: number; faturamento_periodo: number;
    ticket_medio: number; cancelados_periodo: number;
    motoboys_total: number; motoboys_ativos: number; motoboys_em_entrega: number;
  };
  serie: PontoSerie[];
  top_lojas: { id: string; nome: string; pedidos: number; faturamento: number }[];
  expirando: { id: string; nome: string; expira_em: string }[];
  vencidas_ativas: { id: string; nome: string; expira_em: string }[];
}

type Per = "7" | "30" | "90" | "mes";

export default function VisaoGeral({ abrirLoja }: { abrirLoja: (id: string) => void }) {
  const [periodo, setPeriodo] = useState<Per>("30");
  const [metrica, setMetrica] = useState<"pedidos" | "faturamento">("pedidos");
  const { data, loading, error } = useJson<Overview>(`/api/god/overview?periodo=${periodo}`);
  const k = data?.kpis;

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm gd-muted">{data?.rotulo ?? "Carregando período..."}</p>
        <Seg<Per> value={periodo} onChange={setPeriodo}
          options={[{ v: "7", l: "7 dias" }, { v: "30", l: "30 dias" }, { v: "90", l: "90 dias" }, { v: "mes", l: "Mês atual" }]} />
      </div>

      {error && <Aviso tom="red" titulo="Não foi possível carregar a visão geral">{error}</Aviso>}
      {data?.parcial && <Aviso titulo="Período muito grande">Os números consideram os primeiros 200 mil pedidos do período.</Aviso>}

      {!k && loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="gd-skel" style={{ height: 112 }} />)}
        </div>
      ) : k && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3" style={{ opacity: loading ? 0.6 : 1, transition: "opacity .2s" }}>
          <Kpi label="Lojas ativas" icone={<Building2 size={16} />} valor={fmtNum(k.lojas_ativas)} sub={`de ${fmtNum(k.lojas_total)} cadastradas`} />
          <Kpi label="Pedidos hoje" icone={<ShoppingBag size={16} />} valor={fmtNum(k.pedidos_hoje)} sub={fmtBRL(k.faturamento_hoje)} />
          <Kpi label="Pedidos no mês" icone={<CalendarDays size={16} />} valor={fmtNum(k.pedidos_mes)} sub={fmtBRLCurto(k.faturamento_mes)} />
          <Kpi destaque label="Faturamento" icone={<Wallet size={16} />} valor={fmtBRLCurto(k.faturamento_periodo)}
            sub={`${fmtNum(k.pedidos_periodo)} pedidos · ticket ${fmtBRL(k.ticket_medio)}`} />
          <Kpi label="Motoboys ativos" icone={<Bike size={16} />} valor={fmtNum(k.motoboys_ativos)} sub={`${k.motoboys_em_entrega} em entrega · ${k.motoboys_total} no total`} />
          <Kpi label="Novas lojas" icone={<Sparkles size={16} />} valor={fmtNum(k.novas_lojas)} sub="no período" />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5">
        <Secao className="xl:col-span-2" titulo={metrica === "pedidos" ? "Pedidos por dia" : "Faturamento por dia"}
          acao={<Seg value={metrica} onChange={setMetrica} options={[{ v: "pedidos", l: "Pedidos" }, { v: "faturamento", l: "R$" }]} />}>
          <div className="px-2 md:px-4 pb-4 pt-4">
            {data ? <GraficoDias serie={data.serie} metrica={metrica} altura={220} /> : <div className="gd-skel" style={{ height: 220 }} />}
          </div>
          {k && (
            <div className="grid grid-cols-3 text-center" style={{ borderTop: "1px solid var(--line)" }}>
              {[
                { l: "Pedidos", v: fmtNum(k.pedidos_periodo) },
                { l: "Cancelados", v: fmtNum(k.cancelados_periodo) },
                { l: "Total histórico", v: k.pedidos_total != null ? fmtNum(k.pedidos_total) : "—" },
              ].map((c, i) => (
                <div key={c.l} className="py-3 px-2" style={i ? { borderLeft: "1px solid var(--line)" } : undefined}>
                  <p className="gd-label" style={{ fontSize: 10 }}>{c.l}</p>
                  <p className="font-extrabold mt-0.5" style={{ fontSize: 16 }}>{c.v}</p>
                </div>
              ))}
            </div>
          )}
        </Secao>

        <Secao titulo="Top lojas do período">
          {!data ? <Carregando /> : data.top_lojas.length === 0 ? <Vazio texto="Sem pedidos no período." /> : (
            <ol className="gd-divide pb-1">
              {data.top_lojas.map((l, i) => {
                const max = data.top_lojas[0].faturamento || 1;
                return (
                  <li key={l.id} className="gd-row px-4 md:px-5 py-3" onClick={() => abrirLoja(l.id)}>
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-sm font-extrabold" style={{ color: i === 0 ? "var(--red)" : "var(--faint)" }}>{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate">{l.nome}</p>
                        <div className="gd-bar mt-1.5" style={{ height: 5 }}><span style={{ width: `${(l.faturamento / max) * 100}%`, opacity: i === 0 ? 1 : 0.55 }} /></div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-extrabold">{fmtBRLCurto(l.faturamento)}</p>
                        <p className="text-xs gd-muted">{fmtNum(l.pedidos)} ped.</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Secao>
      </div>

      {data && (data.expirando.length > 0 || data.vencidas_ativas.length > 0) && (
        <Secao titulo={<span className="flex items-center gap-2"><AlertTriangle size={16} style={{ color: "var(--warn)" }} /> Assinaturas que pedem atenção</span>}>
          <ul className="gd-divide">
            {[...data.vencidas_ativas.map(e => ({ ...e, vencida: true })), ...data.expirando.map(e => ({ ...e, vencida: false }))].map(e => {
              const d = diasRestantes(e.expira_em);
              return (
                <li key={e.id + e.vencida} className="gd-row flex items-center gap-3 px-4 md:px-5 py-3" onClick={() => abrirLoja(e.id)}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{e.nome}</p>
                    <p className="text-xs gd-muted">{e.vencida ? `Venceu em ${fmtData(e.expira_em)} e continua marcada como ativa` : `Vence em ${fmtData(e.expira_em)}`}</p>
                  </div>
                  <span className="gd-badge" style={{ color: "var(--warn)", background: "var(--warn-soft)" }}>{e.vencida ? "Vencida" : `${d}d`}</span>
                  <ChevronRight size={16} style={{ color: "var(--faint)" }} />
                </li>
              );
            })}
          </ul>
        </Secao>
      )}
    </div>
  );
}
