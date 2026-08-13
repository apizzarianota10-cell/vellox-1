import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Rate limit por IP: protege contra spam/bot, mas generoso o bastante pra não
// bloquear clientes reais atrás do mesmo IP (rede compartilhada, operadora
// com CGNAT, wifi de shopping/condomínio) durante picos de pedidos.
// Observação: por rodar em memória, o contador é por instância serverless —
// não é uma garantia global exata, mas isso é aceitável aqui, já que o
// objetivo é só amortecer abuso óbvio, não fazer controle fino.
const ipHits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_HITS  = 30;

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

const MAX_LEN = { nome: 120, telefone: 30, endereco: 300, obs: 500, itens: 4000 };

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
    }

    const {
      empresa_id, cliente_nome, cliente_telefone,
      endereco_entrega, bairro, tipo_pedido, descricao_itens,
      observacoes, valor_pedido, valor_motoboy, forma_pagamento,
      troco_para, status, endereco_lat, endereco_lng,
      idempotency_key,
    } = body as Record<string, string | number | null | undefined>;

    if (!empresa_id || !cliente_nome || !cliente_telefone) {
      return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
    }
    if (status !== "em_fila") {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }
    if (String(cliente_nome).length > MAX_LEN.nome || String(cliente_telefone).length > MAX_LEN.telefone) {
      return NextResponse.json({ error: "Dados do cliente inválidos" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verifica se a empresa existe
    const { data: empresa, error: empErr } = await supabase
      .from("empresas")
      .select("id")
      .eq("id", empresa_id)
      .single();

    if (empErr || !empresa) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }

    // Gera token único de rastreamento (24 chars hex)
    const tokenBytes = new Uint8Array(12);
    crypto.getRandomValues(tokenBytes);
    const tracking_token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    // Insere o pedido
    const { data, error } = await supabase
      .from("pedidos")
      .insert({
        empresa_id,
        cliente_nome:     String(cliente_nome).trim().slice(0, MAX_LEN.nome),
        cliente_telefone: String(cliente_telefone).trim().slice(0, MAX_LEN.telefone),
        endereco_entrega: String(endereco_entrega ?? "").trim().slice(0, MAX_LEN.endereco),
        bairro:           bairro ?? null,
        tipo_pedido:      tipo_pedido ?? "entrega",
        descricao_itens:  descricao_itens != null ? String(descricao_itens).slice(0, MAX_LEN.itens) : null,
        observacoes:      observacoes != null ? String(observacoes).slice(0, MAX_LEN.obs) : null,
        valor_pedido:     Number(valor_pedido) || 0,
        valor_motoboy:    Number(valor_motoboy) || 0,
        forma_pagamento:  forma_pagamento ?? null,
        troco_para:       troco_para ?? null,
        endereco_lat:     endereco_lat != null ? Number(endereco_lat) : null,
        endereco_lng:     endereco_lng != null ? Number(endereco_lng) : null,
        origem:           "catalogo",
        tracking_token,
        idempotency_key:  idempotency_key ? String(idempotency_key).slice(0, 100) : null,
        status:           "em_fila",
        motoboy_id:       null,
        route_id:         null,
      })
      .select("id, tracking_token")
      .single();

    if (error) {
      // Chave de idempotência já usada (retry do mesmo checkout, ex: conexão
      // caiu e o cliente reenviou) — devolve o pedido já criado em vez de
      // duplicar ou dar erro. O índice único no banco garante isso mesmo sob
      // duas requisições simultâneas com a mesma chave.
      if (error.code === "23505" && idempotency_key) {
        const { data: existing } = await supabase
          .from("pedidos")
          .select("id, tracking_token")
          .eq("empresa_id", empresa_id)
          .eq("idempotency_key", String(idempotency_key).slice(0, 100))
          .maybeSingle();
        if (existing) {
          return NextResponse.json({ id: existing.id, tracking_token: existing.tracking_token }, { status: 200 });
        }
      }
      console.error("Erro ao inserir pedido:", error);
      return NextResponse.json({ error: "Não foi possível registrar o pedido. Tente novamente." }, { status: 500 });
    }

    return NextResponse.json({ id: data.id, tracking_token: data.tracking_token }, { status: 201 });
  } catch (err) {
    console.error("Erro inesperado:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
