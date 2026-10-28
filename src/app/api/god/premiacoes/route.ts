import { NextRequest, NextResponse } from "next/server";
import { requireGod, createAdminClient, faltaMigracao, aplicarDiasAssinatura } from "@/lib/godServer";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const AVISO_MIGRACAO = "Rode supabase/schema_v75.sql no Supabase para habilitar as premiações.";

function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// GET /api/god/premiacoes — histórico (com nomes)
export async function GET() {
  if (!await requireGod()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("premiacoes").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) {
    if (faltaMigracao(error)) return NextResponse.json({ migracao_pendente: true, premiacoes: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const empIds = [...new Set((data ?? []).map(p => p.empresa_id).filter(Boolean))] as string[];
  const mbIds = [...new Set((data ?? []).map(p => p.motoboy_id).filter(Boolean))] as string[];
  const [emps, mbs] = await Promise.all([
    empIds.length ? admin.from("empresas").select("id, nome").in("id", empIds) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    mbIds.length ? admin.from("motoboys").select("id, nome").in("id", mbIds) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const nE = new Map((emps.data ?? []).map(e => [e.id, e.nome]));
  const nM = new Map((mbs.data ?? []).map(m => [m.id, m.nome]));
  return NextResponse.json({
    migracao_pendente: false,
    premiacoes: (data ?? []).map(p => ({
      ...p,
      alvo_nome: p.alvo_tipo === "empresa" ? nE.get(p.empresa_id) ?? "Loja removida" : nM.get(p.motoboy_id) ?? "Motoboy removido",
    })),
  });
}

// POST /api/god/premiacoes — envia premiação
// { alvo_tipo, empresa_id?, motoboy_id?, titulo, mensagem?, beneficio?, valor?, dias_bonus?, periodo_ref?, aplicar_dias? }
export async function POST(req: NextRequest) {
  if (!await requireGod()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;

  const alvo = b.alvo_tipo === "motoboy" ? "motoboy" : b.alvo_tipo === "empresa" ? "empresa" : null;
  const titulo = texto(b.titulo, 120);
  if (!alvo || !titulo) return NextResponse.json({ error: "Informe o destinatário e o título" }, { status: 400 });
  const empresaId = alvo === "empresa" ? String(b.empresa_id ?? "") : null;
  const motoboyId = alvo === "motoboy" ? String(b.motoboy_id ?? "") : null;
  if ((empresaId !== null && !UUID.test(empresaId)) || (motoboyId !== null && !UUID.test(motoboyId))) {
    return NextResponse.json({ error: "Destinatário inválido" }, { status: 400 });
  }
  const dias = b.dias_bonus == null || b.dias_bonus === "" ? null : Math.round(Number(b.dias_bonus));
  if (dias !== null && (!Number.isFinite(dias) || dias < 1 || dias > 3650)) {
    return NextResponse.json({ error: "Dias de bônus devem estar entre 1 e 3650" }, { status: 400 });
  }
  const valor = b.valor == null || b.valor === "" ? null : Number(b.valor);
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("premiacoes").insert({
    alvo_tipo: alvo,
    empresa_id: empresaId,
    motoboy_id: motoboyId,
    titulo,
    mensagem: texto(b.mensagem, 1000) ?? "",
    beneficio: texto(b.beneficio, 120),
    valor,
    dias_bonus: alvo === "empresa" ? dias : null,
    periodo_ref: texto(b.periodo_ref, 60),
  }).select().single();

  if (error) {
    if (faltaMigracao(error)) return NextResponse.json({ error: AVISO_MIGRACAO, migracao_pendente: true }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // "1 mês grátis" etc.: soma os dias na assinatura (mesma gravação do set-dias)
  let aplicado: { expira_em: string | null; error: string | null } | null = null;
  if (b.aplicar_dias === true && alvo === "empresa" && dias && empresaId) {
    aplicado = await aplicarDiasAssinatura(admin, empresaId, dias, true);
    if (!aplicado.error) {
      await admin.from("premiacoes").update({ dias_aplicados_em: new Date().toISOString() }).eq("id", data.id);
    }
  }
  return NextResponse.json({ ok: true, premiacao: data, aplicado });
}

// PATCH /api/god/premiacoes — { id, acao: "aplicar_dias" }
export async function PATCH(req: NextRequest) {
  if (!await requireGod()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const { id, acao } = await req.json().catch(() => ({})) as { id?: string; acao?: string };
  if (!id || !UUID.test(id) || acao !== "aplicar_dias") return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });

  const admin = createAdminClient();
  const { data: p, error } = await admin.from("premiacoes").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: faltaMigracao(error) ? 409 : 500 });
  if (!p) return NextResponse.json({ error: "Premiação não encontrada" }, { status: 404 });
  if (p.alvo_tipo !== "empresa" || !p.dias_bonus) return NextResponse.json({ error: "Esta premiação não tem dias de assinatura" }, { status: 400 });
  if (p.dias_aplicados_em) return NextResponse.json({ error: "Os dias já foram aplicados" }, { status: 409 });

  const r = await aplicarDiasAssinatura(admin, p.empresa_id, p.dias_bonus, true);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });
  await admin.from("premiacoes").update({ dias_aplicados_em: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true, expira_em: r.expira_em });
}

// DELETE /api/god/premiacoes — { id }
export async function DELETE(req: NextRequest) {
  if (!await requireGod()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const { id } = await req.json().catch(() => ({})) as { id?: string };
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("premiacoes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
