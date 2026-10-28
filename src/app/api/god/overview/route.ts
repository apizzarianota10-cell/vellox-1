import { NextRequest, NextResponse } from "next/server";
import { requireGod, createAdminClient, buscarTudo, inicioPeriodo, diasDesde, num } from "@/lib/godServer";
import { diaBRT, inicioDiaBRT, inicioMesBRT } from "@/lib/dataBRT";

export const dynamic = "force-dynamic";

interface PedidoMin { empresa_id: string; status: string; valor_pedido: number | null; created_at: string }

// GET /api/god/overview?periodo=7|30|90|mes — KPIs + série diária
export async function GET(req: NextRequest) {
  if (!await requireGod()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { periodo, inicio, rotulo } = inicioPeriodo(req.nextUrl.searchParams.get("periodo"));
  const admin = createAdminClient();
  const inicioMes = inicioMesBRT();
  const desde = inicio < inicioMes ? inicio : inicioMes;

  const [empRes, mbRes, totalRes, pedRes] = await Promise.all([
    admin.from("empresas").select("id, nome, assinatura_ativa, assinatura_expira_em, created_at, plano"),
    admin.from("motoboys").select("id, status"),
    admin.from("pedidos").select("id", { count: "exact", head: true }),
    buscarTudo<PedidoMin>((de, ate) => admin
      .from("pedidos")
      .select("empresa_id, status, valor_pedido, created_at")
      .gte("created_at", desde.toISOString())
      .order("created_at", { ascending: true })
      .range(de, ate), 200_000),
  ]);

  if (empRes.error) return NextResponse.json({ error: empRes.error.message }, { status: 500 });

  const agora = new Date();
  const empresas = empRes.data ?? [];
  const ativa = (e: { assinatura_ativa: boolean; assinatura_expira_em: string | null }) =>
    e.assinatura_ativa && (!e.assinatura_expira_em || new Date(e.assinatura_expira_em) > agora);
  const nomes: Record<string, string> = {};
  for (const e of empresas) nomes[e.id] = e.nome;

  const hojeIni = inicioDiaBRT().getTime();
  const mesIni = inicioMes.getTime();
  const periodoIni = inicio.getTime();
  const dias = diasDesde(inicio);
  const serie = new Map(dias.map(d => [d, { dia: d, pedidos: 0, faturamento: 0 }]));
  const porLoja = new Map<string, { pedidos: number; faturamento: number }>();

  let pedidosHoje = 0, pedidosMes = 0, pedidosPeriodo = 0, fatPeriodo = 0, fatHoje = 0, fatMes = 0, cancPeriodo = 0;
  for (const p of pedRes.rows) {
    const t = new Date(p.created_at).getTime();
    const cancelado = p.status === "cancelado";
    const v = cancelado ? 0 : num(p.valor_pedido);
    if (t >= hojeIni) { pedidosHoje++; fatHoje += v; }
    if (t >= mesIni) { pedidosMes++; fatMes += v; }
    if (t >= periodoIni) {
      pedidosPeriodo++; fatPeriodo += v;
      if (cancelado) cancPeriodo++;
      const s = serie.get(diaBRT(new Date(t)));
      if (s) { s.pedidos++; s.faturamento += v; }
      const l = porLoja.get(p.empresa_id) ?? { pedidos: 0, faturamento: 0 };
      l.pedidos++; l.faturamento += v;
      porLoja.set(p.empresa_id, l);
    }
  }

  const motoboys = mbRes.data ?? [];
  const em7 = agora.getTime() + 7 * 86400000;

  return NextResponse.json({
    periodo, rotulo, inicio: inicio.toISOString(),
    parcial: pedRes.parcial,
    kpis: {
      lojas_total: empresas.length,
      lojas_ativas: empresas.filter(ativa).length,
      novas_lojas: empresas.filter(e => e.created_at && new Date(e.created_at).getTime() >= periodoIni).length,
      pedidos_hoje: pedidosHoje,
      pedidos_mes: pedidosMes,
      pedidos_periodo: pedidosPeriodo,
      pedidos_total: totalRes.count ?? null,
      faturamento_hoje: fatHoje,
      faturamento_mes: fatMes,
      faturamento_periodo: fatPeriodo,
      ticket_medio: pedidosPeriodo - cancPeriodo > 0 ? fatPeriodo / (pedidosPeriodo - cancPeriodo) : 0,
      cancelados_periodo: cancPeriodo,
      motoboys_total: motoboys.length,
      motoboys_ativos: motoboys.filter(m => m.status === "disponivel" || m.status === "em_entrega").length,
      motoboys_em_entrega: motoboys.filter(m => m.status === "em_entrega").length,
    },
    serie: Array.from(serie.values()),
    top_lojas: Array.from(porLoja.entries())
      .map(([id, v]) => ({ id, nome: nomes[id] ?? "—", ...v }))
      .sort((a, b) => b.faturamento - a.faturamento)
      .slice(0, 5),
    expirando: empresas
      .filter(e => ativa(e) && e.assinatura_expira_em && new Date(e.assinatura_expira_em).getTime() <= em7)
      .map(e => ({ id: e.id, nome: e.nome, expira_em: e.assinatura_expira_em }))
      .sort((a, b) => String(a.expira_em).localeCompare(String(b.expira_em))),
    vencidas_ativas: empresas
      .filter(e => e.assinatura_ativa && e.assinatura_expira_em && new Date(e.assinatura_expira_em) <= agora)
      .map(e => ({ id: e.id, nome: e.nome, expira_em: e.assinatura_expira_em })),
  });
}
