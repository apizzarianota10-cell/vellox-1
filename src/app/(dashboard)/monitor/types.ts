import type { PedidoStatus } from "@/types";

export interface PedidoMonitor {
  id: string;
  empresa_id: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  tipo_pedido: "entrega" | "retirada";
  descricao_itens: string | null;
  observacoes: string | null;
  endereco_entrega: string | null;
  bairro: string | null;
  forma_pagamento: string | null;
  valor_pedido: number;
  valor_motoboy: number;
  troco_para: number | null;
  status: PedidoStatus;
  created_at: string;
  updated_at: string;
}

export const PGTO_LABELS: Record<string, string> = {
  dinheiro:       "Dinheiro",
  cartao_credito: "Cartão Crédito",
  cartao_debito:  "Cartão Débito",
  pix:            "PIX",
  ja_pago:        "Já pago",
};
