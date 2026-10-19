// Tipos e helpers do controle de estoque (schema_v67).
// Tipos locais de propósito: src/types/index.ts é mantido por outra frente.

export type TipoMovimento = "entrada" | "ajuste" | "saida_pedido" | "devolucao_pedido";

export interface ProdutoEstoque {
  id: string;
  nome: string;
  categoria: string;
  imagem_url: string | null;
  ativo: boolean;
  controla_estoque: boolean;
  estoque_qtd: number;
  estoque_minimo: number | null;
}

export interface MovimentoEstoque {
  id: string;
  produto_id: string;
  pedido_id: string | null;
  tipo: TipoMovimento;
  quantidade: number;
  saldo_apos: number;
  observacao: string | null;
  created_at: string;
}

export const PRODUTO_ESTOQUE_SELECT =
  "id, nome, categoria, imagem_url, ativo, controla_estoque, estoque_qtd, estoque_minimo";
export const MOVIMENTO_SELECT =
  "id, produto_id, pedido_id, tipo, quantidade, saldo_apos, observacao, created_at";

export type StatusEstoque = "nao_controlado" | "ok" | "baixo" | "zerado" | "negativo";

export function statusEstoque(
  p: Pick<ProdutoEstoque, "controla_estoque" | "estoque_qtd" | "estoque_minimo">,
): StatusEstoque {
  if (!p.controla_estoque) return "nao_controlado";
  if (p.estoque_qtd < 0) return "negativo";
  if (p.estoque_qtd === 0) return "zerado";
  if (p.estoque_minimo != null && p.estoque_qtd <= p.estoque_minimo) return "baixo";
  return "ok";
}

// Produto que merece alerta no painel: zerado/negativo ou no mínimo (ou abaixo).
export function emAlerta(qtd: number, minimo: number | null): boolean {
  return qtd <= 0 || (minimo != null && qtd <= minimo);
}

export const STATUS_CFG: Record<StatusEstoque, { label: string; color: string; bg: string; border: string }> = {
  nao_controlado: { label: "Sem controle", color: "var(--text-4)", bg: "var(--overlay-sm)",     border: "var(--border-1)" },
  ok:             { label: "Em estoque",   color: "#22c55e",       bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.3)" },
  baixo:          { label: "Baixo",        color: "#f59e0b",       bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" },
  zerado:         { label: "Zerado",       color: "#E4002B",       bg: "rgba(228,0,43,0.10)",   border: "rgba(228,0,43,0.3)" },
  negativo:       { label: "Negativo",     color: "#E4002B",       bg: "rgba(228,0,43,0.16)",   border: "rgba(228,0,43,0.45)" },
};

// Detecta "a migração ainda não rodou": coluna/tabela/função inexistente,
// tanto como erro do Postgres quanto como erro do cache do PostgREST.
export function isErroMigracaoPendente(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (["42703", "42P01", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(err.code ?? "")) return true;
  const m = (err.message ?? "").toLowerCase();
  return (
    /does not exist|could not find/.test(m) &&
    /column|relation|function|table|schema cache/.test(m)
  );
}

export function pedidoRef(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

export function labelMovimento(m: Pick<MovimentoEstoque, "tipo" | "pedido_id">): string {
  switch (m.tipo) {
    case "entrada":          return "Entrada";
    case "ajuste":           return "Ajuste";
    case "saida_pedido":     return m.pedido_id ? `Venda (pedido ${pedidoRef(m.pedido_id)})` : "Venda";
    case "devolucao_pedido": return m.pedido_id ? `Devolução (pedido cancelado ${pedidoRef(m.pedido_id)})` : "Devolução (pedido cancelado)";
    default:                 return m.tipo;
  }
}

export function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function fmtQtdSinal(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

// Nome do evento disparado quando o estoque muda no painel — o badge da
// sidebar escuta pra atualizar sem esperar o próximo intervalo.
export const EVENTO_ESTOQUE_ATUALIZADO = "vellox:estoque-atualizado";
