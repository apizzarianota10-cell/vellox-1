// Ordem das categorias e dos produtos do catálogo, definida pelo dono
// (configuracao_loja.ordem_categorias + produtos.ordem — schema_v71).
// Categoria fora da lista salva vai para o fim, em ordem alfabética.
import type { Produto } from "@/types";

export function ordenarCategorias(categorias: string[], ordem: string[] | null | undefined): string[] {
  const pos = new Map((ordem ?? []).map((c, i) => [c, i]));
  return [...new Set(categorias)].sort((a, b) => {
    const pa = pos.get(a), pb = pos.get(b);
    if (pa != null && pb != null) return pa - pb;
    if (pa != null) return -1;
    if (pb != null) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** Produtos agrupados por categoria, na ordem do dono (categorias e produtos). */
export function agruparPorCategoria(produtos: Produto[], ordem: string[] | null | undefined): [string, Produto[]][] {
  const mapa = new Map<string, Produto[]>();
  for (const p of produtos) {
    const lista = mapa.get(p.categoria);
    if (lista) lista.push(p); else mapa.set(p.categoria, [p]);
  }
  return ordenarCategorias([...mapa.keys()], ordem).map(c => [
    c,
    [...mapa.get(c)!].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
  ]);
}
