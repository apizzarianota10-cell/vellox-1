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

  // configuracao_loja.empresa_id aponta pra auth.users, não pra empresas — o
  // embed aninhado empresas(configuracao_loja(...)) não existe pro PostgREST
  // e derrubava a consulta inteira (todo pedido virava "não encontrado").
  // Por isso o telefone da loja vem numa consulta separada.
  const { data, error } = await supabase
    .from("pedidos")
    .select(`
      id, empresa_id, tracking_token, status, created_at, updated_at,
      cliente_nome, tipo_pedido,
      endereco_entrega, bairro,
      descricao_itens, observacoes,
      valor_pedido, valor_motoboy, forma_pagamento, troco_para,
      avaliacao_nota, avaliacao_comentario,
      motoboy:motoboys(nome, telefone, latitude, longitude),
      empresa:empresas(nome)
    `)
    .eq("tracking_token", token)
    .maybeSingle();

  if (error) {
    console.error("Erro ao buscar pedido (rastreio):", error.code, error.message);
    return NextResponse.json({ error: "Erro ao buscar o pedido" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  const { data: cfg } = await supabase
    .from("configuracao_loja")
    .select("telefone_contato")
    .eq("empresa_id", data.empresa_id)
    .maybeSingle();

  const { empresa_id: _empresaId, ...publico } = data;
  const empresa = Array.isArray(publico.empresa) ? publico.empresa[0] : publico.empresa;
  const pedido = {
    ...publico,
    empresa: empresa ? { ...empresa, configuracao_loja: { telefone_contato: cfg?.telefone_contato ?? null } } : null,
  };

  return NextResponse.json({ pedido }, {
    headers: { "Cache-Control": "no-store" },
  });
}

// Avaliação do cliente — só depois do pedido marcado 'entregue', só uma vez
// (não permite sobrescrever uma nota já enviada).
const ipHits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_HITS  = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_HITS) return false;
  entry.count++;
  return true;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  }

  const { token } = await params;
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const nota = Number(body?.nota);
  const comentario = typeof body?.comentario === "string" ? body.comentario.trim().slice(0, 1000) : null;

  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return NextResponse.json({ error: "Nota precisa ser um número de 1 a 5" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: pedido, error: findErr } = await supabase
    .from("pedidos")
    .select("id, status, avaliacao_nota")
    .eq("tracking_token", token)
    .single();

  if (findErr || !pedido) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }
  if (pedido.status !== "entregue") {
    return NextResponse.json({ error: "Só dá pra avaliar depois que o pedido for entregue" }, { status: 400 });
  }
  if (pedido.avaliacao_nota !== null) {
    return NextResponse.json({ error: "Esse pedido já foi avaliado" }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from("pedidos")
    .update({
      avaliacao_nota: nota,
      avaliacao_comentario: comentario || null,
      avaliacao_criada_em: new Date().toISOString(),
    })
    .eq("id", pedido.id);

  if (updateErr) {
    return NextResponse.json({ error: "Erro ao salvar avaliação" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
