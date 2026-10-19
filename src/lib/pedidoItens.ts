import type { PedidoItem } from "@/types";

// Linha de carrinho mínima (LojaClient / PedidosClient) para gerar pedidos.itens
interface LinhaCarrinho {
  produto: { id: string; nome: string };
  qty: number;
}

/** Converte o carrinho em pedidos.itens (schema_v67). Retorna null se o carrinho estiver vazio. */
export function itensDoCarrinho(cart: LinhaCarrinho[]): PedidoItem[] | null {
  const itens = cart
    .filter(i => i.produto?.id && Number.isInteger(i.qty) && i.qty > 0)
    .map(i => ({ produto_id: i.produto.id, qtd: i.qty, nome: i.produto.nome }));
  return itens.length ? itens : null;
}

/**
 * Detecta o erro de "coluna pedidos.itens não existe" (schema_v67 ainda não
 * aplicada). PostgREST devolve PGRST204 (schema cache); o Postgres, 42703.
 */
export function colunaItensAusente(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  return (err.code === "PGRST204" || err.code === "42703") && /itens/i.test(msg);
}
