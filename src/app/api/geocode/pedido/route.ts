import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodificarPedido } from "@/lib/geocodePedido";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/geocode/pedido { pedido_id }
// Chamado pelo painel depois de criar um pedido manual. Preenche
// endereco_lat/endereco_lng/distancia_km em segundo plano (Nominatim/OSM).
export async function POST(req: NextRequest) {
  let pedidoId: unknown;
  try {
    ({ pedido_id: pedidoId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }
  if (typeof pedidoId !== "string" || !UUID_RE.test(pedidoId)) {
    return NextResponse.json({ error: "pedido_id inválido" }, { status: 400 });
  }

  // Autorização: o usuário logado precisa enxergar o pedido via RLS
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { data: pedido } = await supabase.from("pedidos").select("id").eq("id", pedidoId).maybeSingle();
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  const admin = createAdminClient();
  after(async () => { await geocodificarPedido(admin, pedidoId as string); });

  return NextResponse.json({ ok: true }, { status: 202 });
}
