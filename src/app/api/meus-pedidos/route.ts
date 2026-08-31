import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Rate limit por IP: evita varredura de números de telefone (a busca só
// exige o telefone, sem mais nenhuma confirmação de identidade).
const ipHits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_HITS  = 20;

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

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  }

  const tel = req.nextUrl.searchParams.get("tel")?.replace(/\D/g, "");
  if (!tel || tel.length < 8) {
    return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
  }
  // Opcional: restringe a busca a uma loja específica (usado pela página da
  // loja pública, pra só mostrar os pedidos feitos ali). Sem isso, busca em
  // todas as lojas — comportamento da página /meus-pedidos.
  const empresaId = req.nextUrl.searchParams.get("empresa_id");

  const supabase = createAdminClient();

  // Divide os últimos 8 dígitos em 2 partes para funcionar com
  // telefones formatados "(11) 99999-9999" (o hífen quebra busca direta)
  const digits8 = tel.slice(-8);
  const part1 = digits8.slice(0, 4);
  const part2 = digits8.slice(4);

  let query = supabase
    .from("pedidos")
    .select(`
      id, tracking_token, status, created_at,
      valor_pedido, valor_motoboy, tipo_pedido,
      empresa:empresas(nome)
    `)
    .ilike("cliente_telefone", `%${part1}%${part2}%`);

  if (empresaId) query = query.eq("empresa_id", empresaId);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[meus-pedidos]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pedidos: data ?? [] }, {
    headers: { "Cache-Control": "no-store" },
  });
}
