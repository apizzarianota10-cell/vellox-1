import { NextRequest, NextResponse } from "next/server";
import { requireGod, createAdminClient, buscarTudo, diasDesde, num, faltaMigracao } from "@/lib/godServer";
import { diaBRT, inicioDiaBRT } from "@/lib/dataBRT";

export const dynamic = "force-dynamic";

interface PedidoMin {
  status: string; valor_pedido: number | null; valor_motoboy: number | null;
  created_at: string; motoboy_id: string | null; avaliacao_nota: number | null;
}

// Campos que não saem do servidor nem para o god (segredos da loja)
const OCULTAR = new Set(["senha_financeiro", "whatsapp_token", "agent_token"]);
function limpar<T extends Record<string, unknown>>(o: T | null): Record<string, unknown> | null {
  if (!o) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (OCULTAR.has(k)) out[k] = v ? "••• configurado" : null;
    else out[k] = v;
  }
  return out;
}

// GET /api/god/empresa?id=<uuid> — registro completo da loja
export async function GET(req: NextRequest) {
  if (!await requireGod()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const admin = createAdminClient();

  const [empRes, cfgRes, lojasRes, pedRes, ultRes, prodRes, bairrosRes, mbDiretoRes, mbVincRes, premRes, printRes] = await Promise.all([
    admin.from("empresas").select("*").eq("id", id).maybeSingle(),
    admin.from("configuracao_loja").select("*").eq("empresa_id", id).maybeSingle(),
    admin.from("lojas").select("id, nome, slug, ativo, created_at").eq("empresa_id", id).order("ordem"),
    buscarTudo<PedidoMin>((de, ate) => admin.from("pedidos")
      .select("status, valor_pedido, valor_motoboy, created_at, motoboy_id, avaliacao_nota")
      .eq("empresa_id", id).order("created_at").range(de, ate), 100_000),
    admin.from("pedidos")
      .select("id, cliente_nome, status, valor_pedido, created_at, tipo_pedido, forma_pagamento, bairro, motoboy_id, origem")
      .eq("empresa_id", id).order("created_at", { ascending: false }).limit(15),
    admin.from("produtos").select("id", { count: "exact", head: true }).eq("empresa_id", id),
    admin.from("bairros_taxa").select("id", { count: "exact", head: true }).eq("empresa_id", id),
    admin.from("motoboys").select("id, nome, telefone, status, codigo, foto_url, avaliacao_media, ultima_localizacao_at, empresa_id").eq("empresa_id", id),
    admin.from("motoboy_empresas").select("motoboy_id, ativo").eq("empresa_id", id),
    admin.from("premiacoes").select("*").eq("empresa_id", id).order("created_at", { ascending: false }).limit(20),
    admin.from("configuracoes_print_agent").select("ativo, impressora_nome, tamanho_papel, agent_last_seen").eq("empresa_id", id).maybeSingle(),
  ]);

  if (empRes.error) return NextResponse.json({ error: empRes.error.message }, { status: 500 });
  if (!empRes.data) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });

  // Motoboys: vínculo antigo (motoboys.empresa_id) + multiempresa (motoboy_empresas)
  const diretos = mbDiretoRes.data ?? [];
  const vincAtivos = new Map((mbVincRes.data ?? []).map(v => [v.motoboy_id as string, v.ativo as boolean]));
  const faltam = [...vincAtivos.keys()].filter(mid => !diretos.some(d => d.id === mid));
  let extras: typeof diretos = [];
  if (faltam.length) {
    const { data } = await admin.from("motoboys")
      .select("id, nome, telefone, status, codigo, foto_url, avaliacao_media, ultima_localizacao_at, empresa_id")
      .in("id", faltam);
    extras = data ?? [];
  }

  // Números
  const hojeIni = inicioDiaBRT().getTime();
  const d7 = hojeIni - 6 * 86400000;
  const d30 = hojeIni - 29 * 86400000;
  const zero = () => ({ pedidos: 0, faturamento: 0, cancelados: 0 });
  const num4 = { hoje: zero(), d7: zero(), d30: zero(), total: zero() };
  const serie = new Map(diasDesde(new Date(d30)).map(d => [d, { dia: d, pedidos: 0, faturamento: 0 }]));
  const porMotoboy = new Map<string, { entregas: number; ganhos: number }>();
  let somaNota = 0, qtdNota = 0, ultimoPedido: string | null = null;

  for (const p of pedRes.rows) {
    const t = new Date(p.created_at).getTime();
    const canc = p.status === "cancelado";
    const v = canc ? 0 : num(p.valor_pedido);
    const add = (b: { pedidos: number; faturamento: number; cancelados: number }) => {
      b.pedidos++; b.faturamento += v; if (canc) b.cancelados++;
    };
    add(num4.total);
    if (t >= d30) {
      add(num4.d30);
      const s = serie.get(diaBRT(new Date(t)));
      if (s) { s.pedidos++; s.faturamento += v; }
    }
    if (t >= d7) add(num4.d7);
    if (t >= hojeIni) add(num4.hoje);
    if (p.motoboy_id && p.status === "entregue") {
      const m = porMotoboy.get(p.motoboy_id) ?? { entregas: 0, ganhos: 0 };
      m.entregas++; m.ganhos += num(p.valor_motoboy);
      porMotoboy.set(p.motoboy_id, m);
    }
    if (p.avaliacao_nota != null) { somaNota += num(p.avaliacao_nota); qtdNota++; }
    ultimoPedido = p.created_at;
  }

  const motoboys = [...diretos, ...extras].map(m => ({
    ...m,
    avaliacao_media: m.avaliacao_media != null ? num(m.avaliacao_media) : null,
    vinculo: m.empresa_id === id ? "principal" : (vincAtivos.get(m.id) === false ? "inativo" : "multiempresa"),
    entregas: porMotoboy.get(m.id)?.entregas ?? 0,
    ganhos: porMotoboy.get(m.id)?.ganhos ?? 0,
  }));
  const nomesMb = new Map(motoboys.map(m => [m.id, m.nome]));

  return NextResponse.json({
    empresa: limpar(empRes.data as Record<string, unknown>),
    config: limpar((cfgRes.data ?? null) as Record<string, unknown> | null),
    print_agent: printRes.data ?? null,
    lojas: lojasRes.data ?? [],
    numeros: num4,
    ticket_medio: num4.total.pedidos - num4.total.cancelados > 0
      ? num4.total.faturamento / (num4.total.pedidos - num4.total.cancelados) : 0,
    avaliacao: qtdNota ? { media: somaNota / qtdNota, qtd: qtdNota } : null,
    ultimo_pedido: ultimoPedido,
    parcial: pedRes.parcial,
    serie: Array.from(serie.values()),
    totais: { produtos: prodRes.count ?? 0, bairros: bairrosRes.count ?? 0 },
    motoboys,
    ultimos_pedidos: (ultRes.data ?? []).map(p => ({ ...p, motoboy_nome: p.motoboy_id ? nomesMb.get(p.motoboy_id) ?? null : null })),
    premiacoes: premRes.error ? [] : premRes.data ?? [],
    premiacoes_migracao_pendente: faltaMigracao(premRes.error),
  });
}
