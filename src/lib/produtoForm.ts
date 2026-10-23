// Lógica pura do formulário simples de produto (ProdutoForm.tsx).
// Sem React e sem Supabase — testável em node puro.
//
// O formulário mantém tudo em estado local e só grava ao clicar "Salvar".
// Na gravação, cada tabela-filha (produto_variacoes, produto_sabores,
// produto_adicionais) é sincronizada com `diffFilhos`: insere as linhas
// novas, atualiza só os campos que mudaram e apaga as removidas.
// Campos que o formulário não conhece (imagem/descrição do sabor,
// categoria_sabor_id, tipo_preco...) nunca entram no patch — ficam intactos.

import type { CategoriaPreco, ProdutoVariacao } from "@/types";

// ── Linhas editáveis (estado local do formulário) ────────────────────
export interface LinhaTamanho {
  key: string;
  id?: string;
  nome: string;
  preco: string;
  maxEscolhas: number;
  ativo: boolean;
}
export interface LinhaEscolha {
  key: string;
  id?: string;
  nome: string;
  preco: string;
  ativo: boolean;
}
export interface LinhaExtra {
  key: string;
  id?: string;
  nome: string;
  preco: string;
  obrigatorio: boolean;
  ativo: boolean;
}

// ── Preço ────────────────────────────────────────────────────────────
/** "" → null; "12,50" / "12.50" / "R$ 12,5" → 12.5; inválido → NaN. Aceita "1.234,56". */
export function parsePreco(s: string): number | null {
  let t = (s ?? "").replace(/R\$/gi, "").replace(/\s/g, "");
  if (t === "") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d*\.?\d*$/.test(t) || t === ".") return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** Número → texto do input ("12,50"). null/0 opcional → "". */
export function precoParaInput(n: number | null | undefined, vazioSeZero = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  if (vazioSeZero && n === 0) return "";
  return n.toFixed(2).replace(".", ",");
}

export function brl(n: number): string {
  return "R$ " + (Number.isFinite(n) ? n : 0).toFixed(2).replace(".", ",");
}

// ── Diff genérico de filhos ──────────────────────────────────────────
export interface DiffFilhos<R> {
  inserir: R[];
  atualizar: { id: string; patch: Partial<R> }[];
  remover: string[];
}

function iguais(a: unknown, b: unknown): boolean {
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.0001;
  return a === b;
}

/**
 * Compara as linhas originais (do banco) com as desejadas (do formulário).
 * - desejada sem id (ou com id que não está nos originais) → inserir (sem id)
 * - desejada com id conhecido → atualizar só os `campos` que mudaram
 * - original cujo id não aparece nas desejadas → remover
 */
export function diffFilhos<R extends object>(
  originais: ReadonlyArray<R & { id: string }>,
  desejados: ReadonlyArray<R & { id?: string }>,
  campos: ReadonlyArray<keyof R>,
): DiffFilhos<R> {
  const porId = new Map(originais.map(o => [o.id, o]));
  const mantidos = new Set<string>();
  const inserir: R[] = [];
  const atualizar: { id: string; patch: Partial<R> }[] = [];

  for (const d of desejados) {
    const orig = d.id ? porId.get(d.id) : undefined;
    if (!d.id || !orig || mantidos.has(d.id)) {
      const { id: _ignorado, ...semId } = d as R & { id?: string };
      void _ignorado;
      inserir.push(semId as R);
      continue;
    }
    mantidos.add(d.id);
    const patch: Partial<R> = {};
    for (const c of campos) {
      if (!iguais(orig[c], d[c])) patch[c] = d[c];
    }
    if (Object.keys(patch).length > 0) atualizar.push({ id: d.id, patch });
  }

  const remover = originais.filter(o => !mantidos.has(o.id)).map(o => o.id);
  return { inserir, atualizar, remover };
}

// ── Linhas → linhas do banco ─────────────────────────────────────────
export interface VariacaoRow { id?: string; nome: string; preco: number; max_sabores: number; ordem: number; ativo: boolean }
export interface SaborRow { id?: string; nome: string; preco_adicional: number | null; ordem: number; ativo: boolean }
export interface AdicionalRow { id?: string; nome: string; preco: number; obrigatorio: boolean; ordem: number; ativo: boolean }

export const CAMPOS_VARIACAO: (keyof VariacaoRow)[] = ["nome", "preco", "max_sabores", "ordem", "ativo"];
export const CAMPOS_SABOR: (keyof SaborRow)[] = ["nome", "preco_adicional", "ordem", "ativo"];
export const CAMPOS_ADICIONAL: (keyof AdicionalRow)[] = ["nome", "preco", "obrigatorio", "ordem", "ativo"];

/** Linha nova totalmente em branco é descartada (não vira erro nem registro). */
export function linhaEmBranco(l: { id?: string; nome: string; preco: string }): boolean {
  return !l.id && l.nome.trim() === "" && l.preco.trim() === "";
}

export function linhasParaVariacoes(linhas: LinhaTamanho[], usaEscolhas: boolean): VariacaoRow[] {
  return linhas.filter(l => !linhaEmBranco(l)).map((l, i) => ({
    ...(l.id ? { id: l.id } : {}),
    nome: l.nome.trim(),
    preco: parsePreco(l.preco) ?? 0,
    max_sabores: usaEscolhas ? Math.max(1, Math.floor(l.maxEscolhas || 1)) : 1,
    ordem: i,
    ativo: l.ativo,
  }));
}

export function linhasParaSabores(linhas: LinhaEscolha[]): SaborRow[] {
  return linhas.filter(l => !linhaEmBranco(l)).map((l, i) => {
    const p = parsePreco(l.preco);
    return {
      ...(l.id ? { id: l.id } : {}),
      nome: l.nome.trim(),
      // Na loja, preco_adicional > 0 é o preço do produto com esse sabor
      // (substitui o preço normal). Vazio/0 → usa o preço normal/do tamanho.
      preco_adicional: p !== null && p > 0 ? p : null,
      ordem: i,
      ativo: l.ativo,
    };
  });
}

export function linhasParaAdicionais(linhas: LinhaExtra[]): AdicionalRow[] {
  return linhas.filter(l => !linhaEmBranco(l)).map((l, i) => ({
    ...(l.id ? { id: l.id } : {}),
    nome: l.nome.trim(),
    preco: parsePreco(l.preco) ?? 0,
    obrigatorio: l.obrigatorio,
    ordem: i,
    ativo: l.ativo,
  }));
}

// ── Validação ────────────────────────────────────────────────────────
export interface DadosValidacao {
  nome: string;
  categoria: string;
  preco: string;
  tamanhosEditaveis: boolean; // false quando os tamanhos vêm de tabela de preço (avançado)
  tamanhos: LinhaTamanho[];
  escolhas: LinhaEscolha[];
  extras: LinhaExtra[];
}

export function validarProduto(d: DadosValidacao): string[] {
  const erros: string[] = [];
  if (!d.nome.trim()) erros.push("Dê um nome ao produto.");
  if (!d.categoria.trim()) erros.push("Escolha ou digite uma categoria.");

  const tamanhos = d.tamanhosEditaveis ? d.tamanhos.filter(l => !linhaEmBranco(l)) : [];
  if (tamanhos.length === 0) {
    const p = parsePreco(d.preco);
    if (p === null) erros.push("Informe o preço do produto.");
    else if (Number.isNaN(p) || p < 0) erros.push("O preço do produto não é um valor válido (ex.: 25,90).");
  }

  const nomesTam = new Map<string, number>();
  tamanhos.forEach((l, i) => {
    const rot = l.nome.trim() || `nº ${i + 1}`;
    if (!l.nome.trim()) erros.push(`O tamanho nº ${i + 1} está sem nome.`);
    const p = parsePreco(l.preco);
    if (p === null) erros.push(`Informe o preço do tamanho "${rot}".`);
    else if (Number.isNaN(p) || p <= 0) erros.push(`O preço do tamanho "${rot}" não é válido.`);
    const k = l.nome.trim().toLowerCase();
    if (k) nomesTam.set(k, (nomesTam.get(k) ?? 0) + 1);
  });
  for (const [k, n] of nomesTam) {
    if (n > 1) erros.push(`Há ${n} tamanhos com o nome "${tamanhos.find(t => t.nome.trim().toLowerCase() === k)!.nome.trim()}". Use nomes diferentes.`);
  }

  d.escolhas.filter(l => !linhaEmBranco(l)).forEach((l, i) => {
    const rot = l.nome.trim() || `nº ${i + 1}`;
    if (!l.nome.trim()) erros.push(`A opção nº ${i + 1} de "O cliente escolhe" está sem nome.`);
    const p = parsePreco(l.preco);
    if (p !== null && (Number.isNaN(p) || p < 0)) erros.push(`O preço da opção "${rot}" não é válido.`);
  });

  d.extras.filter(l => !linhaEmBranco(l)).forEach((l, i) => {
    const rot = l.nome.trim() || `nº ${i + 1}`;
    if (!l.nome.trim()) erros.push(`O adicional nº ${i + 1} está sem nome.`);
    const p = parsePreco(l.preco);
    if (p !== null && (Number.isNaN(p) || p < 0)) erros.push(`O preço do adicional "${rot}" não é válido.`);
  });

  return erros;
}

// ── Tipo do produto ──────────────────────────────────────────────────
/**
 * Na loja, tipo "pizza" só muda o texto do card ("🍕 Escolha o tamanho e
 * sabor" em vez de "Personalizável") e força abrir o modal de opções.
 * Regra: só continua "pizza" quem já era pizza e ainda tem alguma opção
 * (o formulário não promove nada a pizza — quentinha/suco com tamanho e
 * escolha mostrariam "🍕" no card); sem nenhuma opção vira "simples"
 * (evita abrir um modal vazio na loja).
 */
export function derivarTipo(
  atual: "simples" | "pizza" | undefined | null,
  nTamanhos: number, nEscolhas: number, nExtras: number,
): "simples" | "pizza" {
  if (atual === "pizza" && nTamanhos + nEscolhas + nExtras > 0) return "pizza";
  return "simples";
}

/** Com tamanhos, o preço gravado no produto é o do menor tamanho ativo ("a partir de"). */
export function precoBaseComTamanhos(vars: VariacaoRow[]): number | null {
  const ativos = vars.filter(v => v.ativo && v.preco > 0);
  const base = ativos.length > 0 ? ativos : vars.filter(v => v.preco > 0);
  if (base.length === 0) return null;
  return Math.min(...base.map(v => v.preco));
}

// ── Réplica das regras de preço da loja (para a prévia) ──────────────
// Mesmas regras de src/app/loja/[slug]/LojaClient.tsx (precoVariacao,
// precoMinimo, isAPartirDe, hasCustomizations).
export interface ProdutoPrevia {
  tipo: "simples" | "pizza";
  preco: number;
  categoria_preco_id: string | null;
  variacoes: Pick<ProdutoVariacao, "nome" | "preco" | "max_sabores" | "ativo">[];
  sabores: { nome: string; preco_adicional: number | null; ativo: boolean }[];
  adicionais: { nome: string; preco: number; ativo: boolean }[];
  temSaboresVinculados: boolean;
}

export function precoVariacaoLoja(
  p: Pick<ProdutoPrevia, "preco" | "categoria_preco_id">,
  v: { nome: string; preco: number },
  categoriasPreco: CategoriaPreco[],
): number {
  const tamanhos = p.categoria_preco_id ? categoriasPreco.find(c => c.id === p.categoria_preco_id)?.tamanhos : undefined;
  if (tamanhos) {
    const t = tamanhos.find(t => t.nome === v.nome);
    if (t) return t.preco;
  }
  return v.preco > 0 ? v.preco : p.preco;
}

export function maxEscolhasLoja(
  p: Pick<ProdutoPrevia, "categoria_preco_id">,
  v: { nome: string; max_sabores: number },
  categoriasPreco: CategoriaPreco[],
): number {
  const tamanhos = p.categoria_preco_id ? categoriasPreco.find(c => c.id === p.categoria_preco_id)?.tamanhos : undefined;
  if (tamanhos) {
    const t = tamanhos.find(t => t.nome === v.nome);
    if (t) return t.max_sabores;
  }
  return v.max_sabores;
}

export function previaLoja(p: ProdutoPrevia, categoriasPreco: CategoriaPreco[]) {
  const vars = p.variacoes.filter(v => v.ativo);
  const sabs = p.sabores.filter(s => s.ativo);
  const adds = p.adicionais.filter(a => a.ativo);
  const sabsComPreco = sabs.filter(s => (s.preco_adicional ?? 0) > 0);

  const personalizavel = p.tipo === "pizza" || vars.length > 0 || sabs.length > 0 || adds.length > 0 || p.temSaboresVinculados;
  const aPartirDe = vars.length > 0 || sabsComPreco.length > 0;
  const precoMinimo = vars.length > 0
    ? Math.min(...vars.map(v => precoVariacaoLoja(p, v, categoriasPreco)))
    : sabsComPreco.length > 0
      ? Math.min(...sabsComPreco.map(s => s.preco_adicional!))
      : p.preco;
  // Sem tamanhos a loja deixa escolher só 1; com tamanhos, vale o do 1º tamanho ativo até o cliente escolher.
  const maxPorTamanho = vars.map(v => ({ nome: v.nome, max: maxEscolhasLoja(p, v, categoriasPreco) }));
  return { personalizavel, aPartirDe, precoMinimo, vars, sabs, adds, maxPorTamanho };
}

// ── Recursos avançados que o formulário simples não representa ───────
export interface RecursosAvancados {
  tabelaPreco: string | null;        // nome da categoria de preço (tamanhos vêm dela)
  gruposDeSabor: boolean;            // produto_categorias_sabor / categoria_sabor_id
  vinculados: string[];              // nomes dos produtos que compartilham sabores
  mesclar: boolean;
}

export function temRecursoAvancado(r: RecursosAvancados): boolean {
  return Boolean(r.tabelaPreco) || r.gruposDeSabor || r.vinculados.length > 0 || r.mesclar;
}

let seq = 0;
export function novaKey(): string {
  seq += 1;
  return `k${Date.now().toString(36)}${seq}`;
}
