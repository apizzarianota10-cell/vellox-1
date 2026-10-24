// Preço "de vitrine" de um produto fora da página da loja (prévia do
// WhatsApp, sorteio do /explorar): menor tamanho/variação ativa, ou menor
// sabor com preço, ou o preço base — mesma regra do precoMinimo do LojaClient.

export interface ProdutoPrecoInfo {
  preco: number | string | null;
  produto_variacoes?: { nome: string; preco: number | string | null; ativo: boolean | null }[] | null;
  produto_sabores?: { preco_adicional: number | string | null; ativo: boolean | null }[] | null;
  categoria_preco?: { tamanhos?: { nome: string; preco: number | string | null }[] | null } | null;
}

export const SELECT_PRECO_VITRINE =
  "preco, produto_variacoes(nome, preco, ativo), produto_sabores(preco_adicional, ativo), categoria_preco:categorias_preco!categoria_preco_id(tamanhos:categorias_preco_tamanhos(nome, preco))";

export function precoVitrine(p: ProdutoPrecoInfo): { preco: number; aPartirDe: boolean } {
  const base = Number(p.preco) || 0;
  const tamanhos = p.categoria_preco?.tamanhos ?? null;
  const vars = (p.produto_variacoes ?? []).filter(v => v.ativo !== false);
  if (vars.length > 0) {
    const precos = vars.map(v => {
      const t = tamanhos?.find(t => t.nome === v.nome);
      if (t) return Number(t.preco) || 0;
      const pv = Number(v.preco) || 0;
      return pv > 0 ? pv : base;
    }).filter(n => n > 0);
    if (precos.length) return { preco: Math.min(...precos), aPartirDe: true };
  }
  const sabs = (p.produto_sabores ?? [])
    .filter(s => s.ativo !== false && (Number(s.preco_adicional) || 0) > 0)
    .map(s => Number(s.preco_adicional));
  if (sabs.length) return { preco: Math.min(...sabs), aPartirDe: true };
  return { preco: base, aPartirDe: false };
}

export function brl(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}
