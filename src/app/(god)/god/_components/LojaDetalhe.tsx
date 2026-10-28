"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink, Trash2, Clock, Power, Trophy, Megaphone, Plus, Check, X, Loader2, Bike, Copy, Star, Database, ChevronDown,
} from "lucide-react";
import {
  Drawer, Secao, Campo, Kpi, PlanoBadge, StatusAssinatura, StatusMotoboy, Avatar, GraficoDias, Carregando, Aviso, Vazio,
  useJson, api, fmtBRL, fmtBRLCurto, fmtNum, fmtData, fmtDataHora, fmtBytes, tempoAtras, diasRestantes,
  PLANOS, PLANO_LABEL, STATUS_PEDIDO, type Plano, type AlvoPremiacao, type Premiacao, type PontoSerie,
} from "./ui";
import { useUsoBanco } from "./usoBancoData";
import { PremiacaoLista } from "./Premiacoes";
import { AvisoLista, presetBanco, type AbrirAviso, type AvisoRow } from "./Avisos";

type Bloco = { pedidos: number; faturamento: number; cancelados: number };
interface MbLoja {
  id: string; nome: string; telefone: string; status: string; codigo: string | null; foto_url: string | null;
  avaliacao_media: number | null; ultima_localizacao_at: string | null; vinculo: string; entregas: number; ganhos: number;
}
interface Detalhe {
  empresa: Record<string, unknown> & {
    id: string; nome: string; email: string; plano: Plano; slug: string | null; codigo: string | null; cnpj: string | null;
    assinatura_ativa: boolean; assinatura_expira_em: string | null; created_at: string; verificado?: boolean; ativo?: boolean;
    cidade?: string | null; estado?: string | null; endereco?: string | null; kirvano_subscriber_id?: string | null;
    despacho_automatico?: boolean; mapa_cidade?: string | null;
  };
  config: Record<string, unknown> | null;
  print_agent: { ativo: boolean; impressora_nome: string | null; tamanho_papel: string; agent_last_seen: string | null } | null;
  lojas: { id: string; nome: string; slug: string | null; ativo: boolean }[];
  numeros: { hoje: Bloco; d7: Bloco; d30: Bloco; total: Bloco };
  ticket_medio: number;
  avaliacao: { media: number; qtd: number } | null;
  ultimo_pedido: string | null;
  parcial: boolean;
  serie: PontoSerie[];
  totais: { produtos: number; bairros: number };
  motoboys: MbLoja[];
  ultimos_pedidos: { id: string; cliente_nome: string; status: string; valor_pedido: number | null; created_at: string; tipo_pedido: string | null; forma_pagamento: string | null; bairro: string | null; motoboy_nome: string | null }[];
  premiacoes: Premiacao[];
  premiacoes_migracao_pendente: boolean;
}

const sim = (v: unknown) => v === true ? "Sim" : v === false ? "Não" : "—";

export default function LojaDetalhe({ id, onClose, onChanged, abrirMotoboy, premiar, toast, versao = 0, abrirAviso, versaoAvisos = 0 }: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  abrirMotoboy: (id: string) => void;
  premiar: (a: AlvoPremiacao) => void;
  toast: (t: string, erro?: boolean) => void;
  versao?: number;
  abrirAviso: (a: AbrirAviso) => void;
  versaoAvisos?: number;
}) {
  const { data, loading, error, reload } = useJson<Detalhe>(`/api/god/empresa?id=${id}`);
  useEffect(() => { if (versao) reload(); }, [versao, reload]);
  const uso = useUsoBanco(true);
  const avisos = useJson<{ migracao_pendente: boolean; avisos: AvisoRow[] }>(`/api/god/avisos?empresa_id=${id}`);
  const { reload: recarregarAvisos } = avisos;
  useEffect(() => { if (versaoAvisos) recarregarAvisos(); }, [versaoAvisos, recarregarAvisos]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [dias, setDias] = useState("30");
  const [mbNome, setMbNome] = useState("");
  const [mbTel, setMbTel] = useState("");
  const [addMb, setAddMb] = useState(false);
  const [verConfig, setVerConfig] = useState(false);
  const [metrica, setMetrica] = useState<"pedidos" | "faturamento">("faturamento");

  const e = data?.empresa;
  const usoEmp = uso.data?.empresas.find(x => x.id === id) ?? null;

  async function acao(nome: string, fn: () => Promise<unknown>, ok: string) {
    setOcupado(nome);
    try { await fn(); toast(ok); await reload(); onChanged(); }
    catch (err) { toast((err as Error).message, true); }
    finally { setOcupado(null); }
  }

  const setPlano = (plano: Plano) => acao("plano", () => api("/api/god/set-plano", { method: "POST", json: { empresaId: id, plano } }), `Plano alterado para ${PLANO_LABEL[plano]}`);
  const setDiasAss = () => {
    const n = parseInt(dias, 10);
    if (!n || n < 1 || n > 3650) { toast("Informe de 1 a 3650 dias", true); return; }
    acao("dias", () => api("/api/god/set-dias", { method: "POST", json: { empresaId: id, dias: n } }), `Assinatura válida por ${n} dias a partir de hoje`);
  };
  const toggle = () => e && acao("toggle", () => api("/api/god/toggle-assinatura", { method: "POST", json: { empresaId: id, ativo: !e.assinatura_ativa } }),
    e.assinatura_ativa ? "Assinatura desativada" : "Assinatura ativada");
  async function excluir() {
    if (!e) return;
    const conf = window.prompt(`Excluir "${e.nome}" apaga a conta, todos os pedidos, produtos e motoboys. É irreversível.\n\nDigite o nome da loja para confirmar:`);
    if (conf === null) return;
    if (conf.trim().toLowerCase() !== e.nome.trim().toLowerCase()) { toast("Nome não confere — nada foi excluído", true); return; }
    setOcupado("excluir");
    try {
      await api("/api/god/delete-empresa", { method: "POST", json: { empresaId: id } });
      toast("Loja excluída");
      onChanged(); onClose();
    } catch (err) { toast((err as Error).message, true); setOcupado(null); }
  }
  async function salvarMotoboy() {
    if (!mbNome.trim() || !mbTel.trim()) return;
    await acao("addmb", () => api("/api/god/motoboys", { method: "POST", json: { empresaId: id, nome: mbNome.trim(), telefone: mbTel.trim() } }), "Motoboy adicionado");
    setMbNome(""); setMbTel(""); setAddMb(false);
  }
  function removerMotoboy(mid: string, nome: string) {
    if (!window.confirm(`Remover o motoboy "${nome}"? O cadastro dele será apagado.`)) return;
    acao("rm" + mid, () => api("/api/god/motoboys", { method: "DELETE", json: { motoboyId: mid } }), "Motoboy removido");
  }

  const dr = e ? diasRestantes(e.assinatura_expira_em) : null;
  const cfg = data?.config ?? {};

  return (
    <Drawer onClose={onClose}
      titulo={e?.nome ?? "Carregando..."}
      sub={e ? <span>{e.email} · criada em {fmtData(e.created_at)}</span> : null}
      topo={e && (
        <div className="flex items-center gap-2 px-4 md:px-6 py-2.5 flex-wrap" style={{ background: "var(--card)", borderBottom: "1px solid var(--line)" }}>
          <PlanoBadge plano={e.plano} />
          <StatusAssinatura e={e} />
          {e.verificado && <span className="gd-badge" style={{ color: "var(--info)", background: "var(--info-soft)" }}>Verificada</span>}
          {e.slug && (
            <a href={`/loja/${e.slug}`} target="_blank" rel="noopener noreferrer" className="ml-auto gd-btn gd-btn-sm">
              <ExternalLink size={13} /> Ver loja
            </a>
          )}
        </div>
      )}>
      {error && <Aviso tom="red" titulo="Erro ao carregar a loja">{error}</Aviso>}
      {!data && loading && <Carregando />}
      {data && e && (
        <div className="space-y-4" style={{ opacity: loading ? 0.6 : 1, transition: "opacity .2s" }}>
          {/* Números */}
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Hoje" valor={fmtBRLCurto(data.numeros.hoje.faturamento)} sub={`${fmtNum(data.numeros.hoje.pedidos)} pedidos`} />
            <Kpi label="7 dias" valor={fmtBRLCurto(data.numeros.d7.faturamento)} sub={`${fmtNum(data.numeros.d7.pedidos)} pedidos`} />
            <Kpi label="30 dias" valor={fmtBRLCurto(data.numeros.d30.faturamento)} sub={`${fmtNum(data.numeros.d30.pedidos)} pedidos`} />
            <Kpi destaque label="Total" valor={fmtBRLCurto(data.numeros.total.faturamento)} sub={`${fmtNum(data.numeros.total.pedidos)} pedidos`} />
          </div>
          <div className="gd-card grid grid-cols-3 text-center">
            {[
              { l: "Ticket médio", v: fmtBRL(data.ticket_medio) },
              { l: "Cancelados", v: `${fmtNum(data.numeros.total.cancelados)} (${data.numeros.total.pedidos ? Math.round((data.numeros.total.cancelados / data.numeros.total.pedidos) * 100) : 0}%)` },
              { l: "Avaliação", v: data.avaliacao ? <span className="inline-flex items-center gap-1"><Star size={13} fill="currentColor" style={{ color: "var(--gold)" }} />{data.avaliacao.media.toFixed(1)} <span className="gd-muted font-normal text-xs">({data.avaliacao.qtd})</span></span> : "—" },
            ].map((c, i) => (
              <div key={c.l} className="py-3 px-1.5 min-w-0" style={i ? { borderLeft: "1px solid var(--line)" } : undefined}>
                <p className="gd-label" style={{ fontSize: 10 }}>{c.l}</p>
                <p className="font-extrabold text-sm mt-0.5 truncate">{c.v}</p>
              </div>
            ))}
          </div>
          {data.parcial && <Aviso titulo="Histórico grande">Os totais consideram os primeiros 100 mil pedidos.</Aviso>}

          <Secao titulo="Últimos 30 dias" acao={
            <div className="gd-seg">
              <button data-on={metrica === "faturamento"} onClick={() => setMetrica("faturamento")}>R$</button>
              <button data-on={metrica === "pedidos"} onClick={() => setMetrica("pedidos")}>Pedidos</button>
            </div>}>
            <div className="px-2 pb-3 pt-3"><GraficoDias serie={data.serie} metrica={metrica} altura={160} /></div>
          </Secao>

          {/* Ações */}
          <Secao titulo="Assinatura e plano">
            <div className="px-4 md:px-5 pb-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Status" valor={<StatusAssinatura e={e} />} />
                <Campo label="Vence em" valor={e.assinatura_expira_em ? `${fmtData(e.assinatura_expira_em)}${dr !== null ? ` (${dr > 0 ? `${dr} dias` : "vencida"})` : ""}` : "Sem data"} />
              </div>
              <div>
                <p className="gd-label mb-2 flex items-center gap-2">Plano {ocupado === "plano" && <Loader2 size={12} className="animate-spin" />}</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {PLANOS.map(p => (
                    <button key={p} className="gd-btn gd-btn-sm" disabled={!!ocupado}
                      style={e.plano === p ? { background: "var(--ink)", color: "var(--card)", borderColor: "var(--ink)" } : undefined}
                      onClick={() => e.plano !== p && setPlano(p)}>
                      {PLANO_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="gd-label mb-2">Definir dias de assinatura (a partir de hoje)</p>
                <div className="flex gap-1.5 flex-wrap">
                  {[30, 90, 365].map(d => (
                    <button key={d} className="gd-chip" data-on={dias === String(d)} onClick={() => setDias(String(d))}>{d === 365 ? "1 ano" : `${d} dias`}</button>
                  ))}
                  <input className="gd-input" style={{ width: 84, height: 32 }} type="number" min={1} max={3650} value={dias} onChange={ev => setDias(ev.target.value)} aria-label="Dias" />
                  <button className="gd-btn gd-btn-sm gd-btn-primary" disabled={!!ocupado} onClick={setDiasAss}>
                    {ocupado === "dias" ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />} Aplicar
                  </button>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap pt-1">
                <button className={`gd-btn gd-btn-sm ${e.assinatura_ativa ? "gd-btn-danger" : ""}`} disabled={!!ocupado} onClick={toggle}>
                  {ocupado === "toggle" ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                  {e.assinatura_ativa ? "Desativar assinatura" : "Ativar assinatura (30 dias)"}
                </button>
                <button className="gd-btn gd-btn-sm" onClick={() => abrirAviso({ ids: [id] })}>
                  <Megaphone size={13} /> Enviar aviso para esta loja
                </button>
                <button className="gd-btn gd-btn-sm" onClick={() => premiar({ tipo: "empresa", id, nome: e.nome })}>
                  <Trophy size={13} style={{ color: "var(--gold)" }} /> Enviar premiação
                </button>
              </div>
            </div>
          </Secao>

          {/* Dados cadastrais */}
          <Secao titulo="Dados cadastrais">
            <div className="px-4 md:px-5 pb-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <Campo label="Nome" valor={e.nome} />
              <Campo label="Slug" valor={e.slug ? `/${e.slug}` : null} mono />
              <Campo label="E-mail" valor={e.email} />
              <Campo label="Telefone" valor={(cfg.telefone_contato as string) ?? null} />
              <Campo label="Cidade" valor={[e.cidade ?? e.mapa_cidade, e.estado].filter(Boolean).join(" / ") || null} />
              <Campo label="CNPJ" valor={e.cnpj} mono />
              <Campo label="Código" valor={e.codigo && (
                <span className="inline-flex items-center gap-1.5">{e.codigo}
                  <button className="gd-btn gd-btn-ghost" style={{ height: 22, padding: "0 4px" }} aria-label="Copiar código"
                    onClick={() => { navigator.clipboard.writeText(e.codigo ?? ""); toast("Código copiado"); }}><Copy size={12} /></button>
                </span>)} mono />
              <Campo label="Criada em" valor={fmtDataHora(e.created_at)} />
              <Campo label="Verificada" valor={sim(e.verificado)} />
              <Campo label="Conta ativa" valor={sim(e.ativo)} />
              <Campo label="Último pedido" valor={data.ultimo_pedido ? tempoAtras(data.ultimo_pedido) : "nunca"} />
              <Campo label="Kirvano" valor={e.kirvano_subscriber_id} mono />
              <div className="col-span-2"><Campo label="Endereço" valor={e.endereco ?? null} /></div>
            </div>
          </Secao>

          {/* Configurações da loja */}
          <Secao titulo="Configurações da loja" acao={
            <button className="gd-btn gd-btn-ghost gd-btn-sm" onClick={() => setVerConfig(v => !v)}>
              {verConfig ? "Resumo" : "Ver tudo"} <ChevronDown size={13} style={{ transform: verConfig ? "rotate(180deg)" : undefined }} />
            </button>}>
            <div className="px-4 md:px-5 pb-4">
              {!data.config ? <p className="text-sm gd-muted">Loja ainda não configurou a vitrine.</p> : verConfig ? (
                <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
                  {Object.entries(data.config).map(([k, v]) => (
                    <div key={k} className="flex gap-3 min-w-0" style={{ borderBottom: "1px dashed var(--line)", paddingBottom: 4 }}>
                      <dt className="gd-muted w-44 shrink-0 truncate font-mono">{k}</dt>
                      <dd className="min-w-0 break-all font-semibold">{v === null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Campo label="Aberta agora" valor={sim(cfg.aberto)} />
                  <Campo label="Tempo de entrega" valor={(cfg.tempo_entrega as string) ?? null} />
                  <Campo label="Taxa padrão" valor={cfg.taxa_entrega != null ? fmtBRL(Number(cfg.taxa_entrega)) : null} />
                  <Campo label="Horário" valor={(cfg.horario_funcionamento as string) ?? null} />
                  <Campo label="Cor" valor={cfg.cor_principal ? <span className="inline-flex items-center gap-1.5"><span style={{ width: 14, height: 14, borderRadius: 4, background: String(cfg.cor_principal), border: "1px solid var(--line)" }} />{String(cfg.cor_principal)}</span> : null} />
                  <Campo label="WhatsApp API" valor={cfg.whatsapp_token ? "Configurado" : "Não"} />
                  <Campo label="Produtos" valor={fmtNum(data.totais.produtos)} />
                  <Campo label="Bairros c/ taxa" valor={fmtNum(data.totais.bairros)} />
                  <Campo label="Filiais" valor={data.lojas.length ? data.lojas.map(l => l.nome).join(", ") : "Nenhuma"} />
                  <Campo label="Despacho automático" valor={sim(e.despacho_automatico)} />
                  <Campo label="Agente de impressão" valor={data.print_agent ? `${data.print_agent.ativo ? "Ativo" : "Inativo"} · visto ${tempoAtras(data.print_agent.agent_last_seen)}` : "Não instalado"} />
                </div>
              )}
            </div>
          </Secao>

          {/* Motoboys */}
          <Secao titulo={`Motoboys vinculados (${data.motoboys.length})`} acao={
            <button className="gd-btn gd-btn-sm" onClick={() => setAddMb(v => !v)}>{addMb ? <X size={13} /> : <Plus size={13} />} {addMb ? "Cancelar" : "Adicionar"}</button>}>
            {addMb && (
              <div className="px-4 md:px-5 pb-3 flex gap-2 flex-wrap">
                <input className="gd-input flex-1" style={{ minWidth: 140 }} placeholder="Nome" value={mbNome} onChange={ev => setMbNome(ev.target.value)} />
                <input className="gd-input flex-1" style={{ minWidth: 130 }} placeholder="Telefone" value={mbTel} onChange={ev => setMbTel(ev.target.value)}
                  onKeyDown={ev => ev.key === "Enter" && salvarMotoboy()} />
                <button className="gd-btn gd-btn-primary" disabled={ocupado === "addmb" || !mbNome.trim() || !mbTel.trim()} onClick={salvarMotoboy}>
                  {ocupado === "addmb" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
                </button>
              </div>
            )}
            {data.motoboys.length === 0 ? <Vazio texto="Nenhum motoboy vinculado." icone={<Bike size={24} />} /> : (
              <ul className="gd-divide" style={{ borderTop: "1px solid var(--line)" }}>
                {data.motoboys.map(m => (
                  <li key={m.id} className="gd-row flex items-center gap-3 px-4 md:px-5 py-2.5" onClick={() => abrirMotoboy(m.id)}>
                    <Avatar nome={m.nome} foto={m.foto_url} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{m.nome}</p>
                      <p className="text-xs gd-muted truncate">{m.telefone} · {fmtNum(m.entregas)} entregas · {fmtBRL(m.ganhos)}{m.vinculo !== "principal" ? ` · ${m.vinculo}` : ""}</p>
                    </div>
                    <StatusMotoboy status={m.status} />
                    {m.vinculo === "principal" && (
                      <button className="gd-btn gd-btn-ghost gd-btn-sm" style={{ width: 32, padding: 0, color: "var(--faint)" }} aria-label="Remover motoboy"
                        disabled={ocupado === "rm" + m.id}
                        onClick={ev => { ev.stopPropagation(); removerMotoboy(m.id, m.nome); }}>
                        {ocupado === "rm" + m.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Secao>

          {/* Últimos pedidos */}
          <Secao titulo="Últimos pedidos">
            {data.ultimos_pedidos.length === 0 ? <Vazio texto="Nenhum pedido ainda." /> : (
              <ul className="gd-divide" style={{ borderTop: "1px solid var(--line)" }}>
                {data.ultimos_pedidos.map(p => (
                  <li key={p.id} className="flex items-center gap-3 px-4 md:px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{p.cliente_nome || "Cliente"}</p>
                      <p className="text-xs gd-muted truncate">{fmtDataHora(p.created_at)}{p.bairro ? ` · ${p.bairro}` : ""}{p.motoboy_nome ? ` · ${p.motoboy_nome}` : ""}{p.forma_pagamento ? ` · ${p.forma_pagamento}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-extrabold" style={p.status === "cancelado" ? { textDecoration: "line-through", color: "var(--faint)" } : undefined}>{fmtBRL(Number(p.valor_pedido) || 0)}</p>
                      <p className="text-[11px] font-semibold" style={{ color: p.status === "cancelado" ? "var(--red-ink)" : p.status === "entregue" ? "var(--ok)" : "var(--muted)" }}>{STATUS_PEDIDO[p.status] ?? p.status}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Secao>

          {/* Uso de banco */}
          <Secao titulo={<span className="flex items-center gap-2"><Database size={15} /> Uso de banco</span>}>
            <div className="px-4 md:px-5 pb-4">
              {uso.loading && !uso.data ? <p className="text-sm gd-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Calculando...</p>
                : uso.data?.migracao_pendente ? <Aviso titulo="Rode supabase/schema_v75.sql">Sem a migração não dá para medir as linhas por loja.{usoEmp && usoEmp.imagens_bytes > 0 ? ` Imagens atribuídas: ${fmtBytes(usoEmp.imagens_bytes)}.` : ""}</Aviso>
                : !usoEmp ? <p className="text-sm gd-muted">{uso.error ?? "Sem dados."}</p>
                : (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <Campo label="Banco (est.)" valor={fmtBytes(usoEmp.db_estimado_bytes)} />
                      <Campo label="Arquivos" valor={fmtBytes(usoEmp.storage_bytes + usoEmp.imagens_bytes)} />
                      <Campo label="Linhas" valor={fmtNum(usoEmp.linhas)} />
                    </div>
                    <button className="gd-btn gd-btn-sm gd-btn-danger mb-3" onClick={() => uso.data && abrirAviso(presetBanco(uso.data, usoEmp))}>
                      <Megaphone size={13} /> Enviar alerta de banco cheio
                    </button>
                    <ul className="space-y-1.5">
                      {usoEmp.tabelas.filter(t => t.linhas > 0).map(t => {
                        const max = usoEmp.tabelas[0]?.estimado_bytes || 1;
                        return (
                          <li key={t.tabela} className="text-xs">
                            <div className="flex justify-between gap-2"><span className="font-mono truncate">{t.tabela}</span><span className="gd-muted shrink-0">{fmtNum(t.linhas)} lin · <b style={{ color: "var(--ink)" }}>{fmtBytes(t.estimado_bytes)}</b></span></div>
                            <div className="gd-bar mt-1" style={{ height: 4 }}><span style={{ width: `${Math.max(1, (t.estimado_bytes / max) * 100)}%`, opacity: 0.7 }} /></div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
            </div>
          </Secao>

          {/* Avisos */}
          <Secao titulo="Avisos enviados" acao={<button className="gd-btn gd-btn-sm" onClick={() => abrirAviso({ ids: [id] })}><Megaphone size={13} /> Novo</button>}>
            <div className="pb-2">
              {avisos.data?.migracao_pendente
                ? <div className="px-4 md:px-5 pb-3"><Aviso titulo="Rode supabase/schema_v76.sql">A tabela de avisos ainda não existe.</Aviso></div>
                : avisos.loading && !avisos.data ? <Carregando />
                : <AvisoLista itens={avisos.data?.avisos ?? []} compacto onChanged={recarregarAvisos} toast={toast} />}
            </div>
          </Secao>

          {/* Premiações */}
          <Secao titulo="Premiações recebidas">
            <div className="pb-2">
              {data.premiacoes_migracao_pendente
                ? <div className="px-4 md:px-5 pb-3"><Aviso titulo="Rode supabase/schema_v75.sql">A tabela de premiações ainda não existe.</Aviso></div>
                : <PremiacaoLista itens={data.premiacoes} compacto onChanged={() => { reload(); onChanged(); }} toast={toast} />}
            </div>
          </Secao>

          {/* Perigo */}
          <section className="rounded-[18px] p-4 md:p-5" style={{ border: "1px solid color-mix(in srgb, var(--red) 30%, var(--line))", background: "var(--red-soft)" }}>
            <p className="gd-h2" style={{ color: "var(--red-ink)" }}>Zona de perigo</p>
            <p className="text-sm mt-1" style={{ color: "var(--ink2)" }}>Excluir remove a conta de acesso, todos os pedidos, produtos e motoboys desta loja. Não dá para desfazer.</p>
            <button className="gd-btn gd-btn-red mt-3" disabled={ocupado === "excluir"} onClick={excluir}>
              {ocupado === "excluir" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Excluir loja
            </button>
          </section>
        </div>
      )}
    </Drawer>
  );
}
