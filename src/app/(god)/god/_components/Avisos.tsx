"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Megaphone, Send, Loader2, Search, Check, Trash2, Info, AlertTriangle, Siren, Database, Eye, CheckCheck, Link2, X,
} from "lucide-react";
import { Modal, Secao, Aviso, Vazio, Carregando, useJson, api, fmtBytes, fmtNum, fmtDataHora } from "./ui";
import type { UsoBanco, UsoEmpresa } from "./usoBancoData";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type NivelAviso = "info" | "atencao" | "urgente";
export interface DadosBanco {
  total_bytes: number; db_bytes: number; arquivos_bytes: number; linhas: number;
  pct_plataforma: number; limite_bytes: number | null;
  top: { nome: string; bytes: number; linhas: number | null }[];
  medido_em: string;
}
export interface PresetAviso {
  tipo: "aviso" | "banco_cheio";
  nivel?: NivelAviso;
  titulo?: string;
  mensagem?: string;
  acao_label?: string;
  acao_url?: string;
  exige_confirmacao?: boolean;
  dados?: DadosBanco;
  nomeLoja?: string;
}
/** O que abrir no modal: lojas já marcadas + modelo opcional. */
export interface AbrirAviso { ids: string[]; preset?: PresetAviso }

export interface AvisoRow {
  id: string; empresa_id: string; empresa_nome: string; tipo: "aviso" | "banco_cheio"; nivel: NivelAviso;
  titulo: string; mensagem: string; acao_label: string | null; acao_url: string | null; exige_confirmacao: boolean;
  dados: DadosBanco | null; created_at: string; visto_em: string | null; confirmado_em: string | null;
}

export const NIVEL: Record<NivelAviso, { l: string; cor: string; soft: string; ic: typeof Info }> = {
  info:    { l: "Informação", cor: "#2563eb", soft: "rgba(37,99,235,.10)",  ic: Info },
  atencao: { l: "Atenção",    cor: "#d97706", soft: "rgba(217,119,6,.12)",  ic: AlertTriangle },
  urgente: { l: "Urgente",    cor: "#E4002B", soft: "rgba(228,0,43,.10)",   ic: Siren },
};

// ─── Modelo "banco cheio" ────────────────────────────────────────────────────

const NOME_TABELA: Record<string, string> = {
  pedidos: "Pedidos", produtos: "Produtos", produto_sabores: "Sabores", produto_variacoes: "Tamanhos/variações",
  produto_adicionais: "Adicionais", produto_categorias_sabor: "Categorias de sabor", logs_auditoria: "Histórico de auditoria",
  estoque_movimentos: "Movimentos de estoque", mensagens: "Chat com motoboys", bairros_taxa: "Bairros e taxas",
  motoboys: "Motoboys", motoboy_empresas: "Vínculos de motoboys", motoboy_acertos: "Acertos de motoboys",
  delivery_routes: "Rotas de entrega", configuracao_loja: "Configurações", lojas: "Filiais", flash_sales: "Ofertas relâmpago",
  categorias_preco: "Categorias de preço", categorias_preco_tamanhos: "Tamanhos de preço", convites: "Convites",
  premiacoes: "Premiações", empresas: "Cadastro da loja", configuracoes_print_agent: "Impressão",
};
const LIMITE_PADRAO_MB = 100;

export function dadosBanco(uso: UsoBanco, e: UsoEmpresa, limiteMb: number | null = LIMITE_PADRAO_MB): DadosBanco {
  const soma = uso.empresas.reduce((s, x) => s + x.total_bytes, 0);
  const arquivos = e.storage_bytes + e.imagens_bytes;
  const itens = [
    ...e.tabelas.filter(t => t.estimado_bytes > 0).map(t => ({ nome: NOME_TABELA[t.tabela] ?? t.tabela, bytes: t.estimado_bytes, linhas: t.linhas as number | null })),
    ...(arquivos > 0 ? [{ nome: "Fotos e arquivos", bytes: arquivos, linhas: null }] : []),
  ].sort((a, b) => b.bytes - a.bytes).slice(0, 4);
  return {
    total_bytes: e.total_bytes, db_bytes: e.db_estimado_bytes, arquivos_bytes: arquivos, linhas: e.linhas,
    pct_plataforma: soma > 0 ? Math.round((e.total_bytes / soma) * 1000) / 10 : 0,
    limite_bytes: limiteMb ? limiteMb * 1024 * 1024 : null,
    top: itens, medido_em: uso.gerado_em,
  };
}

export function textoBanco(nome: string, d: DadosBanco): { titulo: string; mensagem: string; nivel: NivelAviso } {
  const pctLim = d.limite_bytes ? Math.round((d.total_bytes / d.limite_bytes) * 100) : null;
  const nivel: NivelAviso = pctLim != null && pctLim >= 90 ? "urgente" : "atencao";
  const top = d.top.map(t => `• ${t.nome}: ${fmtBytes(t.bytes)}${t.linhas != null ? ` (${fmtNum(t.linhas)} registros)` : ""}`).join("\n");
  const mensagem =
`Olá, ${nome}! O espaço de dados da sua loja está ficando cheio: hoje são ${fmtBytes(d.total_bytes)}${pctLim != null ? `, ${pctLim}% do limite de ${fmtBytes(d.limite_bytes)}` : ""}.

O que mais ocupa:
${top || "• Pedidos e fotos"}

Para liberar espaço:
• Apague pedidos antigos que você não precisa mais consultar;
• Troque fotos muito pesadas de produtos por versões menores (até uns 300 KB cada);
• Remova produtos, sabores e adicionais que não usa mais;
• Se o volume for do seu crescimento, fale com a gente sobre um upgrade de plano.`;
  return { titulo: "Seu espaço de dados está quase cheio", mensagem, nivel };
}

// ─── Modal de envio ──────────────────────────────────────────────────────────

export function AvisoModal({ lojas, inicial, onClose, onSent, toast }: {
  lojas: { id: string; nome: string }[];
  inicial: AbrirAviso;
  onClose: () => void;
  onSent: () => void;
  toast: (t: string, erro?: boolean) => void;
}) {
  const p = inicial.preset;
  const ehBanco = p?.tipo === "banco_cheio";
  const [sel, setSel] = useState<Set<string>>(new Set(inicial.ids));
  const [todas, setTodas] = useState(false);
  const [busca, setBusca] = useState("");
  const [titulo, setTitulo] = useState(p?.titulo ?? "");
  const [mensagem, setMensagem] = useState(p?.mensagem ?? "");
  const [nivel, setNivel] = useState<NivelAviso>(p?.nivel ?? "info");
  const [comAcao, setComAcao] = useState(!!p?.acao_url);
  const [acaoLabel, setAcaoLabel] = useState(p?.acao_label ?? "Abrir assinatura");
  const [acaoUrl, setAcaoUrl] = useState(p?.acao_url ?? "/assinatura");
  const [exige, setExige] = useState(p?.exige_confirmacao ?? false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Banco cheio: limite de referência editável (refaz o texto se ainda não foi editado)
  const [dados, setDados] = useState<DadosBanco | undefined>(p?.dados);
  const [limiteMb, setLimiteMb] = useState(p?.dados?.limite_bytes ? String(Math.round(p.dados.limite_bytes / 1048576)) : "");
  function mudarLimite(v: string) {
    setLimiteMb(v);
    if (!p?.dados) return;
    const mb = Number(v);
    const novo: DadosBanco = { ...p.dados, limite_bytes: mb > 0 ? mb * 1048576 : null };
    const antes = dados ? textoBanco(p.nomeLoja ?? "", dados) : null;
    setDados(novo);
    if (antes && mensagem === antes.mensagem) {
      const t = textoBanco(p.nomeLoja ?? "", novo);
      setMensagem(t.mensagem); setNivel(t.nivel);
    }
  }

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return lojas.filter(l => !t || l.nome.toLowerCase().includes(t));
  }, [lojas, busca]);
  const qtd = todas ? lojas.length : sel.size;

  function alternar(id: string) {
    setTodas(false);
    setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function marcarTodas() {
    if (todas) { setTodas(false); return; }
    if (!window.confirm(`Enviar para TODAS as ${lojas.length} lojas da plataforma?`)) return;
    setTodas(true);
  }

  async function enviar() {
    if (!titulo.trim()) { setErro("Dê um título ao aviso."); return; }
    if (qtd === 0) { setErro("Escolha pelo menos uma loja."); return; }
    if (todas && !window.confirm(`Confirma o envio do aviso “${titulo.trim()}” para todas as ${lojas.length} lojas?`)) return;
    setEnviando(true); setErro(null);
    try {
      const r = await api<{ enviados: number }>("/api/god/avisos", {
        method: "POST",
        json: {
          todas, empresa_ids: todas ? undefined : [...sel],
          tipo: p?.tipo ?? "aviso", nivel, titulo: titulo.trim(), mensagem: mensagem.trim(),
          acao_label: comAcao ? acaoLabel.trim() : null, acao_url: comAcao ? acaoUrl.trim() : null,
          exige_confirmacao: exige, dados: dados ?? null,
        },
      });
      toast(r.enviados === 1 ? "Aviso enviado" : `Aviso enviado para ${r.enviados} lojas`);
      onSent(); onClose();
    } catch (e) { setErro((e as Error).message); }
    finally { setEnviando(false); }
  }

  const N = NIVEL[nivel];

  return (
    <Modal onClose={onClose} z={90} largura={560}
      titulo={<span className="flex items-center gap-2">{ehBanco ? <Database size={18} style={{ color: N.cor }} /> : <Megaphone size={18} style={{ color: N.cor }} />} {ehBanco ? "Alerta de banco cheio" : "Enviar aviso"}</span>}>
      <div className="space-y-4">
        {/* Destinatários */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="gd-label">Para {qtd ? `(${qtd} loja${qtd > 1 ? "s" : ""})` : ""}</span>
            {!ehBanco && (
              <button type="button" className="gd-chip" data-on={todas} onClick={marcarTodas} style={{ height: 28 }}>
                {todas ? <Check size={13} /> : null} Todas as lojas
              </button>
            )}
          </div>
          {ehBanco ? (
            <p className="text-sm font-bold mt-1.5">{lojas.filter(l => sel.has(l.id)).map(l => l.nome).join(", ")}</p>
          ) : todas ? (
            <p className="text-sm mt-2 rounded-xl p-3" style={{ background: "var(--warn-soft)", color: "var(--ink)" }}>
              Vai para <b>todas as {lojas.length} lojas</b> cadastradas.
            </p>
          ) : (
            <>
              {sel.size > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {lojas.filter(l => sel.has(l.id)).map(l => (
                    <button key={l.id} type="button" className="gd-badge" onClick={() => alternar(l.id)}
                      style={{ background: "var(--ink)", color: "var(--card)", height: 26, cursor: "pointer", border: 0 }}>
                      {l.nome} <X size={11} />
                    </button>
                  ))}
                </div>
              )}
              <div className="relative mt-2">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--faint)" }} />
                <input className="gd-input" style={{ paddingLeft: 34 }} placeholder="Buscar loja para adicionar" value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <ul className="mt-1.5 rounded-xl overflow-y-auto gd-scroll gd-divide" style={{ maxHeight: 176, border: "1px solid var(--line)" }}>
                {filtradas.length === 0 ? <li className="p-3 text-sm gd-muted">Nenhuma loja.</li> : filtradas.slice(0, 200).map(l => (
                  <li key={l.id}>
                    <label className="flex items-center gap-3 px-3 py-2 cursor-pointer gd-row">
                      <input type="checkbox" checked={sel.has(l.id)} onChange={() => alternar(l.id)} style={{ width: 17, height: 17, accentColor: "var(--ink)" }} />
                      <span className="text-sm truncate">{l.nome}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Nível */}
        <div>
          <span className="gd-label">Nível</span>
          <div className="grid grid-cols-3 gap-1.5 mt-1.5">
            {(Object.keys(NIVEL) as NivelAviso[]).map(n => {
              const c = NIVEL[n]; const Ic = c.ic; const on = nivel === n;
              return (
                <button key={n} type="button" className="gd-btn gd-btn-sm" onClick={() => setNivel(n)}
                  style={on ? { background: c.cor, borderColor: c.cor, color: "#fff" } : { color: c.cor }}>
                  <Ic size={13} /> {c.l}
                </button>
              );
            })}
          </div>
        </div>

        {/* Prévia dos números do banco */}
        {ehBanco && dados && (
          <div className="rounded-2xl p-3" style={{ background: "var(--soft)" }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-extrabold">{fmtBytes(dados.total_bytes)}</span>
              <span className="text-xs gd-muted">{dados.pct_plataforma}% da plataforma{dados.limite_bytes ? ` · limite ${fmtBytes(dados.limite_bytes)}` : ""}</span>
            </div>
            {dados.limite_bytes ? (
              <div className="gd-bar mt-2" style={{ height: 8 }}>
                <span style={{ width: `${Math.min(100, (dados.total_bytes / dados.limite_bytes) * 100)}%`, background: N.cor }} />
              </div>
            ) : null}
            <label className="flex items-center gap-2 mt-2 text-xs gd-muted">
              Limite de referência
              <input className="gd-input" style={{ width: 86, height: 30 }} type="number" min={1} value={limiteMb} onChange={e => mudarLimite(e.target.value)} aria-label="Limite em MB" /> MB
            </label>
            <p className="text-xs gd-muted mt-2">{dados.top.map(t => `${t.nome} ${fmtBytes(t.bytes)}`).join(" · ")}</p>
          </div>
        )}

        <label className="block">
          <span className="gd-label">Título</span>
          <input className="gd-input mt-1.5" maxLength={120} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Manutenção programada hoje às 23h" />
        </label>
        <label className="block">
          <span className="gd-label">Mensagem</span>
          <textarea className="gd-input mt-1.5" maxLength={4000} rows={ehBanco ? 9 : 4} value={mensagem} onChange={e => setMensagem(e.target.value)} />
        </label>

        {/* Ação */}
        <div className="rounded-2xl p-3 space-y-2" style={{ border: "1px solid var(--line2)" }}>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={comAcao} onChange={e => setComAcao(e.target.checked)} style={{ width: 17, height: 17, accentColor: "var(--ink)" }} />
            <span className="text-sm font-semibold flex items-center gap-1.5"><Link2 size={14} /> Botão de ação</span>
          </label>
          {comAcao && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input className="gd-input" maxLength={60} value={acaoLabel} onChange={e => setAcaoLabel(e.target.value)} placeholder="Texto do botão" aria-label="Texto do botão" />
              <input className="gd-input" maxLength={500} value={acaoUrl} onChange={e => setAcaoUrl(e.target.value)} placeholder="/assinatura ou https://..." aria-label="Link do botão" />
            </div>
          )}
          <label className="flex items-start gap-3 cursor-pointer pt-1">
            <input type="checkbox" checked={exige} onChange={e => setExige(e.target.checked)} style={{ width: 17, height: 17, marginTop: 2, accentColor: "var(--ink)" }} />
            <span className="text-sm"><b>Exigir confirmação</b><span className="block text-xs gd-muted">A loja só fecha o pop-up clicando em “Li e entendi”.</span></span>
          </label>
        </div>

        {erro && <Aviso tom="red" titulo="Não foi possível enviar">{erro}</Aviso>}
        <button className="gd-btn w-full" style={{ height: 46, background: N.cor, borderColor: N.cor, color: "#fff" }} disabled={enviando} onClick={enviar}>
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar {qtd > 1 ? `para ${qtd} lojas` : "aviso"}
        </button>
        <p className="text-xs gd-muted text-center">Aparece como pop-up no painel da loja na hora (ou na próxima vez que ela abrir).</p>
      </div>
    </Modal>
  );
}

// ─── Status ──────────────────────────────────────────────────────────────────

export function StatusAviso({ a }: { a: AvisoRow }) {
  if (a.confirmado_em) return <span className="gd-badge" style={{ color: "var(--ok)", background: "var(--ok-soft)" }}><CheckCheck size={11} /> Confirmado {fmtDataHora(a.confirmado_em)}</span>;
  if (a.visto_em) return <span className="gd-badge" style={{ color: "var(--info)", background: "var(--info-soft)" }}><Eye size={11} /> Visto {fmtDataHora(a.visto_em)}{a.exige_confirmacao ? " · sem confirmar" : ""}</span>;
  return <span className="gd-badge" style={{ color: "var(--muted)", background: "var(--soft)" }}><Send size={11} /> Enviado</span>;
}

export function AvisoLista({ itens, compacto, onChanged, toast, abrirLoja }: {
  itens: AvisoRow[]; compacto?: boolean; onChanged: () => void; toast: (t: string, erro?: boolean) => void; abrirLoja?: (id: string) => void;
}) {
  const [apagando, setApagando] = useState<string | null>(null);
  async function apagar(a: AvisoRow) {
    if (!window.confirm(a.visto_em ? "Apagar este aviso do histórico?" : "Apagar este aviso? A loja ainda não viu — ele deixa de aparecer para ela.")) return;
    setApagando(a.id);
    try { await api("/api/god/avisos", { method: "DELETE", json: { id: a.id } }); toast("Aviso apagado"); onChanged(); }
    catch (e) { toast((e as Error).message, true); }
    finally { setApagando(null); }
  }
  if (itens.length === 0) return <Vazio texto="Nenhum aviso enviado." icone={<Megaphone size={24} />} />;
  return (
    <ul className="gd-divide" style={{ borderTop: "1px solid var(--line)" }}>
      {itens.map(a => {
        const N = NIVEL[a.nivel] ?? NIVEL.info; const Ic = a.tipo === "banco_cheio" ? Database : N.ic;
        return (
          <li key={a.id} className="px-4 md:px-5 py-3 flex items-start gap-3">
            <span className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 34, height: 34, background: N.soft, color: N.cor }}><Ic size={16} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{a.titulo}</p>
              {!compacto && (
                <button className="text-xs font-semibold mt-0.5" style={{ color: "var(--ink2)", background: "none", border: 0, padding: 0, cursor: abrirLoja ? "pointer" : "default" }}
                  onClick={() => abrirLoja?.(a.empresa_id)}>{a.empresa_nome}</button>
              )}
              <p className="text-xs gd-muted mt-0.5 line-clamp-2" style={{ whiteSpace: "pre-line" }}>{a.mensagem}</p>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="gd-badge" style={{ color: N.cor, background: N.soft }}>{a.tipo === "banco_cheio" ? "Banco cheio" : N.l}</span>
                <StatusAviso a={a} />
                <span className="text-[11px] gd-muted">enviado {fmtDataHora(a.created_at)}</span>
              </div>
            </div>
            <button className="gd-btn gd-btn-ghost gd-btn-sm shrink-0" style={{ width: 30, padding: 0, color: "var(--faint)" }} aria-label="Apagar aviso"
              disabled={apagando === a.id} onClick={() => apagar(a)}>
              {apagando === a.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Seção "Avisos" ──────────────────────────────────────────────────────────

export default function AvisosSecao({ lojas, abrirAviso, abrirLoja, versao, toast }: {
  lojas: { id: string; nome: string }[]; abrirAviso: (a: AbrirAviso) => void; abrirLoja: (id: string) => void;
  versao: number; toast: (t: string, erro?: boolean) => void;
}) {
  const [loja, setLoja] = useState("");
  const [status, setStatus] = useState<"todos" | "pendente" | "visto" | "confirmado">("todos");
  const { data, loading, error, reload } = useJson<{ migracao_pendente: boolean; avisos: AvisoRow[] }>(`/api/god/avisos${loja ? `?empresa_id=${loja}` : ""}`);
  useEffect(() => { if (versao) reload(); }, [versao, reload]);

  const lista = (data?.avisos ?? []).filter(a =>
    status === "todos" ? true : status === "pendente" ? !a.visto_em : status === "visto" ? !!a.visto_em && !a.confirmado_em : !!a.confirmado_em);
  const pend = (data?.avisos ?? []).filter(a => !a.visto_em).length;

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="gd-btn gd-btn-red" onClick={() => abrirAviso({ ids: [] })}><Megaphone size={15} /> Enviar aviso</button>
        <p className="text-sm gd-muted">Pop-up no painel das lojas — uma, várias ou todas.</p>
      </div>
      {data?.migracao_pendente && (
        <Aviso titulo="Rode supabase/schema_v76.sql no Supabase">A tabela <b>avisos_admin</b> ainda não existe — dá para montar o aviso, mas o envio só funciona depois da migração.</Aviso>
      )}
      {error && <Aviso tom="red" titulo="Erro ao carregar avisos">{error}</Aviso>}

      <Secao titulo="Histórico de avisos" acao={data && !data.migracao_pendente ? <span className="text-xs gd-muted">{pend} sem visualização</span> : null}>
        <div className="px-4 md:px-5 pb-3 flex flex-col sm:flex-row gap-2">
          <select className="gd-input sm:w-64" value={loja} onChange={e => setLoja(e.target.value)} aria-label="Filtrar por loja">
            <option value="">Todas as lojas</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          <select className="gd-input sm:w-48" value={status} onChange={e => setStatus(e.target.value as typeof status)} aria-label="Filtrar por status">
            <option value="todos">Todos os status</option>
            <option value="pendente">Ainda não visto</option>
            <option value="visto">Visto (sem confirmação)</option>
            <option value="confirmado">Confirmado</option>
          </select>
        </div>
        <div className="pb-2">
          {loading && !data ? <Carregando /> : <AvisoLista itens={lista} onChanged={reload} toast={toast} abrirLoja={abrirLoja} />}
        </div>
      </Secao>
    </div>
  );
}

/** Atalho: abre o modal já preenchido com o alerta de banco cheio da loja. */
export function presetBanco(uso: UsoBanco, e: UsoEmpresa): AbrirAviso {
  const dados = dadosBanco(uso, e);
  const t = textoBanco(e.nome, dados);
  return {
    ids: [e.id],
    preset: {
      tipo: "banco_cheio", nivel: t.nivel, titulo: t.titulo, mensagem: t.mensagem, dados, nomeLoja: e.nome,
      exige_confirmacao: true, acao_label: "Ver planos", acao_url: "/assinatura",
    },
  };
}
