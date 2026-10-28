"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy, Medal, Building2, Bike, Star } from "lucide-react";
import {
  Seg, Secao, Avatar, PlanoBadge, Carregando, Vazio, Aviso, useJson, fmtBRL, fmtBRLCurto, fmtNum,
  type AlvoPremiacao, type Premiacao,
} from "./ui";
import { PremiacaoLista } from "./Premiacoes";

type Per = "7" | "30" | "90" | "mes";
interface RLoja { id: string; nome: string; plano: string; pedidos: number; faturamento: number; cancelados: number; ticket_medio: number }
interface RMb { id: string; nome: string; foto_url: string | null; avaliacao: number | null; empresa_nome: string | null; lojas: number; entregas: number; ganhos: number }
interface RankingResp { rotulo: string; parcial: boolean; lojas: RLoja[]; motoboys: RMb[] }

const COR_POS = ["var(--gold)", "var(--silver)", "var(--bronze)"];

export default function Ranking({ abrirLoja, abrirMotoboy, premiar, versao, toast }: {
  abrirLoja: (id: string) => void; abrirMotoboy: (id: string) => void; premiar: (a: AlvoPremiacao) => void;
  versao: number; toast: (t: string, erro?: boolean) => void;
}) {
  const [periodo, setPeriodo] = useState<Per>("30");
  const [alvo, setAlvo] = useState<"lojas" | "motoboys">("lojas");
  const [mLoja, setMLoja] = useState<"faturamento" | "pedidos">("faturamento");
  const [mMb, setMMb] = useState<"entregas" | "ganhos">("entregas");
  const { data, loading, error } = useJson<RankingResp>(`/api/god/ranking?periodo=${periodo}`);
  const hist = useJson<{ migracao_pendente: boolean; premiacoes: Premiacao[] }>("/api/god/premiacoes");
  const { reload: recarregarHist } = hist;
  useEffect(() => { if (versao) recarregarHist(); }, [versao, recarregarHist]);

  const lojas = useMemo(() => [...(data?.lojas ?? [])].sort((a, b) => b[mLoja] - a[mLoja]).slice(0, 50), [data, mLoja]);
  const mbs = useMemo(() => [...(data?.motoboys ?? [])].sort((a, b) => b[mMb] - a[mMb]).slice(0, 50), [data, mMb]);
  const rotulo = data?.rotulo ?? "";

  const tituloLoja = (i: number) => `${i + 1}º lugar em ${mLoja === "faturamento" ? "faturamento" : "pedidos"} · ${rotulo}`;
  const tituloMb = (i: number) => `${i + 1}º lugar em ${mMb === "entregas" ? "entregas" : "ganhos"} · ${rotulo}`;

  type Item = { id: string; nome: string; foto?: string | null; sub: React.ReactNode; valor: string; extra: string; abrir: () => void; premiar: () => void };
  const itens: Item[] = alvo === "lojas"
    ? lojas.map((l, i) => ({
        id: l.id, nome: l.nome, sub: <PlanoBadge plano={l.plano} />,
        valor: mLoja === "faturamento" ? fmtBRLCurto(l.faturamento) : `${fmtNum(l.pedidos)} ped.`,
        extra: mLoja === "faturamento" ? `${fmtNum(l.pedidos)} pedidos · ticket ${fmtBRL(l.ticket_medio)}` : `${fmtBRL(l.faturamento)} · ${l.cancelados} canc.`,
        abrir: () => abrirLoja(l.id),
        premiar: () => premiar({ tipo: "empresa", id: l.id, nome: l.nome, tituloSugerido: tituloLoja(i), periodoRef: rotulo }),
      }))
    : mbs.map((m, i) => ({
        id: m.id, nome: m.nome, foto: m.foto_url,
        sub: <span className="text-xs gd-muted truncate">{m.empresa_nome ?? `${m.lojas} lojas`}{m.avaliacao != null ? <> · <Star size={10} fill="currentColor" style={{ color: "var(--gold)", display: "inline", verticalAlign: "-1px" }} /> {m.avaliacao.toFixed(1)}</> : null}</span>,
        valor: mMb === "entregas" ? `${fmtNum(m.entregas)} entr.` : fmtBRL(m.ganhos),
        extra: mMb === "entregas" ? fmtBRL(m.ganhos) : `${fmtNum(m.entregas)} entregas`,
        abrir: () => abrirMotoboy(m.id),
        premiar: () => premiar({ tipo: "motoboy", id: m.id, nome: m.nome, tituloSugerido: tituloMb(i), periodoRef: rotulo }),
      }));

  const top3 = itens.slice(0, 3);
  const resto = itens.slice(3);

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <Seg<"lojas" | "motoboys"> value={alvo} onChange={setAlvo} options={[{ v: "lojas", l: "Lojas" }, { v: "motoboys", l: "Motoboys" }]} />
        <Seg<Per> value={periodo} onChange={setPeriodo}
          options={[{ v: "7", l: "7d" }, { v: "30", l: "30d" }, { v: "90", l: "90d" }, { v: "mes", l: "Mês" }]} />
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm gd-muted">{rotulo}</p>
        {alvo === "lojas"
          ? <Seg value={mLoja} onChange={setMLoja} options={[{ v: "faturamento", l: "Por faturamento" }, { v: "pedidos", l: "Por pedidos" }]} />
          : <Seg value={mMb} onChange={setMMb} options={[{ v: "entregas", l: "Por entregas" }, { v: "ganhos", l: "Por ganhos" }]} />}
      </div>

      {error && <Aviso tom="red" titulo="Erro ao carregar o ranking">{error}</Aviso>}
      {data?.parcial && <Aviso titulo="Período muito grande">Ranking calculado sobre os primeiros 200 mil pedidos.</Aviso>}

      {!data && loading ? <Carregando /> : itens.length === 0 ? (
        <div className="gd-card"><Vazio texto="Sem movimento no período." icone={alvo === "lojas" ? <Building2 size={24} /> : <Bike size={24} />} /></div>
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity .2s" }} className="space-y-4">
          {/* Pódio */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {top3.map((it, i) => (
              <div key={it.id} className="gd-card p-4 relative overflow-hidden" style={i === 0 ? { borderColor: "color-mix(in srgb, var(--gold) 45%, var(--line))" } : undefined}>
                <div className="flex items-center gap-3 cursor-pointer" onClick={it.abrir}>
                  <div className="relative">
                    <Avatar nome={it.nome} foto={it.foto} size={46} quadrado={alvo === "lojas"} />
                    <span className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full text-[11px] font-black"
                      style={{ width: 22, height: 22, background: COR_POS[i], color: "#fff", border: "2px solid var(--card)" }}>{i + 1}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold truncate">{it.nome}</p>
                    <div className="mt-0.5 min-w-0 truncate">{it.sub}</div>
                  </div>
                  {i === 0 && <Trophy size={20} style={{ color: "var(--gold)" }} />}
                  {i > 0 && <Medal size={18} style={{ color: COR_POS[i] }} />}
                </div>
                <p className="mt-3 font-extrabold" style={{ fontSize: 24, letterSpacing: "-0.03em" }}>{it.valor}</p>
                <p className="text-xs gd-muted truncate">{it.extra}</p>
                <button className="gd-btn gd-btn-sm w-full mt-3" onClick={it.premiar}>
                  <Trophy size={13} style={{ color: "var(--gold)" }} /> Enviar premiação
                </button>
              </div>
            ))}
          </div>

          {resto.length > 0 && (
            <div className="gd-card overflow-hidden">
              <ol className="gd-divide">
                {resto.map((it, k) => (
                  <li key={it.id} className="gd-row flex items-center gap-3 px-4 md:px-5 py-2.5" onClick={it.abrir}>
                    <span className="w-6 text-sm font-extrabold text-center" style={{ color: "var(--faint)" }}>{k + 4}</span>
                    <Avatar nome={it.nome} foto={it.foto} size={34} quadrado={alvo === "lojas"} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{it.nome}</p>
                      <p className="text-xs gd-muted truncate">{it.extra}</p>
                    </div>
                    <p className="text-sm font-extrabold shrink-0">{it.valor}</p>
                    <button className="gd-btn gd-btn-ghost gd-btn-sm shrink-0" style={{ width: 34, padding: 0 }} aria-label={`Premiar ${it.nome}`}
                      onClick={ev => { ev.stopPropagation(); it.premiar(); }}>
                      <Trophy size={15} style={{ color: "var(--gold)" }} />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      <Secao titulo="Histórico de premiações" acao={hist.data && !hist.data.migracao_pendente ? <span className="text-xs gd-muted">{hist.data.premiacoes.length}</span> : null}>
        <div className="pb-2">
          {hist.loading && !hist.data ? <Carregando /> : hist.error ? <div className="px-4 pb-3"><Aviso tom="red" titulo="Erro">{hist.error}</Aviso></div>
            : hist.data?.migracao_pendente ? (
              <div className="px-4 md:px-5 pb-3">
                <Aviso titulo="Rode supabase/schema_v75.sql">A tabela <b>premiacoes</b> ainda não existe — o ranking funciona, mas o envio de premiações só fica disponível depois da migração.</Aviso>
              </div>
            ) : (
              <PremiacaoLista itens={hist.data?.premiacoes ?? []} onChanged={recarregarHist} toast={toast}
                abrirAlvo={p => p.alvo_tipo === "empresa" ? p.empresa_id && abrirLoja(p.empresa_id) : p.motoboy_id && abrirMotoboy(p.motoboy_id)} />
            )}
        </div>
      </Secao>
    </div>
  );
}
