import { NextRequest, NextResponse } from "next/server";
import { requireGod, createAdminClient, buscarTudo, inicioPeriodo, num } from "@/lib/godServer";

export const dynamic = "force-dynamic";

interface PedidoMin {
  empresa_id: string; motoboy_id: string | null; status: string;
  valor_pedido: number | null; valor_motoboy: number | null;
  created_at: string; updated_at: string | null;
}

// GET /api/god/ranking?periodo=7|30|90|mes
// Lojas: pedidos criados no período (faturamento sem cancelados).
// Motoboys: entregas concluídas no período (mesmo critério do god_list_motoboys:
// status 'entregue' + updated_at como data da entrega).
export async function GET(req: NextRequest) {
  if (!await requireGod()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { periodo, inicio, rotulo } = inicioPeriodo(req.nextUrl.searchParams.get("periodo"));
  const admin = createAdminClient();
  const iniISO = inicio.toISOString();

  const [empRes, mbRes, pedRes, entRes] = await Promise.all([
    admin.from("empresas").select("id, nome, plano, slug"),
    admin.from("motoboys").select("id, nome, empresa_id, foto_url, avaliacao_media"),
    buscarTudo<PedidoMin>((de, ate) => admin.from("pedidos")
      .select("empresa_id, motoboy_id, status, valor_pedido, valor_motoboy, created_at, updated_at")
      .gte("created_at", iniISO).order("created_at").range(de, ate), 200_000),
    buscarTudo<PedidoMin>((de, ate) => admin.from("pedidos")
      .select("empresa_id, motoboy_id, status, valor_pedido, valor_motoboy, created_at, updated_at")
      .eq("status", "entregue").not("motoboy_id", "is", null)
      .gte("updated_at", iniISO).order("updated_at").range(de, ate), 200_000),
  ]);

  if (empRes.error) return NextResponse.json({ error: empRes.error.message }, { status: 500 });

  const empresas = new Map((empRes.data ?? []).map(e => [e.id as string, e]));
  const lojas = new Map<string, { pedidos: number; faturamento: number; cancelados: number }>();
  for (const p of pedRes.rows) {
    const l = lojas.get(p.empresa_id) ?? { pedidos: 0, faturamento: 0, cancelados: 0 };
    l.pedidos++;
    if (p.status === "cancelado") l.cancelados++;
    else l.faturamento += num(p.valor_pedido);
    lojas.set(p.empresa_id, l);
  }

  const mbs = new Map((mbRes.data ?? []).map(m => [m.id as string, m]));
  const motoboys = new Map<string, { entregas: number; ganhos: number; lojas: Set<string> }>();
  for (const p of entRes.rows) {
    if (!p.motoboy_id) continue;
    const m = motoboys.get(p.motoboy_id) ?? { entregas: 0, ganhos: 0, lojas: new Set<string>() };
    m.entregas++;
    m.ganhos += num(p.valor_motoboy);
    m.lojas.add(p.empresa_id);
    motoboys.set(p.motoboy_id, m);
  }

  return NextResponse.json({
    periodo, rotulo, inicio: iniISO,
    parcial: pedRes.parcial || entRes.parcial,
    lojas: Array.from(lojas.entries()).map(([id, v]) => {
      const e = empresas.get(id);
      return {
        id, nome: e?.nome ?? "—", plano: e?.plano ?? "basic", slug: e?.slug ?? null,
        pedidos: v.pedidos, faturamento: v.faturamento, cancelados: v.cancelados,
        ticket_medio: v.pedidos - v.cancelados > 0 ? v.faturamento / (v.pedidos - v.cancelados) : 0,
      };
    }),
    motoboys: Array.from(motoboys.entries()).map(([id, v]) => {
      const m = mbs.get(id);
      const lojaPrincipal = m?.empresa_id ? empresas.get(m.empresa_id as string)?.nome : null;
      return {
        id, nome: m?.nome ?? "Motoboy removido", foto_url: m?.foto_url ?? null,
        avaliacao: m?.avaliacao_media != null ? num(m.avaliacao_media) : null,
        empresa_nome: lojaPrincipal ?? (v.lojas.size === 1 ? empresas.get([...v.lojas][0])?.nome ?? null : null),
        lojas: v.lojas.size,
        entregas: v.entregas, ganhos: v.ganhos,
      };
    }),
  });
}
