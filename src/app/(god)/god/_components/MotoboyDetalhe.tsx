"use client";

import { useEffect } from "react";
import { MapPin, Star, Trophy, Phone, Mail, ExternalLink, Building2 } from "lucide-react";
import {
  Drawer, Secao, Campo, Kpi, StatusMotoboy, Avatar, Carregando, Aviso, Vazio,
  useJson, fmtBRL, fmtNum, fmtData, fmtDataHora, tempoAtras, STATUS_PEDIDO,
  type AlvoPremiacao, type Premiacao,
} from "./ui";
import { PremiacaoLista } from "./Premiacoes";

type B = { entregas: number; ganhos: number };
interface Detalhe {
  motoboy: Record<string, unknown> & {
    id: string; nome: string; telefone: string; email: string | null; status: string; codigo: string | null;
    foto_url: string | null; veiculo_tipo: string | null; area_atuacao: string | null; avaliacao_media: number | null;
    latitude: number | null; longitude: number | null; ultima_localizacao_at: string | null; posicao_fila: number | null;
    created_at: string; empresa_id: string | null;
  };
  lojas: { id: string; nome: string; vinculo: string; desde: string | null; entregas: number; ganhos: number }[];
  periodos: { hoje: B; d7: B; d30: B; total: B };
  cancelados: number;
  avaliacao_pedidos: { media: number; qtd: number } | null;
  parcial: boolean;
  ultimas: { id: string; cliente_nome: string; bairro: string | null; status: string; valor_motoboy: number | null; updated_at: string | null; created_at: string; empresa_nome: string }[];
  acertos: { id: string; empresa_nome: string; qtd_entregas: number; valor_a_repassar: number; status: string; created_at: string; pago_em: string | null }[];
  premiacoes: Premiacao[];
  premiacoes_migracao_pendente: boolean;
}

const VINCULO: Record<string, string> = { principal: "Principal", multiempresa: "Vinculado", inativo: "Vínculo inativo", antigo: "Sem vínculo atual" };

export default function MotoboyDetalhe({ id, onClose, abrirLoja, premiar, toast, versao = 0 }: {
  id: string; onClose: () => void; abrirLoja: (id: string) => void; premiar: (a: AlvoPremiacao) => void;
  toast: (t: string, erro?: boolean) => void;
  versao?: number;
}) {
  const { data, loading, error, reload } = useJson<Detalhe>(`/api/god/motoboy?id=${id}`);
  useEffect(() => { if (versao) reload(); }, [versao, reload]);
  const m = data?.motoboy;
  const temLoc = m && m.latitude != null && m.longitude != null;

  return (
    <Drawer onClose={onClose} z={70} largura={560}
      titulo={m ? <span className="flex items-center gap-3"><Avatar nome={m.nome} foto={m.foto_url} size={34} /> <span className="truncate">{m.nome}</span></span> : "Carregando..."}
      sub={m ? <span>cadastrado em {fmtData(m.created_at)}{m.codigo ? ` · código ${m.codigo}` : ""}</span> : null}>
      {error && <Aviso tom="red" titulo="Erro ao carregar o motoboy">{error}</Aviso>}
      {!data && loading && <Carregando />}
      {data && m && (
        <div className="space-y-4">
          <div className="gd-card p-4 flex items-center gap-3 flex-wrap">
            <StatusMotoboy status={m.status} />
            <span className="text-xs gd-muted">visto {tempoAtras(m.ultima_localizacao_at)}</span>
            {m.status === "disponivel" && m.posicao_fila != null && <span className="gd-badge" style={{ background: "var(--soft)", color: "var(--ink2)" }}>#{m.posicao_fila} na fila</span>}
            <button className="gd-btn gd-btn-sm ml-auto" onClick={() => premiar({ tipo: "motoboy", id: m.id, nome: m.nome })}>
              <Trophy size={13} style={{ color: "var(--gold)" }} /> Enviar premiação
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Hoje" valor={fmtBRL(data.periodos.hoje.ganhos)} sub={`${fmtNum(data.periodos.hoje.entregas)} entregas`} />
            <Kpi label="7 dias" valor={fmtBRL(data.periodos.d7.ganhos)} sub={`${fmtNum(data.periodos.d7.entregas)} entregas`} />
            <Kpi label="30 dias" valor={fmtBRL(data.periodos.d30.ganhos)} sub={`${fmtNum(data.periodos.d30.entregas)} entregas`} />
            <Kpi destaque label="Total" valor={fmtBRL(data.periodos.total.ganhos)} sub={`${fmtNum(data.periodos.total.entregas)} entregas`} />
          </div>

          <Secao titulo="Dados">
            <div className="px-4 md:px-5 pb-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <Campo label="Telefone" valor={m.telefone && <a href={`tel:${m.telefone}`} className="inline-flex items-center gap-1"><Phone size={12} /> {m.telefone}</a>} />
              <Campo label="E-mail" valor={m.email && <span className="inline-flex items-center gap-1 break-all"><Mail size={12} /> {m.email}</span>} />
              <Campo label="Veículo" valor={m.veiculo_tipo} />
              <Campo label="Área de atuação" valor={m.area_atuacao} />
              <Campo label="Avaliação (perfil)" valor={m.avaliacao_media != null ? <span className="inline-flex items-center gap-1"><Star size={13} fill="currentColor" style={{ color: "var(--gold)" }} /> {m.avaliacao_media.toFixed(2)}</span> : null} />
              <Campo label="Avaliação (pedidos)" valor={data.avaliacao_pedidos ? `${data.avaliacao_pedidos.media.toFixed(1)} em ${data.avaliacao_pedidos.qtd} pedidos` : null} />
              <Campo label="Cancelados" valor={fmtNum(data.cancelados)} />
              <Campo label="Cadastro" valor={fmtDataHora(m.created_at)} />
            </div>
          </Secao>

          <Secao titulo="Última localização">
            <div className="px-4 md:px-5 pb-4">
              {temLoc ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <MapPin size={18} style={{ color: "var(--red)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold font-mono">{Number(m.latitude).toFixed(5)}, {Number(m.longitude).toFixed(5)}</p>
                    <p className="text-xs gd-muted">{fmtDataHora(m.ultima_localizacao_at)} · {tempoAtras(m.ultima_localizacao_at)}</p>
                  </div>
                  <a className="gd-btn gd-btn-sm" target="_blank" rel="noopener noreferrer"
                    href={`https://www.google.com/maps?q=${m.latitude},${m.longitude}`}><ExternalLink size={13} /> Abrir mapa</a>
                </div>
              ) : <p className="text-sm gd-muted">Sem localização registrada.</p>}
            </div>
          </Secao>

          <Secao titulo={`Lojas (${data.lojas.length})`}>
            {data.lojas.length === 0 ? <Vazio texto="Sem lojas vinculadas." icone={<Building2 size={24} />} /> : (
              <ul className="gd-divide" style={{ borderTop: "1px solid var(--line)" }}>
                {data.lojas.map(l => (
                  <li key={l.id} className="gd-row flex items-center gap-3 px-4 md:px-5 py-2.5" onClick={() => abrirLoja(l.id)}>
                    <Avatar nome={l.nome} size={34} quadrado />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{l.nome}</p>
                      <p className="text-xs gd-muted">{VINCULO[l.vinculo] ?? l.vinculo}{l.desde ? ` desde ${fmtData(l.desde)}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-extrabold">{fmtNum(l.entregas)}</p>
                      <p className="text-xs gd-muted">{fmtBRL(l.ganhos)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Secao>

          <Secao titulo="Últimas corridas">
            {data.ultimas.length === 0 ? <Vazio texto="Nenhuma corrida ainda." /> : (
              <ul className="gd-divide" style={{ borderTop: "1px solid var(--line)" }}>
                {data.ultimas.map(p => (
                  <li key={p.id} className="flex items-center gap-3 px-4 md:px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{p.cliente_nome || "Cliente"}{p.bairro ? ` · ${p.bairro}` : ""}</p>
                      <p className="text-xs gd-muted truncate">{p.empresa_nome} · {fmtDataHora(p.updated_at ?? p.created_at)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-extrabold">{fmtBRL(Number(p.valor_motoboy) || 0)}</p>
                      <p className="text-[11px] font-semibold" style={{ color: p.status === "entregue" ? "var(--ok)" : p.status === "cancelado" ? "var(--red-ink)" : "var(--muted)" }}>{STATUS_PEDIDO[p.status] ?? p.status}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Secao>

          {data.acertos.length > 0 && (
            <Secao titulo="Acertos recentes">
              <ul className="gd-divide" style={{ borderTop: "1px solid var(--line)" }}>
                {data.acertos.map(a => (
                  <li key={a.id} className="flex items-center gap-3 px-4 md:px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{a.empresa_nome}</p>
                      <p className="text-xs gd-muted">{fmtData(a.created_at)} · {a.qtd_entregas} entregas</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold">{fmtBRL(Number(a.valor_a_repassar) || 0)}</p>
                      <p className="text-[11px] font-semibold" style={{ color: a.status === "pago" ? "var(--ok)" : "var(--warn)" }}>{a.status === "pago" ? "Pago" : "Pendente"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Secao>
          )}

          <Secao titulo="Premiações recebidas">
            <div className="pb-2">
              {data.premiacoes_migracao_pendente
                ? <div className="px-4 md:px-5 pb-3"><Aviso titulo="Rode supabase/schema_v75.sql">A tabela de premiações ainda não existe.</Aviso></div>
                : <PremiacaoLista itens={data.premiacoes} compacto onChanged={reload} toast={toast} />}
            </div>
          </Secao>
          {data.parcial && <p className="text-xs gd-muted text-center">Totais calculados sobre os primeiros 100 mil pedidos.</p>}
        </div>
      )}
    </Drawer>
  );
}
