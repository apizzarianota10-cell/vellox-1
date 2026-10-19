"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Boxes, Search, RefreshCw, Plus, SlidersHorizontal, History,
  AlertTriangle, Info, Loader2, Image as ImageIcon, Database, X, CheckCircle, AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  PRODUTO_ESTOQUE_SELECT, MOVIMENTO_SELECT, STATUS_CFG, EVENTO_ESTOQUE_ATUALIZADO,
  statusEstoque, emAlerta, isErroMigracaoPendente,
  type ProdutoEstoque, type MovimentoEstoque,
} from "@/lib/estoque";
import MovimentarModal from "./MovimentarModal";
import HistoricoModal from "./HistoricoModal";
import MovimentoLinha from "./MovimentoLinha";

interface Props {
  empresaId: string;
  initialProdutos: ProdutoEstoque[];
  initialMovimentos: MovimentoEstoque[];
  migracaoPendente?: boolean;
}

type FiltroStatus = "todos" | "controlados" | "baixo" | "zerado";

const FILTROS: { id: FiltroStatus; label: string }[] = [
  { id: "todos",       label: "Todos" },
  { id: "controlados", label: "Só controlados" },
  { id: "baixo",       label: "Abaixo do mínimo" },
  { id: "zerado",      label: "Zerados / negativos" },
];

const SEM_CATEGORIA = "Sem categoria";

export default function EstoqueClient({ empresaId, initialProdutos, initialMovimentos, migracaoPendente: migracaoInicial = false }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [produtos, setProdutos]       = useState<ProdutoEstoque[]>(initialProdutos);
  const [movimentos, setMovimentos]   = useState<MovimentoEstoque[]>(initialMovimentos);
  const [migracaoPendente, setMigracaoPendente] = useState(migracaoInicial);
  const [atualizando, setAtualizando] = useState(false);
  const [busca, setBusca]             = useState("");
  const [categoria, setCategoria]     = useState("");
  const [filtro, setFiltro]           = useState<FiltroStatus>("todos");
  const [toast, setToast]             = useState<{ ok: boolean; msg: string } | null>(null);
  const [modalMov, setModalMov]       = useState<{ produto: ProdutoEstoque; tipo: "entrada" | "ajuste" } | null>(null);
  const [historico, setHistorico]     = useState<ProdutoEstoque | null>(null);
  // Rascunho do campo "mínimo" por produto, enquanto o dono digita.
  const [minimoDraft, setMinimoDraft] = useState<Record<string, string>>({});
  const [salvandoId, setSalvandoId]   = useState<string | null>(null);

  function avisar(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), ok ? 2500 : 5000);
  }

  function notificarSidebar() {
    window.dispatchEvent(new Event(EVENTO_ESTOQUE_ATUALIZADO));
  }

  // ── Carregamento ────────────────────────────────────────────────
  const recarregarMovimentos = useCallback(async () => {
    const { data, error } = await supabase
      .from("estoque_movimentos")
      .select(MOVIMENTO_SELECT)
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      if (isErroMigracaoPendente(error)) setMigracaoPendente(true);
      return;
    }
    setMovimentos((data ?? []) as unknown as MovimentoEstoque[]);
  }, [supabase, empresaId]);

  async function recarregar() {
    setAtualizando(true);
    const [prodRes] = await Promise.all([
      supabase
        .from("produtos")
        .select(PRODUTO_ESTOQUE_SELECT)
        .eq("empresa_id", empresaId)
        .order("categoria")
        .order("ordem")
        .order("created_at"),
      recarregarMovimentos(),
    ]);
    setAtualizando(false);
    if (prodRes.error) {
      if (isErroMigracaoPendente(prodRes.error)) { setMigracaoPendente(true); return; }
      avisar(false, `Erro ao atualizar: ${prodRes.error.message}`);
      return;
    }
    setMigracaoPendente(false);
    setProdutos((prodRes.data ?? []) as unknown as ProdutoEstoque[]);
    setMinimoDraft({});
    notificarSidebar();
  }

  // ── Ações ───────────────────────────────────────────────────────
  function aplicarSaldo(produtoId: string, novoSaldo: number) {
    setProdutos(prev => prev.map(p => p.id === produtoId ? { ...p, estoque_qtd: novoSaldo } : p));
    setHistorico(h => h && h.id === produtoId ? { ...h, estoque_qtd: novoSaldo } : h);
  }

  async function toggleControle(p: ProdutoEstoque) {
    const novo = !p.controla_estoque;
    setProdutos(prev => prev.map(x => x.id === p.id ? { ...x, controla_estoque: novo } : x));
    const { error } = await supabase
      .from("produtos")
      .update({ controla_estoque: novo })
      .eq("id", p.id)
      .eq("empresa_id", empresaId);
    if (error) {
      setProdutos(prev => prev.map(x => x.id === p.id ? { ...x, controla_estoque: !novo } : x));
      avisar(false, isErroMigracaoPendente(error)
        ? "Coluna de estoque não existe ainda — rode o schema_v67.sql no Supabase."
        : `Não foi possível salvar: ${error.message}`);
      return;
    }
    notificarSidebar();
  }

  async function salvarMinimo(p: ProdutoEstoque) {
    const raw = minimoDraft[p.id];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const novo = trimmed === "" ? null : Number(trimmed);
    if (novo !== null && (!Number.isInteger(novo) || novo < 0)) {
      avisar(false, "Mínimo precisa ser um número inteiro maior ou igual a zero.");
      return;
    }
    setMinimoDraft(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    if (novo === p.estoque_minimo) return;

    const anterior = p.estoque_minimo;
    setProdutos(prev => prev.map(x => x.id === p.id ? { ...x, estoque_minimo: novo } : x));
    setSalvandoId(p.id);
    const { error } = await supabase
      .from("produtos")
      .update({ estoque_minimo: novo })
      .eq("id", p.id)
      .eq("empresa_id", empresaId);
    setSalvandoId(null);
    if (error) {
      setProdutos(prev => prev.map(x => x.id === p.id ? { ...x, estoque_minimo: anterior } : x));
      avisar(false, `Não foi possível salvar o mínimo: ${error.message}`);
      return;
    }
    notificarSidebar();
  }

  // ── Derivados ───────────────────────────────────────────────────
  const controlados = produtos.filter(p => p.controla_estoque);
  const abaixoMinimo = controlados.filter(p => p.estoque_minimo != null && p.estoque_qtd <= p.estoque_minimo).length;
  const zerados = controlados.filter(p => p.estoque_qtd <= 0).length;

  const categorias = useMemo(() => {
    const set = new Set<string>();
    produtos.forEach(p => set.add(p.categoria?.trim() || SEM_CATEGORIA));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [produtos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter(p => {
      const cat = p.categoria?.trim() || SEM_CATEGORIA;
      if (categoria && cat !== categoria) return false;
      if (q && !p.nome.toLowerCase().includes(q)) return false;
      if (filtro === "controlados" && !p.controla_estoque) return false;
      if (filtro === "baixo" && !(p.controla_estoque && p.estoque_minimo != null && p.estoque_qtd <= p.estoque_minimo)) return false;
      if (filtro === "zerado" && !(p.controla_estoque && p.estoque_qtd <= 0)) return false;
      return true;
    });
  }, [produtos, busca, categoria, filtro]);

  const grupos = useMemo(() => {
    const map = new Map<string, ProdutoEstoque[]>();
    filtrados.forEach(p => {
      const cat = p.categoria?.trim() || SEM_CATEGORIA;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    });
    return Array.from(map.entries());
  }, [filtrados]);

  const nomePorId = useMemo(() => {
    const m: Record<string, string> = {};
    produtos.forEach(p => { m[p.id] = p.nome; });
    return m;
  }, [produtos]);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-4" style={{ background: "var(--bg-base)", minHeight: "100%" }}>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(251,146,60,0.15)" }}>
            <Boxes size={20} style={{ color: "#fb923c" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>Estoque</h1>
            <p className="text-xs" style={{ color: "var(--text-4)" }}>Quantidade dos produtos do catálogo</p>
          </div>
        </div>
        <button onClick={recarregar} disabled={atualizando}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold shrink-0"
          style={{ background: "var(--overlay-sm)", border: "1px solid var(--border-1)", color: "var(--text-2)", opacity: atualizando ? 0.6 : 1 }}>
          {atualizando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Atualizar
        </button>
      </div>

      {/* Regras (resumo) */}
      <div className="flex items-start gap-3 rounded-2xl p-4" style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)" }}>
        <Info size={16} style={{ color: "#60a5fa", flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
          O estoque é baixado automaticamente (uma única vez) quando o pedido chega em <strong>Finalizado</strong>; cancelar um pedido já baixado devolve a quantidade.
          Pedidos antigos sem itens estruturados não mexem no estoque. O saldo pode ficar negativo e o catálogo online <strong>continua vendendo no zero</strong> — aqui o painel só alerta.
        </p>
      </div>

      {/* Migração pendente */}
      {migracaoPendente ? (
        <div className="rounded-2xl p-5 flex flex-col items-center text-center gap-3" style={{ background: "var(--bg-2)", border: "1px solid rgba(228,0,43,0.25)" }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(228,0,43,0.1)" }}>
            <Database size={22} style={{ color: "#E4002B" }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Estoque ainda não ativado no banco</p>
            <p className="text-xs mt-1 max-w-md" style={{ color: "var(--text-3)" }}>
              Para ativar o estoque, rode o arquivo <code className="font-mono font-bold" style={{ color: "#E4002B" }}>schema_v67.sql</code> no Supabase (SQL Editor). Depois clique em verificar.
            </p>
          </div>
          <button onClick={recarregar} disabled={atualizando}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold"
            style={{ background: "rgba(228,0,43,0.1)", color: "#E4002B", border: "1px solid rgba(228,0,43,0.2)" }}>
            {atualizando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Verificar novamente
          </button>
        </div>
      ) : (
        <>
          {/* Cards resumo */}
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            <ResumoCard label="Controlados" valor={controlados.length} color="#fb923c" Icon={Boxes} />
            <ResumoCard label="Abaixo do mínimo" valor={abaixoMinimo} color="#f59e0b" Icon={AlertTriangle} destaque={abaixoMinimo > 0} />
            <ResumoCard label="Zerados / negativos" valor={zerados} color="#E4002B" Icon={AlertCircle} destaque={zerados > 0} />
          </div>

          {/* Filtros */}
          <div className="rounded-2xl p-3 space-y-2.5" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 rounded-xl" style={{ background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
                <Search size={14} style={{ color: "var(--text-4)", flexShrink: 0 }} />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar produto…"
                  className="flex-1 bg-transparent outline-none py-2.5 text-sm"
                  style={{ color: "var(--text-1)" }}
                />
                {busca && <button onClick={() => setBusca("")} style={{ color: "var(--text-4)", display: "flex" }}><X size={13} /></button>}
              </div>
              <select
                value={categoria}
                onChange={e => setCategoria(e.target.value)}
                className="rounded-xl outline-none text-sm px-3 py-2.5 sm:w-52"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-1)", color: "var(--text-1)" }}
              >
                <option value="">Todas as categorias</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {FILTROS.map(f => {
                const ativo = filtro === f.id;
                return (
                  <button key={f.id} onClick={() => setFiltro(f.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0"
                    style={{
                      background: ativo ? "rgba(228,0,43,0.1)" : "var(--overlay-sm)",
                      border: `1px solid ${ativo ? "rgba(228,0,43,0.35)" : "var(--border-1)"}`,
                      color: ativo ? "#E4002B" : "var(--text-3)",
                    }}>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista */}
          {produtos.length === 0 ? (
            <Vazio texto="Nenhum produto no catálogo ainda. Cadastre produtos em Catálogo para controlar o estoque." />
          ) : filtrados.length === 0 ? (
            <Vazio texto="Nenhum produto bate com os filtros." />
          ) : (
            grupos.map(([cat, itens]) => (
              <div key={cat} className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{cat}</p>
                  <span className="text-xs" style={{ color: "var(--text-5)" }}>{itens.length}</span>
                </div>
                {itens.map(p => (
                  <LinhaProduto
                    key={p.id}
                    p={p}
                    minimoDraft={minimoDraft[p.id]}
                    salvando={salvandoId === p.id}
                    onToggle={() => toggleControle(p)}
                    onMinimoChange={v => setMinimoDraft(prev => ({ ...prev, [p.id]: v }))}
                    onMinimoCommit={() => salvarMinimo(p)}
                    onEntrada={() => setModalMov({ produto: p, tipo: "entrada" })}
                    onAjuste={() => setModalMov({ produto: p, tipo: "ajuste" })}
                    onHistorico={() => setHistorico(p)}
                  />
                ))}
              </div>
            ))
          )}

          {/* Últimas movimentações */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
            <div className="flex items-center gap-2 px-4 py-3">
              <History size={14} style={{ color: "#a78bfa" }} />
              <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Últimas movimentações</p>
            </div>
            {movimentos.length === 0 ? (
              <p className="text-xs px-4 pb-4" style={{ color: "var(--text-4)" }}>
                Nenhuma movimentação ainda. Ative o controle em um produto e registre uma entrada.
              </p>
            ) : (
              movimentos.map(m => (
                <MovimentoLinha key={m.id} m={m} produtoNome={nomePorId[m.produto_id] ?? "Produto removido"} />
              ))
            )}
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed left-4 right-4 md:left-auto md:right-6 md:w-96 z-[400] flex items-start gap-2 p-3 rounded-xl shadow-2xl"
          style={{
            bottom: "calc(90px + env(safe-area-inset-bottom))",
            background: toast.ok ? "rgba(34,197,94,0.95)" : "rgba(220,38,38,0.95)",
            color: "#fff",
          }}>
          {toast.ok ? <CheckCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
          <p className="text-xs font-semibold flex-1">{toast.msg}</p>
          <button onClick={() => setToast(null)} style={{ color: "#fff", display: "flex" }}><X size={13} /></button>
        </div>
      )}

      {/* Modais */}
      {modalMov && (
        <MovimentarModal
          produto={produtos.find(p => p.id === modalMov.produto.id) ?? modalMov.produto}
          tipo={modalMov.tipo}
          onClose={() => setModalMov(null)}
          onAplicar={aplicarSaldo}
          onConcluido={() => {
            avisar(true, modalMov.tipo === "entrada" ? "Entrada registrada." : "Saldo ajustado.");
            recarregarMovimentos();
            notificarSidebar();
          }}
        />
      )}
      {historico && (
        <HistoricoModal produto={historico} empresaId={empresaId} onClose={() => setHistorico(null)} />
      )}
    </div>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────

function ResumoCard({ label, valor, color, Icon, destaque = false }: {
  label: string; valor: number; color: string; Icon: React.ElementType; destaque?: boolean;
}) {
  return (
    <div className="rounded-2xl p-3 md:p-4" style={{ background: destaque ? `${color}10` : "var(--bg-2)", border: `1px solid ${destaque ? `${color}40` : "var(--border-1)"}` }}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={13} style={{ color }} />
        <p className="text-xs font-semibold truncate" style={{ color: "var(--text-4)" }}>{label}</p>
      </div>
      <p className="text-2xl font-black leading-none" style={{ color: destaque ? color : "var(--text-1)" }}>{valor}</p>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-2xl p-8 flex flex-col items-center gap-2 text-center" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
      <Boxes size={26} style={{ color: "var(--text-5)" }} />
      <p className="text-xs max-w-sm" style={{ color: "var(--text-4)" }}>{texto}</p>
    </div>
  );
}

function Switch({ on, onChange, title }: { on: boolean; onChange: () => void; title: string }) {
  return (
    <button onClick={onChange} title={title} aria-pressed={on}
      style={{ width: 40, height: 22, borderRadius: 11, background: on ? "#22c55e" : "var(--border-2)", border: "none", cursor: "pointer", transition: "background .2s", position: "relative", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
    </button>
  );
}

function LinhaProduto({ p, minimoDraft, salvando, onToggle, onMinimoChange, onMinimoCommit, onEntrada, onAjuste, onHistorico }: {
  p: ProdutoEstoque;
  minimoDraft: string | undefined;
  salvando: boolean;
  onToggle: () => void;
  onMinimoChange: (v: string) => void;
  onMinimoCommit: () => void;
  onEntrada: () => void;
  onAjuste: () => void;
  onHistorico: () => void;
}) {
  const st = statusEstoque(p);
  const cfg = STATUS_CFG[st];
  const alerta = p.controla_estoque && emAlerta(p.estoque_qtd, p.estoque_minimo);
  const minimoValor = minimoDraft ?? (p.estoque_minimo == null ? "" : String(p.estoque_minimo));

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 px-3 md:px-4 py-3"
      style={{ borderTop: "1px solid var(--border-1)", background: alerta ? "rgba(228,0,43,0.03)" : "transparent" }}>

      {/* Produto + toggle */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 flex items-center justify-center" style={{ background: "var(--bg-3)", border: "1px solid var(--border-1)" }}>
          {p.imagem_url
            ? <img src={p.imagem_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            : <ImageIcon size={16} style={{ color: "var(--text-5)" }} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: p.ativo ? "var(--text-1)" : "var(--text-4)" }}>
            {p.nome}
            {!p.ativo && <span className="ml-2 text-xs font-bold" style={{ color: "var(--text-5)" }}>inativo</span>}
          </p>
          <div className="flex items-center gap-2 mt-1 select-none">
            <Switch on={p.controla_estoque} onChange={onToggle} title={p.controla_estoque ? "Desativar controle de estoque" : "Ativar controle de estoque"} />
            <span className="text-xs cursor-pointer" style={{ color: "var(--text-4)" }} onClick={onToggle}>Controlar estoque</span>
          </div>
        </div>
      </div>

      {/* Saldo, mínimo e ações */}
      {p.controla_estoque ? (
        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:justify-end">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }} title={cfg.label}>
            <span className="text-base font-black leading-none" style={{ color: cfg.color }}>{p.estoque_qtd}</span>
            <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl" style={{ background: "var(--bg-input)", border: "1px solid var(--border-1)" }} title="Avisa quando o saldo ficar igual ou abaixo deste valor">
            <span className="text-xs font-semibold" style={{ color: "var(--text-4)" }}>Mín.</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={minimoValor}
              onChange={e => onMinimoChange(e.target.value)}
              onBlur={onMinimoCommit}
              onKeyDown={e => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
              placeholder="—"
              className="outline-none bg-transparent text-sm font-bold text-center"
              style={{ width: 44, color: "var(--text-1)" }}
            />
            {salvando && <Loader2 size={11} className="animate-spin" style={{ color: "var(--text-4)" }} />}
          </div>

          <div className="flex items-center gap-1.5">
            <AcaoBtn onClick={onEntrada} color="#22c55e" title="Registrar entrada"><Plus size={13} /> Entrada</AcaoBtn>
            <AcaoBtn onClick={onAjuste} color="#60a5fa" title="Ajustar saldo"><SlidersHorizontal size={13} /> Ajustar</AcaoBtn>
            <AcaoBtn onClick={onHistorico} color="#a78bfa" title="Ver histórico"><History size={13} /><span className="hidden sm:inline">Histórico</span></AcaoBtn>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 md:justify-end">
          <span className="text-xs px-2.5 py-1.5 rounded-xl" style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
            Sem controle de estoque
          </span>
          <AcaoBtn onClick={onHistorico} color="#a78bfa" title="Ver histórico"><History size={13} /></AcaoBtn>
        </div>
      )}
    </div>
  );
}

function AcaoBtn({ onClick, color, title, children }: { onClick: () => void; color: string; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap"
      style={{ background: `${color}14`, border: `1px solid ${color}33`, color }}>
      {children}
    </button>
  );
}
