"use client";

// Formulário único de produto (criar e editar), no estilo cadastro comum.
// Tudo fica em estado local; só grava no banco ao clicar "Salvar".
// A lógica pura (diff dos filhos, validação, regras de preço da loja) está
// em src/lib/produtoForm.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadImage } from "@/lib/uploadImage";
import ImgComFallback from "@/components/ImgComFallback";
import {
  X, Plus, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, Upload, Loader2,
  Image as ImageIcon, TriangleAlert, Package, Check,
} from "lucide-react";
import type {
  Produto, ProdutoVariacao, ProdutoSabor, ProdutoAdicional, CategoriaSabor, CategoriaPreco,
} from "@/types";
import {
  type LinhaTamanho, type LinhaEscolha, type LinhaExtra,
  type VariacaoRow, type SaborRow, type AdicionalRow, type RecursosAvancados,
  parsePreco, precoParaInput, brl, diffFilhos, linhaEmBranco,
  linhasParaVariacoes, linhasParaSabores, linhasParaAdicionais,
  CAMPOS_VARIACAO, CAMPOS_SABOR, CAMPOS_ADICIONAL,
  validarProduto, derivarTipo, precoBaseComTamanhos, previaLoja,
  precoVariacaoLoja, temRecursoAvancado, novaKey,
} from "@/lib/produtoForm";

interface Props {
  /** null = novo produto */
  produto: Produto | null;
  empresaId: string;
  cor: string;
  /** categorias já usadas no catálogo (para o seletor) */
  categorias: string[];
  categoriasPreco: CategoriaPreco[];
  /** todos os produtos (nomes de vínculos e ordem do novo produto) */
  produtos: Produto[];
  onClose: () => void;
  /** chamado sempre que o produto é gravado (inclusive no meio do salvamento) */
  onChange: (p: Produto) => void;
  /** abre o editor antigo (só para produtos com recursos avançados) */
  onAbrirAvancado: (p: Produto) => void;
}

type Secao = "tamanhos" | "escolhas" | "extras";

const OPCOES_MAX = [1, 2, 3, 4];

// ── Estilos base (mesmos tokens do painel) ───────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 13px", borderRadius: 11,
  border: "1px solid var(--border-1)", fontSize: 14, color: "var(--text-1)",
  background: "var(--bg-input)", outline: "none", minWidth: 0,
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em",
  textTransform: "uppercase", display: "block", marginBottom: 7,
};
const iconBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border-1)",
  background: "var(--bg-1)", color: "var(--text-3)", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};

function msgErro(e: unknown): string {
  const m = (e as { message?: string })?.message ?? "";
  if (/failed to fetch|network/i.test(m)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  return m ? `Não foi possível salvar: ${m}` : "Não foi possível salvar. Tente de novo.";
}

export default function ProdutoForm({
  produto, empresaId, cor, categorias, categoriasPreco, produtos,
  onClose, onChange, onAbrirAvancado,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const editando = produto !== null;

  // ── Básico ──
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [descricao, setDescricao] = useState(produto?.descricao ?? "");
  const [preco, setPreco] = useState(produto ? precoParaInput(produto.preco) : "");
  const [categoria, setCategoria] = useState(produto?.categoria ?? categorias[0] ?? "");
  const [novaCategoria, setNovaCategoria] = useState(false);
  const [imagemUrl, setImagemUrl] = useState(produto?.imagem_url ?? "");
  const [ativo, setAtivo] = useState(produto?.ativo ?? true);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  // ── Opções ──
  const [tamanhos, setTamanhos] = useState<LinhaTamanho[]>([]);
  const [escolhas, setEscolhas] = useState<LinhaEscolha[]>([]);
  const [extras, setExtras] = useState<LinhaExtra[]>([]);
  const [abertas, setAbertas] = useState<Record<Secao, boolean>>({ tamanhos: false, escolhas: false, extras: false });
  const [maxPorTamanho, setMaxPorTamanho] = useState(false);
  const [gruposSabor, setGruposSabor] = useState<CategoriaSabor[]>([]);

  // ── Controle ──
  const [carregando, setCarregando] = useState(editando);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const errosRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<string>("");
  const produtoIdRef = useRef<string | null>(produto?.id ?? null);
  const originaisRef = useRef<{
    vars: (VariacaoRow & { id: string })[];
    sabs: (SaborRow & { id: string })[];
    adds: (AdicionalRow & { id: string })[];
    sabsCompletos: ProdutoSabor[];
  }>({ vars: [], sabs: [], adds: [], sabsCompletos: [] });

  // ── Recursos avançados (preservados, não editados aqui) ──
  const recursos: RecursosAvancados = useMemo(() => {
    const cp = produto?.categoria_preco_id ? categoriasPreco.find(c => c.id === produto.categoria_preco_id) : null;
    const vinc = (produto?.sabores_vinculo_ids ?? [])
      .map(id => produtos.find(p => p.id === id)?.nome)
      .filter((n): n is string => Boolean(n));
    return {
      tabelaPreco: produto?.categoria_preco_id ? (cp?.nome ?? "tabela de preços") : null,
      gruposDeSabor: gruposSabor.length > 0 || originaisRef.current.sabsCompletos.some(s => s.categoria_sabor_id),
      vinculados: vinc,
      mesclar: Boolean(produto?.mesclar_sabores),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produto, categoriasPreco, produtos, gruposSabor, carregando]);
  const avancado = temRecursoAvancado(recursos);
  const tamanhosEditaveis = !recursos.tabelaPreco;
  const temVinculo = recursos.vinculados.length > 0 || recursos.mesclar;

  function estadoAtual() {
    return JSON.stringify({ nome, descricao, preco, categoria, imagemUrl, ativo, tamanhos, escolhas, extras });
  }

  // ── Carrega os filhos do banco (edição) ──
  useEffect(() => {
    if (!produto) {
      snapshotRef.current = estadoAtual();
      return;
    }
    let cancelado = false;
    (async () => {
      const [rv, rs, ra, rc] = await Promise.all([
        supabase.from("produto_variacoes").select("*").eq("produto_id", produto.id).order("ordem"),
        supabase.from("produto_sabores").select("*").eq("produto_id", produto.id).order("ordem"),
        supabase.from("produto_adicionais").select("*").eq("produto_id", produto.id).order("ordem"),
        supabase.from("produto_categorias_sabor").select("*").eq("produto_id", produto.id).order("ordem"),
      ]);
      if (cancelado) return;
      const erro = rv.error || rs.error || ra.error || rc.error;
      if (erro) { setErroCarga("Não foi possível carregar as opções deste produto. Feche e tente de novo."); setCarregando(false); return; }
      const vars = (rv.data ?? []) as ProdutoVariacao[];
      const sabs = (rs.data ?? []) as ProdutoSabor[];
      const adds = (ra.data ?? []) as ProdutoAdicional[];
      originaisRef.current = {
        vars: vars.map(v => ({ id: v.id, nome: v.nome, preco: v.preco, max_sabores: v.max_sabores, ordem: v.ordem, ativo: v.ativo })),
        sabs: sabs.map(s => ({ id: s.id, nome: s.nome, preco_adicional: s.preco_adicional, ordem: s.ordem, ativo: s.ativo })),
        adds: adds.map(a => ({ id: a.id, nome: a.nome, preco: a.preco, obrigatorio: a.obrigatorio, ordem: a.ordem, ativo: a.ativo })),
        sabsCompletos: sabs,
      };
      // Tamanho com preço 0 usa o preço do produto na loja — já mostra esse valor.
      const lt: LinhaTamanho[] = vars.map(v => ({
        key: v.id, id: v.id, nome: v.nome,
        preco: precoParaInput(v.preco > 0 ? v.preco : produto.preco),
        maxEscolhas: Math.max(1, v.max_sabores || 1), ativo: v.ativo,
      }));
      const le: LinhaEscolha[] = sabs.map(s => ({
        key: s.id, id: s.id, nome: s.nome, preco: precoParaInput(s.preco_adicional, true), ativo: s.ativo,
      }));
      const lx: LinhaExtra[] = adds.map(a => ({
        key: a.id, id: a.id, nome: a.nome, preco: precoParaInput(a.preco, true), obrigatorio: a.obrigatorio, ativo: a.ativo,
      }));
      setTamanhos(lt); setEscolhas(le); setExtras(lx);
      setGruposSabor((rc.data ?? []) as CategoriaSabor[]);
      setMaxPorTamanho(new Set(lt.map(t => t.maxEscolhas)).size > 1);
      setAbertas({ tamanhos: lt.length > 0, escolhas: le.length > 0 || (produto.sabores_vinculo_ids ?? []).length > 0, extras: lx.length > 0 });
      snapshotRef.current = JSON.stringify({
        nome: produto.nome, descricao: produto.descricao ?? "", preco: precoParaInput(produto.preco),
        categoria: produto.categoria, imagemUrl: produto.imagem_url ?? "", ativo: produto.ativo,
        tamanhos: lt, escolhas: le, extras: lx,
      });
      setCarregando(false);
    })();
    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sujo = !carregando && snapshotRef.current !== "" && estadoAtual() !== snapshotRef.current;

  function tentarFechar() {
    if (salvando) return;
    if (sujo && !confirm("Sair sem salvar? As alterações serão perdidas.")) return;
    onClose();
  }

  function abrirAvancado() {
    if (!produto) return;
    if (sujo && !confirm("Abrir o editor avançado descarta o que você mudou aqui. Continuar?")) return;
    onAbrirAvancado(produto);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") tentarFechar(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Foto ──
  async function enviarFoto(file: File) {
    setEnviandoFoto(true);
    try {
      const url = await uploadImage(file, "vellox/produtos");
      setImagemUrl(url);
    } catch (e) {
      setErros([e instanceof Error ? `Erro ao enviar a foto: ${e.message}` : "Erro ao enviar a foto."]);
    } finally {
      setEnviandoFoto(false);
    }
  }

  // ── Helpers de lista ──
  function mover<T>(lista: T[], i: number, dir: -1 | 1): T[] {
    const j = i + dir;
    if (j < 0 || j >= lista.length) return lista;
    const nova = [...lista];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    return nova;
  }

  const maxGlobal = tamanhos[0]?.maxEscolhas ?? 1;

  function addTamanho() {
    setTamanhos(t => [...t, { key: novaKey(), nome: "", preco: "", maxEscolhas: t[t.length - 1]?.maxEscolhas ?? 1, ativo: true }]);
  }
  function addEscolha() { setEscolhas(e => [...e, { key: novaKey(), nome: "", preco: "", ativo: true }]); }
  function addExtra() { setExtras(x => [...x, { key: novaKey(), nome: "", preco: "", obrigatorio: false, ativo: true }]); }

  function abrirSecao(s: Secao) {
    setAbertas(a => ({ ...a, [s]: true }));
    if (s === "tamanhos" && tamanhos.length === 0) setTamanhos([
      { key: novaKey(), nome: "", preco: "", maxEscolhas: 1, ativo: true },
    ]);
    if (s === "escolhas" && escolhas.length === 0) addEscolha();
    if (s === "extras" && extras.length === 0) addExtra();
  }

  function removerSecao(s: Secao) {
    const nomes = { tamanhos: "todos os tamanhos", escolhas: "todas as opções de escolha", extras: "todos os adicionais" };
    const temAlgo = s === "tamanhos" ? tamanhos.some(l => !linhaEmBranco(l)) : s === "escolhas" ? escolhas.some(l => !linhaEmBranco(l)) : extras.some(l => !linhaEmBranco(l));
    if (temAlgo && !confirm(`Remover ${nomes[s]}? (Só é apagado de verdade quando você clicar em Salvar.)`)) return;
    if (s === "tamanhos") setTamanhos([]);
    if (s === "escolhas") setEscolhas([]);
    if (s === "extras") setExtras([]);
    setAbertas(a => ({ ...a, [s]: false }));
  }

  // ── Dados derivados (prévia) ──
  const tamanhosValidos = tamanhosEditaveis ? tamanhos.filter(l => !linhaEmBranco(l)) : [];
  const temTamanhos = tamanhosValidos.length > 0;
  const escolhasValidas = escolhas.filter(l => !linhaEmBranco(l));
  const usaEscolhas = escolhasValidas.length > 0 || temVinculo;

  const precoNumerico = (() => {
    if (temTamanhos) {
      const b = precoBaseComTamanhos(linhasParaVariacoes(tamanhos, usaEscolhas));
      return b ?? 0;
    }
    const p = parsePreco(preco);
    return p !== null && !Number.isNaN(p) ? p : 0;
  })();

  const previa = useMemo(() => {
    const varsPrevia = tamanhosEditaveis
      ? linhasParaVariacoes(tamanhos, usaEscolhas)
      : originaisRef.current.vars;
    const sabs = linhasParaSabores(escolhas);
    const adds = linhasParaAdicionais(extras);
    const tipoPrevia = avancado
      ? (produto?.tipo ?? "simples")
      : derivarTipo(produto?.tipo, varsPrevia.filter(v => v.ativo).length, sabs.filter(s => s.ativo).length, adds.filter(a => a.ativo).length);
    return {
      tipo: tipoPrevia,
      ...previaLoja({
        tipo: tipoPrevia,
        preco: precoNumerico,
        categoria_preco_id: produto?.categoria_preco_id ?? null,
        variacoes: varsPrevia,
        sabores: sabs,
        adicionais: adds,
        temSaboresVinculados: temVinculo,
      }, categoriasPreco),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tamanhos, escolhas, extras, precoNumerico, usaEscolhas, tamanhosEditaveis, avancado, produto, categoriasPreco, temVinculo, carregando]);

  // ── Salvar ──
  async function sincronizar<R extends object>(
    tabela: "produto_variacoes" | "produto_sabores" | "produto_adicionais",
    produtoId: string,
    originais: (R & { id: string })[],
    desejados: (R & { id?: string })[],
    campos: (keyof R)[],
  ): Promise<Record<string, unknown>[]> {
    const d = diffFilhos(originais, desejados, campos);
    if (d.remover.length > 0) {
      const { error } = await supabase.from(tabela).delete().in("id", d.remover);
      if (error) throw error;
    }
    if (d.atualizar.length > 0) {
      const res = await Promise.all(d.atualizar.map(u => supabase.from(tabela).update(u.patch as Record<string, unknown>).eq("id", u.id)));
      const err = res.find(r => r.error)?.error;
      if (err) throw err;
    }
    if (d.inserir.length > 0) {
      const { error } = await supabase.from(tabela).insert(d.inserir.map(r => ({ ...r, produto_id: produtoId })));
      if (error) throw error;
    }
    const { data, error } = await supabase.from(tabela).select("*").eq("produto_id", produtoId).order("ordem");
    if (error) throw error;
    return (data ?? []) as Record<string, unknown>[];
  }

  /** Depois de sincronizar, grava os ids do banco nas linhas (salvar de novo não duplica). */
  function comIds<L extends { key: string; id?: string; nome: string; preco: string }>(linhas: L[], doBanco: { id: string; nome?: unknown }[]): L[] {
    const validas = linhas.filter(l => !linhaEmBranco(l));
    if (validas.length === doBanco.length) return validas.map((l, i) => ({ ...l, id: doBanco[i].id }));
    // Contagem diferente (alguém mexeu no banco ao mesmo tempo): casa pelo nome.
    const livres = [...doBanco];
    return validas.map(l => {
      const idx = livres.findIndex(r => (l.id && r.id === l.id) || r.nome === l.nome.trim());
      if (idx < 0) return { ...l, id: undefined };
      const [r] = livres.splice(idx, 1);
      return { ...l, id: r.id };
    });
  }

  async function salvar() {
    if (salvando || carregando) return;
    const errs = validarProduto({ nome, categoria, preco, tamanhosEditaveis, tamanhos, escolhas, extras });
    if (errs.length > 0) {
      setErros(errs);
      requestAnimationFrame(() => errosRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    setErros([]);
    setSalvando(true);
    // Fotografa as linhas — os inputs ficam travados enquanto salva.
    const linhasTam = tamanhos, linhasEsc = escolhas, linhasExt = extras;
    try {
      const vars = tamanhosEditaveis ? linhasParaVariacoes(linhasTam, usaEscolhas) : null;
      const sabs = linhasParaSabores(linhasEsc);
      const adds = linhasParaAdicionais(linhasExt);
      const nTamAtivos = vars ? vars.filter(v => v.ativo).length : originaisRef.current.vars.filter(v => v.ativo).length;
      const precoFinal = vars && vars.length > 0 ? (precoBaseComTamanhos(vars) ?? 0) : (parsePreco(preco) ?? 0);
      const tipo = avancado
        ? (produto?.tipo ?? "simples")
        : derivarTipo(produto?.tipo, nTamAtivos, sabs.filter(s => s.ativo).length, adds.filter(a => a.ativo).length);

      // Só os campos que este formulário edita — o resto do produto fica intacto.
      const payload = {
        nome: nome.trim(),
        descricao: descricao.trim(),
        preco: precoFinal,
        categoria: categoria.trim(),
        imagem_url: imagemUrl || null,
        ativo,
        tipo,
      };

      let row: Produto;
      if (produtoIdRef.current) {
        const { data, error } = await supabase.from("produtos").update(payload).eq("id", produtoIdRef.current).select().single();
        if (error) throw error;
        row = data as Produto;
      } else {
        const { data, error } = await supabase.from("produtos").insert({
          ...payload,
          empresa_id: empresaId,
          ordem: produtos.length,
          variantes_label: vars && vars.length > 0 ? "Tamanhos" : null,
        }).select().single();
        if (error) throw error;
        row = data as Produto;
        produtoIdRef.current = row.id;
        onChange({ ...row, produto_variacoes: [], produto_sabores: [], produto_adicionais: [], produto_categorias_sabor: [] });
      }
      const pid = row.id;

      let varsBanco: ProdutoVariacao[];
      if (vars) {
        varsBanco = await sincronizar<VariacaoRow>("produto_variacoes", pid, originaisRef.current.vars, vars, CAMPOS_VARIACAO) as unknown as ProdutoVariacao[];
        originaisRef.current.vars = varsBanco.map(v => ({ id: v.id, nome: v.nome, preco: v.preco, max_sabores: v.max_sabores, ordem: v.ordem, ativo: v.ativo }));
        setTamanhos(comIds(linhasTam, varsBanco));
      } else {
        const { data, error } = await supabase.from("produto_variacoes").select("*").eq("produto_id", pid).order("ordem");
        if (error) throw error;
        varsBanco = (data ?? []) as ProdutoVariacao[];
      }

      const sabsBanco = await sincronizar<SaborRow>("produto_sabores", pid, originaisRef.current.sabs, sabs, CAMPOS_SABOR) as unknown as ProdutoSabor[];
      originaisRef.current.sabs = sabsBanco.map(s => ({ id: s.id, nome: s.nome, preco_adicional: s.preco_adicional, ordem: s.ordem, ativo: s.ativo }));
      originaisRef.current.sabsCompletos = sabsBanco;
      setEscolhas(comIds(linhasEsc, sabsBanco));

      const addsBanco = await sincronizar<AdicionalRow>("produto_adicionais", pid, originaisRef.current.adds, adds, CAMPOS_ADICIONAL) as unknown as ProdutoAdicional[];
      originaisRef.current.adds = addsBanco.map(a => ({ id: a.id, nome: a.nome, preco: a.preco, obrigatorio: a.obrigatorio, ordem: a.ordem, ativo: a.ativo }));
      setExtras(comIds(linhasExt, addsBanco));

      onChange({
        ...row,
        produto_variacoes: varsBanco,
        produto_sabores: sabsBanco,
        produto_adicionais: addsBanco,
        produto_categorias_sabor: gruposSabor,
      });
      onClose();
    } catch (e) {
      setErros([msgErro(e)]);
      requestAnimationFrame(() => errosRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } finally {
      setSalvando(false);
    }
  }

  // ── Listas para o seletor de categoria ──
  const listaCategorias = useMemo(() => {
    const s = new Set(categorias.filter(Boolean));
    if (produto?.categoria) s.add(produto.categoria);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [categorias, produto]);
  const categoriaForaDaLista = categoria !== "" && !listaCategorias.includes(categoria);
  const mostrarInputCategoria = novaCategoria || listaCategorias.length === 0 || categoriaForaDaLista;

  const travado = salvando || carregando;

  // ════════════════════════════════════════════════════════════════
  return (
    <div
      className="fixed inset-0 flex items-stretch md:items-center justify-center md:p-6"
      style={{ zIndex: 300, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div
        className="w-full h-full md:h-auto max-h-[100dvh] md:max-h-[92vh] flex flex-col md:rounded-[22px]"
        style={{
          background: "var(--bg-1)", maxWidth: 1060,
          boxShadow: "0 24px 64px rgba(0,0,0,0.25)", border: "1px solid var(--border-1)", overflow: "hidden",
        }}>

        {/* ── Cabeçalho ── */}
        <div className="flex items-center justify-between gap-3 px-4 md:px-6" style={{ paddingTop: 16, paddingBottom: 16, borderBottom: "1px solid var(--border-1)", flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 18, fontWeight: 900, color: "var(--text-1)", margin: 0, letterSpacing: "-0.02em" }}>
              {editando ? "Editar produto" : "Novo produto"}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-4)", margin: "2px 0 0" }}>
              Preencha o básico. Tamanhos, escolhas e adicionais são opcionais.
            </p>
          </div>
          <button onClick={tentarFechar} aria-label="Fechar"
            style={{ ...iconBtn, width: 34, height: 34, background: "var(--bg-input)", border: "none" }}>
            <X size={17} />
          </button>
        </div>

        {/* ── Corpo ── */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {carregando ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "80px 20px", color: "var(--text-4)", fontSize: 13 }}>
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Carregando produto…
            </div>
          ) : erroCarga ? (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "#dc2626", fontSize: 14, fontWeight: 600 }}>{erroCarga}</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 p-4 md:p-6">

              {/* ═══ Coluna do formulário ═══ */}
              <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>

                {erros.length > 0 && (
                  <div ref={errosRef} role="alert" style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.35)" }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: "#dc2626", margin: "0 0 4px" }}>
                      {erros.length === 1 ? "Falta ajustar uma coisa:" : `Falta ajustar ${erros.length} coisas:`}
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
                      {erros.map((e, i) => <li key={i} style={{ fontSize: 12.5, color: "#dc2626" }}>{e}</li>)}
                    </ul>
                  </div>
                )}

                {avancado && produto && (
                  <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                    <TriangleAlert size={16} style={{ color: "#d97706", flexShrink: 0, marginTop: 1 }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-2)", margin: 0 }}>
                        Este produto tem ajustes especiais que continuam valendo:
                      </p>
                      <ul style={{ margin: "4px 0 6px", paddingLeft: 16, fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
                        {recursos.tabelaPreco && <li>Os tamanhos e preços vêm da tabela de preços “{recursos.tabelaPreco}”.</li>}
                        {recursos.gruposDeSabor && <li>As opções de escolha estão separadas em grupos.</li>}
                        {recursos.vinculados.length > 0 && <li>Mostra também as opções de: {recursos.vinculados.join(", ")}.</li>}
                        {recursos.mesclar && <li>Mistura opções de outros produtos.</li>}
                      </ul>
                      <button onClick={abrirAvancado} type="button"
                        style={{ background: "none", border: "none", padding: 0, fontSize: 12.5, fontWeight: 800, color: cor, cursor: "pointer", textDecoration: "underline" }}>
                        Abrir editor avançado
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Básico ── */}
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Foto */}
                  <div style={{ flexShrink: 0 }}>
                    <span style={labelStyle}>Foto</span>
                    <input ref={fotoRef} type="file" accept="image/*" style={{ display: "none" }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) enviarFoto(f); e.target.value = ""; }} />
                    <div
                      onClick={() => !travado && fotoRef.current?.click()}
                      className="w-full sm:w-[140px]"
                      style={{
                        height: 140, borderRadius: 14, border: "2px dashed var(--border-1)", background: "var(--bg-input)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", overflow: "hidden", position: "relative",
                      }}>
                      {enviandoFoto ? (
                        <Loader2 size={20} style={{ color: "var(--text-4)", animation: "spin 1s linear infinite" }} />
                      ) : imagemUrl ? (
                        <ImgComFallback src={imagemUrl} alt="Foto do produto" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          fallback={<ImageIcon size={26} style={{ color: "var(--text-5)" }} />} />
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 10, textAlign: "center" }}>
                          <Upload size={20} style={{ color: "var(--text-4)" }} />
                          <span style={{ fontSize: 11.5, color: "var(--text-4)", fontWeight: 600 }}>Enviar foto</span>
                        </div>
                      )}
                      {imagemUrl && !enviandoFoto && (
                        <button type="button" aria-label="Remover foto"
                          onClick={e => { e.stopPropagation(); setImagemUrl(""); }}
                          style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 6, padding: 4, color: "#fff", cursor: "pointer", display: "flex" }}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Nome + categoria */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
                    <div>
                      <label style={labelStyle} htmlFor="pf-nome">Nome *</label>
                      <input id="pf-nome" value={nome} onChange={e => setNome(e.target.value)} disabled={travado}
                        placeholder="Ex.: X-Burguer, Pizza Calabresa, Suco natural" style={inputStyle} autoFocus={!editando} />
                    </div>
                    <div>
                      <label style={labelStyle} htmlFor="pf-cat">Categoria *</label>
                      {!mostrarInputCategoria ? (
                        <select id="pf-cat" value={categoria} disabled={travado}
                          onChange={e => {
                            if (e.target.value === "__nova__") { setNovaCategoria(true); setCategoria(""); }
                            else setCategoria(e.target.value);
                          }}
                          style={{ ...inputStyle, cursor: "pointer" }}>
                          {categoria === "" && <option value="">Escolha…</option>}
                          {listaCategorias.map(c => <option key={c} value={c}>{c}</option>)}
                          <option value="__nova__">+ Nova categoria…</option>
                        </select>
                      ) : (
                        <div style={{ display: "flex", gap: 8 }}>
                          <input id="pf-cat" value={categoria} onChange={e => setCategoria(e.target.value)} disabled={travado}
                            placeholder="Ex.: Lanches, Bebidas, Pizzas" style={inputStyle} autoFocus={novaCategoria} />
                          {listaCategorias.length > 0 && (
                            <button type="button" onClick={() => { setNovaCategoria(false); setCategoria(listaCategorias[0]); }}
                              style={{ padding: "0 12px", borderRadius: 11, border: "1px solid var(--border-1)", background: "var(--bg-1)", color: "var(--text-3)", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                              Escolher da lista
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label style={labelStyle} htmlFor="pf-desc">Descrição <span style={{ textTransform: "none", fontWeight: 500 }}>(opcional)</span></label>
                  <textarea id="pf-desc" value={descricao} onChange={e => setDescricao(e.target.value)} disabled={travado} rows={2}
                    placeholder="Ingredientes, tamanho da porção, observações…"
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", fontSize: 13.5 }} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label style={labelStyle} htmlFor="pf-preco">Preço *</label>
                    {temTamanhos ? (
                      <div style={{ ...inputStyle, background: "var(--bg-2)", color: "var(--text-2)", fontWeight: 700 }}>
                        A partir de {brl(precoNumerico)}
                      </div>
                    ) : (
                      <CampoPreco id="pf-preco" value={preco} onChange={setPreco} disabled={travado} placeholder="0,00" />
                    )}
                    {temTamanhos && (
                      <p style={{ fontSize: 11.5, color: "var(--text-4)", margin: "6px 0 0" }}>
                        Com tamanhos, o cliente vê “a partir de” o menor preço. Cada tamanho tem seu preço abaixo.
                      </p>
                    )}
                  </div>
                  <div>
                    <span style={labelStyle}>Disponível na loja</span>
                    <button type="button" onClick={() => setAtivo(a => !a)} disabled={travado}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                        padding: "9px 13px", borderRadius: 11, border: "1px solid var(--border-1)", background: "var(--bg-input)", cursor: "pointer",
                      }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: ativo ? "#16a34a" : "var(--text-4)" }}>
                        {ativo ? "Ativo — aparece na loja" : "Pausado — escondido"}
                      </span>
                      <span style={{ width: 40, height: 22, borderRadius: 11, background: ativo ? "#22c55e" : "var(--border-2)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                        <span style={{ position: "absolute", top: 2, left: ativo ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                      </span>
                    </button>
                  </div>
                </div>

                {/* ── Tamanhos ── */}
                <SecaoOpcional
                  titulo="Tamanhos"
                  exemplo="Ex.: P, M, G · 300 ml, 500 ml · Copo, Jarra"
                  explicacao="Cada tamanho tem seu próprio preço. O cliente escolhe um."
                  aberta={abertas.tamanhos || !tamanhosEditaveis}
                  rotuloAdicionar="+ Adicionar tamanhos"
                  onAbrir={() => abrirSecao("tamanhos")}
                  onRemover={tamanhosEditaveis ? () => removerSecao("tamanhos") : undefined}
                  cor={cor} travado={travado}>
                  {!tamanhosEditaveis ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {originaisRef.current.vars.length === 0 && (
                        <p style={{ fontSize: 12.5, color: "var(--text-4)", margin: 0 }}>Nenhum tamanho selecionado.</p>
                      )}
                      {originaisRef.current.vars.map(v => (
                        <div key={v.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", borderRadius: 10, background: "var(--bg-input)", border: "1px solid var(--border-1)", opacity: v.ativo ? 1 : 0.55 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{v.nome}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: cor }}>{brl(precoVariacaoLoja({ preco: precoNumerico, categoria_preco_id: produto?.categoria_preco_id ?? null }, v, categoriasPreco))}</span>
                        </div>
                      ))}
                      <p style={{ fontSize: 11.5, color: "var(--text-4)", margin: "4px 0 0" }}>
                        Para mudar estes tamanhos, use o editor avançado.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {tamanhos.map((l, i) => (
                        <div key={l.key} className="flex flex-wrap sm:flex-nowrap items-center gap-2" style={{ opacity: l.ativo ? 1 : 0.55 }}>
                          <input value={l.nome} disabled={travado} aria-label={`Nome do tamanho ${i + 1}`}
                            onChange={e => setTamanhos(t => t.map(x => x.key === l.key ? { ...x, nome: e.target.value } : x))}
                            placeholder={["Ex.: P", "Ex.: M", "Ex.: G"][i] ?? "Nome do tamanho"}
                            className="basis-full sm:basis-0" style={{ ...inputStyle, flexGrow: 1, padding: "9px 12px" }} />
                          <div className="flex-1 sm:flex-none sm:w-[120px]" style={{ minWidth: 0 }}>
                            <CampoPreco value={l.preco} disabled={travado} compacto aria-label={`Preço do tamanho ${i + 1}`}
                              onChange={v => setTamanhos(t => t.map(x => x.key === l.key ? { ...x, preco: v } : x))} />
                          </div>
                          <ControlesLinha
                            i={i} total={tamanhos.length} ativo={l.ativo} travado={travado}
                            onMover={d => setTamanhos(t => mover(t, i, d))}
                            onAtivo={() => setTamanhos(t => t.map(x => x.key === l.key ? { ...x, ativo: !x.ativo } : x))}
                            onRemover={() => setTamanhos(t => t.filter(x => x.key !== l.key))} />
                        </div>
                      ))}
                      <BotaoAddLinha onClick={addTamanho} travado={travado}>Adicionar tamanho</BotaoAddLinha>
                    </div>
                  )}
                </SecaoOpcional>

                {/* ── O cliente escolhe ── */}
                <SecaoOpcional
                  titulo="O cliente escolhe"
                  exemplo="Ex.: sabor da pizza, carne da quentinha, fruta do suco"
                  explicacao="O cliente é obrigado a escolher uma destas opções antes de colocar no carrinho. Na loja aparece como “Sabor”."
                  aberta={abertas.escolhas}
                  rotuloAdicionar="+ Adicionar opções de escolha"
                  onAbrir={() => abrirSecao("escolhas")}
                  onRemover={() => removerSecao("escolhas")}
                  cor={cor} travado={travado}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {escolhas.map((l, i) => (
                      <div key={l.key} className="flex flex-wrap sm:flex-nowrap items-center gap-2" style={{ opacity: l.ativo ? 1 : 0.55 }}>
                        <input value={l.nome} disabled={travado} aria-label={`Opção ${i + 1}`}
                          onChange={e => setEscolhas(t => t.map(x => x.key === l.key ? { ...x, nome: e.target.value } : x))}
                          placeholder={["Ex.: Calabresa", "Ex.: Frango com catupiry", "Ex.: Portuguesa"][i] ?? "Nome da opção"}
                          className="basis-full sm:basis-0" style={{ ...inputStyle, flexGrow: 1, padding: "9px 12px" }} />
                        <div className="flex-1 sm:flex-none sm:w-[120px]" style={{ minWidth: 0 }}>
                          <CampoPreco value={l.preco} disabled={travado} compacto placeholder="Normal" aria-label={`Preço da opção ${i + 1}`}
                            onChange={v => setEscolhas(t => t.map(x => x.key === l.key ? { ...x, preco: v } : x))} />
                        </div>
                        <ControlesLinha
                          i={i} total={escolhas.length} ativo={l.ativo} travado={travado}
                          onMover={d => setEscolhas(t => mover(t, i, d))}
                          onAtivo={() => setEscolhas(t => t.map(x => x.key === l.key ? { ...x, ativo: !x.ativo } : x))}
                          onRemover={() => setEscolhas(t => t.filter(x => x.key !== l.key))} />
                      </div>
                    ))}
                    <BotaoAddLinha onClick={addEscolha} travado={travado}>Adicionar opção</BotaoAddLinha>
                    <p style={{ fontSize: 11.5, color: "var(--text-4)", margin: "2px 0 0", lineHeight: 1.5 }}>
                      Preço: deixe vazio para cobrar o preço normal{temTamanhos ? " do tamanho escolhido" : " do produto"}.
                      Se preencher, essa opção passa a custar esse valor{temTamanhos ? " em qualquer tamanho" : ""}.
                    </p>

                    {/* Quantos o cliente pode escolher */}
                    <div style={{ marginTop: 6, padding: "12px 14px", borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
                      <p style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-1)", margin: "0 0 2px" }}>Quantas o cliente pode escolher?</p>
                      {!tamanhosEditaveis ? (
                        <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>Definido pela tabela de preços (editor avançado).</p>
                      ) : !temTamanhos ? (
                        <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0, lineHeight: 1.5 }}>
                          1 opção. Para deixar escolher mais de uma (ex.: pizza meio a meio), adicione tamanhos acima — aí você define quantas em cada tamanho.
                        </p>
                      ) : (
                        <>
                          <p style={{ fontSize: 12, color: "var(--text-4)", margin: "0 0 10px" }}>
                            Ex.: pizza grande com até 2 sabores. Com mais de uma, o cliente paga pela opção mais cara (ou a média, conforme as Configurações).
                          </p>
                          {!maxPorTamanho ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <SeletorQtd valor={maxGlobal} cor={cor} travado={travado}
                                onChange={n => setTamanhos(t => t.map(x => ({ ...x, maxEscolhas: n })))} />
                              {tamanhosValidos.length > 1 && (
                                <button type="button" onClick={() => setMaxPorTamanho(true)} disabled={travado}
                                  style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, color: "var(--text-3)", cursor: "pointer", textDecoration: "underline" }}>
                                  Diferente por tamanho
                                </button>
                              )}
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {tamanhos.filter(l => !linhaEmBranco(l)).map(l => (
                                <div key={l.key} className="flex flex-wrap items-center gap-2">
                                  <span style={{ minWidth: 70, fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>{l.nome.trim() || "Sem nome"}</span>
                                  <SeletorQtd valor={l.maxEscolhas} cor={cor} travado={travado}
                                    onChange={n => setTamanhos(t => t.map(x => x.key === l.key ? { ...x, maxEscolhas: n } : x))} />
                                </div>
                              ))}
                              <button type="button" disabled={travado}
                                onClick={() => { setMaxPorTamanho(false); setTamanhos(t => t.map(x => ({ ...x, maxEscolhas: maxGlobal }))); }}
                                style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, color: "var(--text-3)", cursor: "pointer", textDecoration: "underline" }}>
                                Mesma quantidade em todos
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </SecaoOpcional>

                {/* ── Adicionais ── */}
                <SecaoOpcional
                  titulo="Adicionais / extras"
                  exemplo="Ex.: bacon extra + R$ 4,00 · borda recheada · ovo"
                  explicacao="O cliente pode marcar quantos quiser. Deixe o preço vazio para grátis."
                  aberta={abertas.extras}
                  rotuloAdicionar="+ Adicionar adicionais"
                  onAbrir={() => abrirSecao("extras")}
                  onRemover={() => removerSecao("extras")}
                  cor={cor} travado={travado}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {extras.map((l, i) => (
                      <div key={l.key} style={{ display: "flex", flexDirection: "column", gap: 4, opacity: l.ativo ? 1 : 0.55 }}>
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                          <input value={l.nome} disabled={travado} aria-label={`Adicional ${i + 1}`}
                            onChange={e => setExtras(t => t.map(x => x.key === l.key ? { ...x, nome: e.target.value } : x))}
                            placeholder={["Ex.: Bacon extra", "Ex.: Borda recheada", "Ex.: Ovo"][i] ?? "Nome do adicional"}
                            className="basis-full sm:basis-0" style={{ ...inputStyle, flexGrow: 1, padding: "9px 12px" }} />
                          <div className="flex-1 sm:flex-none sm:w-[120px]" style={{ minWidth: 0 }}>
                            <CampoPreco value={l.preco} disabled={travado} compacto placeholder="Grátis" prefixo="+ R$" aria-label={`Preço do adicional ${i + 1}`}
                              onChange={v => setExtras(t => t.map(x => x.key === l.key ? { ...x, preco: v } : x))} />
                          </div>
                          <ControlesLinha
                            i={i} total={extras.length} ativo={l.ativo} travado={travado}
                            onMover={d => setExtras(t => mover(t, i, d))}
                            onAtivo={() => setExtras(t => t.map(x => x.key === l.key ? { ...x, ativo: !x.ativo } : x))}
                            onRemover={() => setExtras(t => t.filter(x => x.key !== l.key))} />
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)", cursor: "pointer", paddingLeft: 2, width: "fit-content" }}>
                          <input type="checkbox" checked={l.obrigatorio} disabled={travado}
                            onChange={e => setExtras(t => t.map(x => x.key === l.key ? { ...x, obrigatorio: e.target.checked } : x))}
                            style={{ width: 14, height: 14, accentColor: cor }} />
                          Obrigatório
                        </label>
                      </div>
                    ))}
                    <BotaoAddLinha onClick={addExtra} travado={travado}>Adicionar adicional</BotaoAddLinha>
                    {extras.some(x => x.obrigatorio) && (
                      <p style={{ fontSize: 11.5, color: "var(--text-4)", margin: "2px 0 0", lineHeight: 1.5 }}>
                        Atenção: na loja os adicionais aparecem como opcionais. Se o cliente precisa escolher algo, use “O cliente escolhe”.
                      </p>
                    )}
                  </div>
                </SecaoOpcional>

                {/* Caminho para tabela de preços (só quando a loja tem tabelas e o produto já existe) */}
                {editando && !avancado && categoriasPreco.length > 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>
                    Quer usar uma das suas tabelas de preço neste produto?{" "}
                    <button type="button" onClick={abrirAvancado} disabled={travado}
                      style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, color: "var(--text-3)", cursor: "pointer", textDecoration: "underline" }}>
                      Abrir editor avançado
                    </button>
                  </p>
                )}
              </div>

              {/* ═══ Prévia ═══ */}
              <div className="lg:sticky lg:top-0" style={{ alignSelf: "start", display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ ...labelStyle, marginBottom: 0 }}>Como o cliente vê</p>
                <div style={{ background: "#f7f7f8", borderRadius: 16, padding: 12, border: "1px solid var(--border-1)" }}>
                  {/* Card igual ao da loja */}
                  <div style={{ background: "#fff", borderRadius: 18, border: "1px solid #f0f0f0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", display: "flex", overflow: "hidden", opacity: ativo ? 1 : 0.5 }}>
                    <div style={{ flex: 1, padding: "14px 12px 14px 16px", minWidth: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", margin: "0 0 5px", wordBreak: "break-word" }}>{nome.trim() || "Nome do produto"}</p>
                      {descricao.trim() && (
                        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 8px", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {descricao}
                        </p>
                      )}
                      {previa.personalizavel && (
                        <p style={{ fontSize: 11, color: cor, fontWeight: 700, margin: "0 0 8px" }}>
                          {previa.tipo === "pizza" ? "🍕 Escolha o tamanho e sabor" : "Personalizável"}
                        </p>
                      )}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 17, fontWeight: 900, color: cor }}>
                          {previa.aPartirDe && <span style={{ fontSize: 11, fontWeight: 600 }}>A partir de </span>}
                          R${previa.precoMinimo.toFixed(2)}
                        </span>
                        <span style={{ width: 30, height: 30, borderRadius: 9, background: cor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Plus size={15} />
                        </span>
                      </div>
                    </div>
                    <div style={{ width: 88, height: 88, flexShrink: 0, background: "#f8fafc", alignSelf: "center", borderRadius: 10, overflow: "hidden", marginRight: 12 }}>
                      <ImgComFallback src={imagemUrl || null} alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        fallback={<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Package size={22} style={{ color: "#e2e8f0" }} /></div>} />
                    </div>
                  </div>

                  {/* Resumo do que o cliente escolhe ao tocar */}
                  {previa.personalizavel ? (
                    <div style={{ marginTop: 12, background: "#fff", borderRadius: 14, border: "1px solid #f0f0f0", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>Ao tocar no produto</p>
                      {previa.vars.length > 0 && (
                        <ResumoPasso n={1} titulo="Tamanho *" cor={cor}>
                          {previa.vars.map((v, i) => (
                            <LinhaResumo key={i} nome={v.nome || "—"}
                              extra={previa.sabs.length > 0 || temVinculo ? (previa.maxPorTamanho[i]?.max > 1 ? `até ${previa.maxPorTamanho[i].max}` : undefined) : undefined}
                              valor={brl(precoVariacaoLoja({ preco: precoNumerico, categoria_preco_id: produto?.categoria_preco_id ?? null }, v, categoriasPreco))} cor={cor} />
                          ))}
                        </ResumoPasso>
                      )}
                      {(previa.sabs.length > 0 || temVinculo) && (() => {
                        const maxs = previa.maxPorTamanho.map(m => m.max);
                        const maxTxt = maxs.length === 0 ? "Sabor *" : Math.max(...maxs) > 1
                          ? (new Set(maxs).size > 1 ? "Sabores * (varia pelo tamanho)" : `Sabores * (até ${maxs[0]})`)
                          : "Sabor *";
                        return (
                          <ResumoPasso n={previa.vars.length > 0 ? 2 : 1} titulo={maxTxt} cor={cor}>
                            {previa.sabs.slice(0, 6).map((s, i) => (
                              <LinhaResumo key={i} nome={s.nome || "—"} valor={(s.preco_adicional ?? 0) > 0 ? brl(s.preco_adicional!) : "preço normal"} cor={cor} suave={(s.preco_adicional ?? 0) <= 0} />
                            ))}
                            {previa.sabs.length > 6 && <p style={{ fontSize: 11.5, color: "#94a3b8", margin: 0 }}>+ {previa.sabs.length - 6} opções</p>}
                            {temVinculo && <p style={{ fontSize: 11.5, color: "#94a3b8", margin: 0 }}>+ opções de outros produtos</p>}
                          </ResumoPasso>
                        );
                      })()}
                      {previa.adds.length > 0 && (
                        <ResumoPasso n={(previa.vars.length > 0 ? 1 : 0) + (previa.sabs.length > 0 || temVinculo ? 1 : 0) + 1} titulo="Adicionais — opcional" cor={cor}>
                          {previa.adds.slice(0, 6).map((a, i) => (
                            <LinhaResumo key={i} nome={a.nome || "—"} valor={a.preco > 0 ? `+${brl(a.preco)}` : "grátis"} cor={cor} suave={a.preco <= 0} />
                          ))}
                          {previa.adds.length > 6 && <p style={{ fontSize: 11.5, color: "#94a3b8", margin: 0 }}>+ {previa.adds.length - 6} adicionais</p>}
                        </ResumoPasso>
                      )}
                    </div>
                  ) : (
                    <p style={{ fontSize: 11.5, color: "#94a3b8", margin: "10px 2px 0", lineHeight: 1.5 }}>
                      Produto simples: o cliente toca no + e já vai para o carrinho.
                    </p>
                  )}
                </div>
                {!ativo && <p style={{ fontSize: 11.5, color: "var(--text-4)", margin: 0 }}>Pausado: não aparece na loja até você ativar.</p>}
              </div>
            </div>
          )}
        </div>

        {/* ── Rodapé ── */}
        <div className="px-4 md:px-6" style={{ paddingTop: 12, paddingBottom: "max(12px, env(safe-area-inset-bottom))", borderTop: "1px solid var(--border-1)", flexShrink: 0, background: "var(--bg-1)" }}>
          <div className="flex items-center gap-3 w-full">
            <button type="button" onClick={tentarFechar} disabled={salvando}
              style={{ padding: "12px 18px", borderRadius: 12, background: "var(--bg-input)", border: "1px solid var(--border-1)", color: "var(--text-3)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Cancelar
            </button>
            <button type="button" onClick={salvar} disabled={travado || Boolean(erroCarga)}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "12px 20px", borderRadius: 12, background: cor, color: "#fff", border: "none",
                fontSize: 14.5, fontWeight: 900, cursor: travado ? "not-allowed" : "pointer",
                boxShadow: `0 6px 20px ${cor}40`, opacity: travado ? 0.75 : 1,
              }}>
              {salvando ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Salvando…</> : <><Check size={16} /> Salvar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Subcomponentes
// ════════════════════════════════════════════════════════════════

function CampoPreco({ value, onChange, disabled, placeholder = "0,00", compacto, prefixo = "R$", id, ...rest }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string;
  compacto?: boolean; prefixo?: string; id?: string; "aria-label"?: string;
}) {
  const invalido = (() => { const p = parsePreco(value); return p !== null && Number.isNaN(p); })();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4, borderRadius: 11,
      border: `1px solid ${invalido ? "#dc2626" : "var(--border-1)"}`, background: "var(--bg-input)",
      padding: compacto ? "0 10px" : "0 13px",
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-4)", whiteSpace: "nowrap" }}>{prefixo}</span>
      <input id={id} aria-label={rest["aria-label"]} inputMode="decimal" value={value} disabled={disabled} placeholder={placeholder}
        onChange={e => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        style={{ flex: 1, minWidth: 0, width: "100%", border: "none", outline: "none", background: "transparent", color: "var(--text-1)", fontSize: 14, fontWeight: 700, padding: compacto ? "9px 0" : "11px 0" }} />
    </div>
  );
}

function SecaoOpcional({ titulo, exemplo, explicacao, aberta, rotuloAdicionar, onAbrir, onRemover, cor, travado, children }: {
  titulo: string; exemplo: string; explicacao: string; aberta: boolean; rotuloAdicionar: string;
  onAbrir: () => void; onRemover?: () => void; cor: string; travado: boolean; children: React.ReactNode;
}) {
  if (!aberta) {
    return (
      <button type="button" onClick={onAbrir} disabled={travado}
        style={{
          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, width: "100%", textAlign: "left",
          padding: "14px 16px", borderRadius: 14, border: "1.5px dashed var(--border-2)", background: "var(--bg-2)", cursor: "pointer",
        }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: cor }}>{rotuloAdicionar}</span>
        <span style={{ fontSize: 12, color: "var(--text-4)" }}>{exemplo}</span>
      </button>
    );
  }
  return (
    <div style={{ borderRadius: 14, border: "1px solid var(--border-1)", background: "var(--bg-1)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="flex items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>{titulo}</p>
          <p style={{ fontSize: 12, color: "var(--text-4)", margin: "2px 0 0", lineHeight: 1.45 }}>{explicacao}</p>
        </div>
        {onRemover && (
          <button type="button" onClick={onRemover} disabled={travado}
            style={{ background: "none", border: "none", padding: "2px 0", fontSize: 12, fontWeight: 700, color: "var(--text-4)", cursor: "pointer", whiteSpace: "nowrap" }}>
            Remover
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ControlesLinha({ i, total, ativo, travado, onMover, onAtivo, onRemover }: {
  i: number; total: number; ativo: boolean; travado: boolean;
  onMover: (d: -1 | 1) => void; onAtivo: () => void; onRemover: () => void;
}) {
  return (
    <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
      <div className="flex items-center gap-1">
        <button type="button" style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1 }} disabled={travado || i === 0} onClick={() => onMover(-1)} title="Subir" aria-label="Subir">
          <ArrowUp size={13} />
        </button>
        <button type="button" style={{ ...iconBtn, opacity: i === total - 1 ? 0.35 : 1 }} disabled={travado || i === total - 1} onClick={() => onMover(1)} title="Descer" aria-label="Descer">
          <ArrowDown size={13} />
        </button>
      </div>
      <button type="button" style={iconBtn} disabled={travado} onClick={onAtivo}
        title={ativo ? "Esconder da loja (pausar)" : "Mostrar na loja"} aria-label={ativo ? "Pausar" : "Ativar"}>
        {ativo ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      <button type="button" style={{ ...iconBtn, color: "#E4002B", border: "1px solid rgba(228,0,43,0.25)" }} disabled={travado} onClick={onRemover} title="Remover" aria-label="Remover">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function BotaoAddLinha({ onClick, travado, children }: { onClick: () => void; travado: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={travado}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 11,
        border: "1px dashed var(--border-2)", background: "transparent", color: "var(--text-2)", fontSize: 13, fontWeight: 700, cursor: "pointer",
      }}>
      <Plus size={14} /> {children}
    </button>
  );
}

function SeletorQtd({ valor, onChange, cor, travado }: { valor: number; onChange: (n: number) => void; cor: string; travado: boolean }) {
  const opcoes = OPCOES_MAX.includes(valor) ? OPCOES_MAX : [...OPCOES_MAX, valor].sort((a, b) => a - b);
  return (
    <div className="flex gap-1">
      {opcoes.map(n => (
        <button key={n} type="button" disabled={travado} onClick={() => onChange(n)}
          style={{
            minWidth: 40, padding: "7px 10px", borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: "pointer",
            background: valor === n ? cor : "var(--bg-1)", color: valor === n ? "#fff" : "var(--text-2)",
            border: `1px solid ${valor === n ? cor : "var(--border-1)"}`,
          }}>
          {n === 1 ? "1" : `até ${n}`}
        </button>
      ))}
    </div>
  );
}

function ResumoPasso({ n, titulo, cor, children }: { n: number; titulo: string; cor: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <span style={{ width: 18, height: 18, borderRadius: "50%", background: `${cor}18`, color: cor, fontSize: 10.5, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>{titulo}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 25 }}>{children}</div>
    </div>
  );
}

function LinhaResumo({ nome, valor, extra, cor, suave }: { nome: string; valor: string; extra?: string; cor: string; suave?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
      <span style={{ color: "#0f172a", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {nome}{extra && <span style={{ color: "#94a3b8", fontWeight: 500, fontSize: 11 }}> · {extra}</span>}
      </span>
      <span style={{ color: suave ? "#94a3b8" : cor, fontWeight: suave ? 600 : 800, flexShrink: 0 }}>{valor}</span>
    </div>
  );
}
