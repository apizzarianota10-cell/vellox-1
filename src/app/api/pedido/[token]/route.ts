import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("pedidos")
    .select(`
      id, tracking_token, status, created_at, updated_at,
      cliente_nome, tipo_pedido,
      endereco_entrega, bairro,
      descricao_itens, observacoes,
      valor_pedido, valor_motoboy, forma_pagamento, troco_para,
      motoboy:motoboys(nome, telefone, latitude, longitude),
      empresa:empresas(nome, configuracao_loja(telefone_contato))
    `)
    .eq("tracking_token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ pedido: data }, {
    headers: { "Cache-Control": "no-store" },
  });
}
