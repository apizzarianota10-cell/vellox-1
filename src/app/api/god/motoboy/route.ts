import { NextRequest, NextResponse } from "next/server";
import { requireGod, createAdminClient, buscarTudo, num, faltaMigracao } from "@/lib/godServer";
import { inicioDiaBRT } from "@/lib/dataBRT";

export const dynamic = "force-dynamic";

interface PedidoMin {
  status: string; valor_motoboy: number | null; valor_pedido: number | null;
  created_at: string; updated_at: string | null; empresa_id: string; avaliacao_nota: number | null;
}

// GET /api/god/motoboy?id=<uuid> — registro completo do motoboy
export async function GET(req: NextRequest) {
  if (!await requireGod()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const admin = createAdminClient();
  const [mbRes, vincRes, pedRes, ultRes, acRes, premRes] = await Promise.all([
    admin.from("motoboys").select("*").eq("id", id).maybeSingle(),
    admin.from("motoboy_empresas").select("empresa_id, ativo, created_at").eq("motoboy_id", id),
    buscarTudo<PedidoMin>((de, ate) => admin.from("pedidos")
      .select("status, valor_motoboy, valor_pedido, created_at, updated_at, empresa_id, avaliacao_nota")
      .eq("motoboy_id", id).order("created_at").range(de, ate), 100_000),
    admin.from("pedidos")
      .select("id, cliente_nome, bairro, status, valor_motoboy, valor_pedido, created_at, updated_at, empresa_id")
      .eq("motoboy_id", id).order("updated_at", { ascending: false }).limit(15),
    admin.from("motoboy_acertos")
      .select("id, empresa_id, qtd_entregas, valor_a_repassar, status, created_at, pago_em")
      .eq("motoboy_id", id).order("created_at", { ascending: false }).limit(10),
    admin.from("premiacoes").select("*").eq("motoboy_id", id).order("created_at", { ascending: false }).limit(20),
  ]);

  if (mbRes.error) return NextResponse.json({ error: mbRes.error.message }, { status: 500 });
  if (!mbRes.data) return NextResponse.json({ error: "Motoboy não encontrado" }, { status: 404 });
  const mb = mbRes.data as Record<string, unknown>;

  const empIds = new Set<string>();
  if (mb.empresa_id) empIds.add(mb.empresa_id as string);
  for (const v of vincRes.data ?? []) empIds.add(v.empresa_id as string);
  for (const p of pedRes.rows) empIds.add(p.empresa_id);
  const { data: emps } = empIds.size
    ? await admin.from("empresas").select("id, nome, plano").in("id", [...empIds])
    : { data: [] as { id: string; nome: string; plano: string }[] };
  const nomeEmp = new Map((emps ?? []).map(e => [e.id as string, e.nome as string]));

  const hojeIni = inicioDiaBRT().getTime();
  const d7 = hojeIni - 6 * 86400000;
  const d30 = hojeIni - 29 * 86400000;
  const zero = () => ({ entregas: 0, ganhos: 0 });
  const per = { hoje: zero(), d7: zero(), d30: zero(), total: zero() };
  const porLoja = new Map<string, { entregas: number; ganhos: number }>();
  let somaNota = 0, qtdNota = 0, cancelados = 0;
  for (const p of pedRes.rows) {
    if (p.status === "cancelado") { cancelados++; continue; }
    if (p.status !== "entregue") continue;
    const t = new Date(p.updated_at ?? p.created_at).getTime();
    const g = num(p.valor_motoboy);
    const add = (b: { entregas: number; ganhos: number }) => { b.entregas++; b.ganhos += g; };
    add(per.total);
    if (t >= d30) add(per.d30);
    if (t >= d7) add(per.d7);
    if (t >= hojeIni) add(per.hoje);
    const l = porLoja.get(p.empresa_id) ?? zero();
    add(l); porLoja.set(p.empresa_id, l);
    if (p.avaliacao_nota != null) { somaNota += num(p.avaliacao_nota); qtdNota++; }
  }

  const vinc = new Map((vincRes.data ?? []).map(v => [v.empresa_id as string, v]));
  const lojas = [...empIds]
    .filter(eid => eid === mb.empresa_id || vinc.has(eid))
    .map(eid => ({
      id: eid,
      nome: nomeEmp.get(eid) ?? "—",
      vinculo: eid === mb.empresa_id ? "principal" : (vinc.get(eid)?.ativo === false ? "inativo" : "multiempresa"),
      desde: (vinc.get(eid)?.created_at as string | undefined) ?? null,
      entregas: porLoja.get(eid)?.entregas ?? 0,
      ganhos: porLoja.get(eid)?.ganhos ?? 0,
    }));
  // Lojas com entregas mas sem vínculo atual (desvinculado depois)
  for (const [eid, v] of porLoja) {
    if (!lojas.some(l => l.id === eid)) lojas.push({ id: eid, nome: nomeEmp.get(eid) ?? "—", vinculo: "antigo", desde: null, ...v });
  }

  return NextResponse.json({
    motoboy: { ...mb, avaliacao_media: mb.avaliacao_media != null ? num(mb.avaliacao_media) : null },
    lojas,
    periodos: per,
    cancelados,
    avaliacao_pedidos: qtdNota ? { media: somaNota / qtdNota, qtd: qtdNota } : null,
    parcial: pedRes.parcial,
    ultimas: (ultRes.data ?? []).map(p => ({ ...p, empresa_nome: nomeEmp.get(p.empresa_id as string) ?? "—" })),
    acertos: (acRes.error ? [] : acRes.data ?? []).map(a => ({ ...a, empresa_nome: nomeEmp.get(a.empresa_id as string) ?? "—" })),
    premiacoes: premRes.error ? [] : premRes.data ?? [],
    premiacoes_migracao_pendente: faltaMigracao(premRes.error),
  });
}
