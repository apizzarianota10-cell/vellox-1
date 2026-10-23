"use client";

// Editor de sabores compartilhado — mesma experiência nos dois lugares:
//
//  • ProdutoForm ("O cliente escolhe"): usa <SaboresEditor> direto, em
//    estado local. Nada vai para o banco até o dono clicar "Salvar".
//  • Aba "Sabores" do catálogo: usa <SaboresDoProduto>, que envolve o mesmo
//    editor e grava NA HORA cada mudança (com aviso "Salvando… / Salvo").
//    Lá não existe botão "Salvar", então gravar direto é o que o dono espera.
//
// O dono só vê o que importa: nome, preço (vazio = normal), ativo/pausado,
// ordem, remover e "Misturar com os sabores de" (meio a meio entre produtos).
// Foto, descrição e grupos (Clássico/Premium) ficam fora do caminho principal;
// os dados existentes não são tocados (só nome/preco_adicional/ativo/ordem
// são gravados) e a loja continua exibindo foto/descrição.
// Regras de preço: ver "Sabores" em src/lib/produtoForm.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowUp, ArrowDown, Trash2, Plus, Check, Loader2, TriangleAlert } from "lucide-react";
import type { Produto, ProdutoSabor } from "@/types";
import {
  type NovoSabor, parsePreco, precoParaInput, brl, prepararNovosSabores, produtosLigados,
} from "@/lib/produtoForm";

// ── Tipos ────────────────────────────────────────────────────────────
export interface SaborItem {
  key: string;
  nome: string;
  /** "" = preço normal; senão o preço fixo ("45,90") */
  preco: string;
  ativo: boolean;
  /** grupo antigo (produto_categorias_sabor) — só exibido */
  grupo?: { nome: string; extra: number } | null;
}

export interface OpcaoVinculo { id: string; nome: string; observacao?: string }

export interface StatusGravacao { tipo: "salvando" | "salvo" | "erro"; texto: string }

interface EditorProps {
  itens: SaborItem[];
  cor: string;
  travado?: boolean;
  /** produto tem tamanhos → muda o texto de ajuda do preço */
  temTamanhos: boolean;
  /** retornar false = não gravou (mantém o texto no campo) */
  onAdicionar: (novos: NovoSabor[]) => void | boolean | Promise<void | boolean>;
  onRenomear: (key: string, nome: string) => void;
  onPreco: (key: string, preco: string) => void;
  onAlternarAtivo: (key: string) => void;
  /** chamado depois que o dono confirmou */
  onRemover: (key: string) => void;
  onMover?: (key: string, dir: -1 | 1) => void;
  /** acrescentado à pergunta de confirmação ao remover */
  avisoRemover?: string;
  status?: StatusGravacao | null;
  autoFocusAdicionar?: boolean;
  vinculo?: {
    opcoes: OpcaoVinculo[];
    selecionados: string[];
    /** nomes que entram pela cadeia (ligados aos ligados) */
    indiretos: string[];
    onAlternar: (id: string) => void;
  };
}

// ── Estilos (tokens do painel) ───────────────────────────────────────
const inputBase: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 10,
  border: "1px solid var(--border-1)", fontSize: 13.5, color: "var(--text-1)",
  background: "var(--bg-input)", outline: "none", minWidth: 0,
};
const iconBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border-1)",
  background: "var(--bg-1)", color: "var(--text-3)", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};

// ════════════════════════════════════════════════════════════════════
// Editor (sem banco)
// ════════════════════════════════════════════════════════════════════
export default function SaboresEditor({
  itens, cor, travado = false, temTamanhos, onAdicionar, onRenomear, onPreco, onAlternarAtivo,
  onRemover, onMover, avisoRemover, status, autoFocusAdicionar, vinculo,
}: EditorProps) {
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function mostrarAviso(msg: string) {
    setAviso(msg);
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(null), 4000);
  }
  useEffect(() => () => { if (avisoTimer.current) clearTimeout(avisoTimer.current); }, []);

  async function adicionar(valor: string): Promise<boolean> {
    if (travado || adicionando) return false;
    const { novos, repetidos } = prepararNovosSabores(valor, itens.map(i => i.nome));
    if (novos.length === 0) {
      if (repetidos.length > 0) mostrarAviso(repetidos.length === 1 ? `“${repetidos[0]}” já está na lista.` : `Esses ${repetidos.length} sabores já estão na lista.`);
      return false;
    }
    setAdicionando(true);
    try {
      // false = não gravou (o erro aparece no aviso de gravação)
      if ((await onAdicionar(novos)) === false) return false;
    } finally {
      setAdicionando(false);
    }
    const partes = [novos.length === 1 ? `“${novos[0].nome}” adicionado.` : `${novos.length} sabores adicionados.`];
    if (repetidos.length > 0) partes.push(`${repetidos.length} já existia${repetidos.length > 1 ? "m" : ""} e ficou de fora.`);
    mostrarAviso(partes.join(" "));
    return true;
  }

  async function enviarTexto() {
    if (!texto.trim()) return;
    const ok = await adicionar(texto);
    if (ok) setTexto("");
  }

  const ativos = itens.filter(i => i.ativo).length;
  const temGrupoComExtra = itens.some(i => i.grupo && i.grupo.extra > 0 && i.preco === "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* ── Adicionar ── */}
      <div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={texto}
            disabled={travado}
            autoFocus={autoFocusAdicionar}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); enviarTexto(); } }}
            onPaste={e => {
              const colado = e.clipboardData.getData("text");
              // Colou uma lista (várias linhas / vírgulas)? Vira vários sabores de uma vez.
              if (/[\n;,]/.test(colado.trim()) && prepararNovosSabores(colado, []).novos.length > 1) {
                e.preventDefault();
                adicionar((texto ? texto + "\n" : "") + colado).then(ok => { if (ok) setTexto(""); });
              }
            }}
            placeholder="Digite um sabor e aperte Enter (ex.: Calabresa)"
            aria-label="Novo sabor"
            style={{ ...inputBase, flex: 1, border: `1.5px solid ${texto ? cor + "80" : "var(--border-1)"}` }}
          />
          <button type="button" onClick={enviarTexto} disabled={travado || adicionando || !texto.trim()}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "0 14px", borderRadius: 10, border: "none",
              background: cor, color: "#fff", fontSize: 13, fontWeight: 800, flexShrink: 0,
              cursor: travado || !texto.trim() ? "not-allowed" : "pointer", opacity: !texto.trim() ? 0.5 : 1,
            }}>
            {adicionando ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={14} />}
            Adicionar
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 5, minHeight: 16 }}>
          <span style={{ fontSize: 11.5, color: aviso ? "var(--text-2)" : "var(--text-4)", fontWeight: aviso ? 700 : 500 }}>
            {aviso ?? "Dica: cole uma lista (um por linha ou separados por vírgula) para adicionar vários de uma vez."}
          </span>
          {status && (
            <span role="status" style={{
              display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, flexShrink: 0,
              color: status.tipo === "erro" ? "#dc2626" : status.tipo === "salvo" ? "#16a34a" : "var(--text-4)",
            }}>
              {status.tipo === "salvando" && <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />}
              {status.tipo === "salvo" && <Check size={12} />}
              {status.tipo === "erro" && <TriangleAlert size={12} />}
              {status.texto}
            </span>
          )}
        </div>
      </div>

      {/* ── Lista ── */}
      {itens.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--text-4)", margin: 0, padding: "10px 12px", borderRadius: 10, background: "var(--bg-2)", border: "1px dashed var(--border-1)" }}>
          Nenhum sabor ainda{vinculo && vinculo.selecionados.length > 0 ? " neste produto (os sabores misturados abaixo continuam aparecendo)" : ""}.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {itens.map((it, i) => (
            <LinhaSabor key={it.key} item={it} i={i} total={itens.length} cor={cor} travado={travado}
              onRenomear={n => onRenomear(it.key, n)}
              onPreco={p => onPreco(it.key, p)}
              onAtivo={() => onAlternarAtivo(it.key)}
              onRemover={() => {
                if (confirm(`Remover o sabor “${it.nome}”?${avisoRemover ?? ""}`)) onRemover(it.key);
              }}
              onMover={onMover ? d => onMover(it.key, d) : undefined} />
          ))}
          <p style={{ fontSize: 11.5, color: "var(--text-4)", margin: "2px 0 0", lineHeight: 1.5 }}>
            {itens.length} sabor{itens.length !== 1 ? "es" : ""}{ativos !== itens.length ? ` · ${itens.length - ativos} pausado${itens.length - ativos !== 1 ? "s" : ""}` : ""}.{" "}
            Preço vazio = preço normal{temTamanhos ? " do tamanho escolhido" : " do produto"}.
            Preencha só nos sabores mais caros (ex.: Camarão R$ 59,90){temTamanhos ? " — esse valor vale para qualquer tamanho" : ""}.
          </p>
          {temGrupoComExtra && (
            <p style={{ display: "flex", gap: 6, fontSize: 11.5, color: "var(--text-3)", margin: 0, lineHeight: 1.5 }}>
              <TriangleAlert size={13} style={{ color: "#d97706", flexShrink: 0, marginTop: 1 }} />
              O valor extra dos grupos (ex.: Premium) não é cobrado na loja. Para cobrar mais, preencha o preço do sabor.
            </p>
          )}
        </div>
      )}

      {/* ── Meio a meio entre produtos ── */}
      {vinculo && (
        <div style={{ marginTop: 4, padding: "12px 14px", borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
          <p style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-1)", margin: "0 0 2px" }}>Misturar com os sabores de:</p>
          <p style={{ fontSize: 11.5, color: "var(--text-4)", margin: "0 0 10px", lineHeight: 1.5 }}>
            Ex.: a Pizza G pode ter meio Calabresa da Pizza M. Cada sabor mantém o preço do produto de onde veio.
          </p>
          {vinculo.opcoes.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>Nenhum outro produto tem sabores ainda.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {vinculo.opcoes.map(o => {
                const on = vinculo.selecionados.includes(o.id);
                return (
                  <button key={o.id} type="button" disabled={travado} onClick={() => vinculo.onAlternar(o.id)}
                    aria-pressed={on}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 999,
                      fontSize: 12.5, fontWeight: 700, cursor: travado ? "not-allowed" : "pointer",
                      background: on ? cor : "var(--bg-1)", color: on ? "#fff" : "var(--text-2)",
                      border: `1px solid ${on ? cor : "var(--border-1)"}`,
                    }}>
                    {on ? <Check size={12} /> : <Plus size={12} />}
                    {o.nome}
                    {o.observacao && <span style={{ fontWeight: 500, opacity: 0.8 }}>({o.observacao})</span>}
                  </button>
                );
              })}
            </div>
          )}
          {vinculo.indiretos.length > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--text-4)", margin: "8px 0 0", lineHeight: 1.5 }}>
              Também entram, por estarem ligados a esses: {vinculo.indiretos.join(", ")}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Linha (nome e preço editáveis; grava ao sair do campo ou Enter) ──
function LinhaSabor({ item, i, total, cor, travado, onRenomear, onPreco, onAtivo, onRemover, onMover }: {
  item: SaborItem; i: number; total: number; cor: string; travado: boolean;
  onRenomear: (n: string) => void; onPreco: (p: string) => void; onAtivo: () => void; onRemover: () => void;
  onMover?: (d: -1 | 1) => void;
}) {
  const [nome, setNome] = useState(item.nome);
  const [preco, setPreco] = useState(item.preco);
  useEffect(() => { setNome(item.nome); }, [item.nome]);
  useEffect(() => { setPreco(item.preco); }, [item.preco]);

  const p = parsePreco(preco);
  const precoInvalido = p !== null && (Number.isNaN(p) || p < 0);

  const [editandoNome, setEditandoNome] = useState(false);

  function salvarNome() {
    setEditandoNome(false);
    const n = nome.replace(/\s+/g, " ").trim();
    if (!n) { setNome(item.nome); return; }
    if (n !== nome) setNome(n);
    if (n !== item.nome) onRenomear(n);
  }
  function salvarPreco() {
    if (precoInvalido) return; // fica vermelho até corrigir
    const norm = p === null || p === 0 ? "" : precoParaInput(p);
    setPreco(norm);
    if (norm !== item.preco) onPreco(norm);
  }

  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2"
      style={{ padding: "6px 8px", borderRadius: 12, background: item.ativo ? "var(--bg-1)" : "var(--bg-2)", border: "1px solid var(--border-1)" }}>
      {onMover && (
        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          <button type="button" style={{ ...iconBtn, width: 26, opacity: i === 0 ? 0.35 : 1 }} disabled={travado || i === 0} onClick={() => onMover(-1)} title="Subir" aria-label="Subir">
            <ArrowUp size={13} />
          </button>
          <button type="button" style={{ ...iconBtn, width: 26, opacity: i === total - 1 ? 0.35 : 1 }} disabled={travado || i === total - 1} onClick={() => onMover(1)} title="Descer" aria-label="Descer">
            <ArrowDown size={13} />
          </button>
        </div>
      )}
      <div className="basis-full sm:basis-0" style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, opacity: item.ativo ? 1 : 0.6 }}>
        <input value={nome} disabled={travado} aria-label={`Nome do sabor ${i + 1}`}
          onChange={e => setNome(e.target.value)}
          onBlur={salvarNome}
          onKeyDown={e => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { setNome(item.nome); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()); }
          }}
          onFocus={() => setEditandoNome(true)}
          title="Clique para mudar o nome"
          style={{
            ...inputBase, fontWeight: 700, padding: "7px 8px",
            border: editandoNome ? "1px solid var(--border-1)" : "1px solid transparent",
            background: editandoNome ? "var(--bg-input)" : "transparent",
          }} />
        {item.grupo && (
          <span style={{ fontSize: 10.5, color: "var(--text-4)", paddingLeft: 8 }}>
            Grupo {item.grupo.nome}{item.grupo.extra > 0 && item.preco === "" ? ` (+${brl(item.grupo.extra)} não cobrado)` : ""}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-1 sm:flex-none" style={{ minWidth: 0 }}>
        <div className="flex-1 sm:flex-none sm:w-[118px]" title="Vazio = preço normal"
          style={{
            display: "flex", alignItems: "center", gap: 4, borderRadius: 10, padding: "0 10px", minWidth: 0,
            border: `1px solid ${precoInvalido ? "#dc2626" : preco ? cor + "70" : "var(--border-1)"}`, background: "var(--bg-input)",
            opacity: item.ativo ? 1 : 0.6,
          }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-4)" }}>R$</span>
          <input value={preco} disabled={travado} inputMode="decimal" placeholder="normal" aria-label={`Preço do sabor ${i + 1} (vazio = normal)`}
            onChange={e => setPreco(e.target.value.replace(/[^\d.,]/g, ""))}
            onBlur={salvarPreco}
            onKeyDown={e => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { setPreco(item.preco); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()); }
            }}
            style={{ flex: 1, minWidth: 0, width: "100%", border: "none", outline: "none", background: "transparent", color: "var(--text-1)", fontSize: 13.5, fontWeight: 700, padding: "8px 0" }} />
        </div>
        <button type="button" onClick={onAtivo} disabled={travado}
          title={item.ativo ? "Pausar: some da loja, sem apagar" : "Voltar a mostrar na loja"}
          style={{
            padding: "0 10px", height: 30, borderRadius: 8, fontSize: 11.5, fontWeight: 800, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
            border: `1px solid ${item.ativo ? "rgba(22,163,74,0.35)" : "var(--border-1)"}`,
            background: item.ativo ? "rgba(22,163,74,0.08)" : "var(--bg-input)",
            color: item.ativo ? "#16a34a" : "var(--text-4)",
          }}>
          {item.ativo ? "Na loja" : "Pausado"}
        </button>
        <button type="button" style={{ ...iconBtn, color: "#E4002B", border: "1px solid rgba(228,0,43,0.25)" }} disabled={travado} onClick={onRemover} title="Remover" aria-label={`Remover ${item.nome}`}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Aba "Sabores" do catálogo: mesmo editor, gravando direto no banco
// ════════════════════════════════════════════════════════════════════

/** Ordena como a loja recebe (ordem; empate mantém a ordem original). */
export function saboresOrdenados(p: Produto): ProdutoSabor[] {
  return [...(p.produto_sabores ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

/** Itens do editor a partir dos sabores do banco. */
export function saboresParaItens(sabores: ProdutoSabor[], grupos: Produto["produto_categorias_sabor"]): SaborItem[] {
  return sabores.map(s => {
    const g = s.categoria_sabor_id ? grupos?.find(c => c.id === s.categoria_sabor_id) : null;
    return {
      key: s.id, nome: s.nome, preco: precoParaInput(s.preco_adicional, true), ativo: s.ativo,
      grupo: g ? { nome: g.nome, extra: g.preco_adicional ?? 0 } : null,
    };
  });
}

/** Chips de "Misturar com": outros produtos que têm sabores (ou que já estão ligados). */
export function opcoesDeVinculo(produtoId: string | null, produtos: Produto[], selecionados: string[]): OpcaoVinculo[] {
  return produtos
    .filter(o => o.id !== produtoId && ((o.produto_sabores?.length ?? 0) > 0 || selecionados.includes(o.id)))
    .map(o => {
      const ativos = o.produto_sabores?.filter(s => s.ativo).length ?? 0;
      return {
        id: o.id, nome: o.nome,
        observacao: !o.ativo ? "produto pausado" : ativos === 0 ? "sem sabores ativos" : undefined,
      };
    });
}

export function nomesIndiretos(produtoId: string, produtos: Produto[], selecionados: string[]): string[] {
  return produtosLigados(produtoId, produtos, selecionados)
    .filter(id => !selecionados.includes(id))
    .map(id => produtos.find(p => p.id === id)?.nome)
    .filter((n): n is string => Boolean(n));
}

export function SaboresDoProduto({ produto, produtos, cor, onAtualizarProduto, onAlternarVinculo }: {
  produto: Produto;
  produtos: Produto[];
  cor: string;
  /** aplica uma mudança no produto da lista local do catálogo */
  onAtualizarProduto: (id: string, fn: (p: Produto) => Produto) => void;
  /** vínculo simétrico (handleToggleVinculoSabor do catálogo — já grava e avisa erro) */
  onAlternarVinculo: (aId: string, bId: string) => void | Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<StatusGravacao | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const sabores = saboresOrdenados(produto);
  const itens = saboresParaItens(sabores, produto.produto_categorias_sabor);
  const temTamanhos = (produto.produto_variacoes?.filter(v => v.ativo).length ?? 0) > 0;
  const vinculados = produto.sabores_vinculo_ids ?? [];

  function setSabores(fn: (s: ProdutoSabor[]) => ProdutoSabor[]) {
    onAtualizarProduto(produto.id, p => ({ ...p, produto_sabores: fn(p.produto_sabores ?? []) }));
  }

  /** Grava com aviso. Em erro, desfaz a mudança local e mostra a mensagem. */
  async function gravar(acao: () => PromiseLike<{ error: { message: string } | null }>, desfazer?: () => void) {
    if (timer.current) clearTimeout(timer.current);
    setStatus({ tipo: "salvando", texto: "Salvando…" });
    let erro: string | null = null;
    try {
      const { error } = await acao();
      if (error) erro = error.message;
    } catch (e) {
      erro = e instanceof Error ? e.message : "sem conexão";
    }
    if (erro) {
      desfazer?.();
      setStatus({ tipo: "erro", texto: /fetch|network/i.test(erro) ? "Sem conexão — não salvou" : `Não salvou: ${erro}` });
      return false;
    }
    setStatus({ tipo: "salvo", texto: "Salvo" });
    timer.current = setTimeout(() => setStatus(null), 2500);
    return true;
  }

  async function adicionar(novos: NovoSabor[]) {
    const base = sabores.reduce((m, s) => Math.max(m, s.ordem ?? 0), -1) + 1;
    const linhas = novos.map((n, i) => {
      const p = parsePreco(n.preco);
      return {
        produto_id: produto.id, nome: n.nome, descricao: "",
        preco_adicional: p !== null && !Number.isNaN(p) && p > 0 ? p : null,
        ordem: base + i, ativo: true,
      };
    });
    let inseridos: ProdutoSabor[] = [];
    const ok = await gravar(async () => {
      const r = await supabase.from("produto_sabores").insert(linhas).select();
      inseridos = (r.data ?? []) as ProdutoSabor[];
      return r;
    });
    if (ok) setSabores(s => [...s, ...inseridos]);
    return ok;
  }

  function atualizar(id: string, patch: Partial<ProdutoSabor>) {
    const antes = sabores.find(s => s.id === id);
    if (!antes) return;
    const volta: Partial<ProdutoSabor> = {};
    (Object.keys(patch) as (keyof ProdutoSabor)[]).forEach(k => { (volta as Record<string, unknown>)[k] = antes[k]; });
    setSabores(s => s.map(x => x.id === id ? { ...x, ...patch } : x));
    gravar(
      () => supabase.from("produto_sabores").update(patch).eq("id", id),
      () => setSabores(s => s.map(x => x.id === id ? { ...x, ...volta } : x)),
    );
  }

  function remover(id: string) {
    const antes = produto.produto_sabores ?? [];
    setSabores(s => s.filter(x => x.id !== id));
    gravar(
      () => supabase.from("produto_sabores").delete().eq("id", id),
      () => setSabores(() => antes),
    );
  }

  function mover(id: string, dir: -1 | 1) {
    const i = sabores.findIndex(s => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sabores.length) return;
    const nova = [...sabores];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    // Renumera 0..n-1 (corrige ordens repetidas antigas) e grava só o que mudou.
    const mudou = nova.map((s, k) => ({ s, k })).filter(({ s, k }) => s.ordem !== k);
    const antes = produto.produto_sabores ?? [];
    setSabores(() => nova.map((s, k) => ({ ...s, ordem: k })));
    gravar(
      async () => {
        const res = await Promise.all(mudou.map(({ s, k }) => supabase.from("produto_sabores").update({ ordem: k }).eq("id", s.id)));
        return { error: res.find(r => r.error)?.error ?? null };
      },
      () => setSabores(() => antes),
    );
  }

  return (
    <SaboresEditor
      itens={itens}
      cor={cor}
      temTamanhos={temTamanhos}
      status={status}
      onAdicionar={adicionar}
      onRenomear={(id, nome) => atualizar(id, { nome })}
      onPreco={(id, preco) => {
        const p = parsePreco(preco);
        atualizar(id, { preco_adicional: p !== null && !Number.isNaN(p) && p > 0 ? p : null });
      }}
      onAlternarAtivo={id => {
        const s = sabores.find(x => x.id === id);
        if (s) atualizar(id, { ativo: !s.ativo });
      }}
      onRemover={remover}
      onMover={mover}
      vinculo={{
        opcoes: opcoesDeVinculo(produto.id, produtos, vinculados),
        selecionados: vinculados,
        indiretos: nomesIndiretos(produto.id, produtos, vinculados),
        onAlternar: outroId => { onAlternarVinculo(produto.id, outroId); },
      }}
    />
  );
}
