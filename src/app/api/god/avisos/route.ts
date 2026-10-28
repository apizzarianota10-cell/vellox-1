import { NextRequest, NextResponse } from "next/server";
import { requireGod, createAdminClient, faltaMigracao } from "@/lib/godServer";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const AVISO_MIGRACAO = "Rode supabase/schema_v76.sql no Supabase para habilitar os avisos.";
const NIVEIS = ["info", "atencao", "urgente"] as const;
const TIPOS = ["aviso", "banco_cheio"] as const;

function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Só http(s) ou caminho interno ("/assinatura") — mesmo critério do CHECK da v76. */
function urlSegura(v: unknown): string | null | false {
  const t = texto(v, 500);
  if (!t) return null;
  return /^https?:\/\/\S+$/.test(t) || /^\/[^/\s]\S*$/.test(t) ? t : false;
}

// GET /api/god/avisos[?empresa_id=<uuid>] — histórico com o nome da loja
export async function GET(req: NextRequest) {
  if (!await requireGod()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const empresaId = req.nextUrl.searchParams.get("empresa_id");
  const admin = createAdminClient();
  let q = admin.from("avisos_admin").select("*").order("created_at", { ascending: false }).limit(500);
  if (empresaId && UUID.test(empresaId)) q = q.eq("empresa_id", empresaId);
  const { data, error } = await q;
  if (error) {
    if (faltaMigracao(error)) return NextResponse.json({ migracao_pendente: true, avisos: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const ids = [...new Set((data ?? []).map(a => a.empresa_id as string))];
  const { data: emps } = ids.length
    ? await admin.from("empresas").select("id, nome").in("id", ids)
    : { data: [] as { id: string; nome: string }[] };
  const nomes = new Map((emps ?? []).map(e => [e.id, e.nome]));
  return NextResponse.json({
    migracao_pendente: false,
    avisos: (data ?? []).map(a => ({ ...a, empresa_nome: nomes.get(a.empresa_id) ?? "Loja removida" })),
  });
}

// POST /api/god/avisos
// { empresa_ids: uuid[] | todas: true, tipo, nivel, titulo, mensagem, acao_label?, acao_url?, exige_confirmacao?, dados? }
// Para tipo "banco_cheio", `dados` pode vir por loja: dados_por_empresa: { [empresa_id]: {...} }
export async function POST(req: NextRequest) {
  if (!await requireGod()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;

  const titulo = texto(b.titulo, 120);
  if (!titulo) return NextResponse.json({ error: "Informe o título do aviso" }, { status: 400 });
  const mensagem = texto(b.mensagem, 4000) ?? "";
  const tipo = (TIPOS as readonly string[]).includes(String(b.tipo)) ? String(b.tipo) : "aviso";
  const nivel = (NIVEIS as readonly string[]).includes(String(b.nivel)) ? String(b.nivel) : "info";
  const acaoUrl = urlSegura(b.acao_url);
  if (acaoUrl === false) return NextResponse.json({ error: "Link inválido: use https://... ou um caminho do painel como /assinatura" }, { status: 400 });
  const acaoLabel = acaoUrl ? texto(b.acao_label, 60) ?? "Abrir" : null;

  const admin = createAdminClient();
  let ids: string[];
  if (b.todas === true) {
    const { data, error } = await admin.from("empresas").select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ids = (data ?? []).map(e => e.id as string);
  } else {
    ids = Array.isArray(b.empresa_ids) ? [...new Set(b.empresa_ids.map(String).filter(x => UUID.test(x)))] : [];
  }
  if (ids.length === 0) return NextResponse.json({ error: "Escolha pelo menos uma loja" }, { status: 400 });
  if (ids.length > 5000) return NextResponse.json({ error: "Lojas demais de uma vez" }, { status: 400 });

  const porEmpresa = (b.dados_por_empresa && typeof b.dados_por_empresa === "object") ? b.dados_por_empresa as Record<string, unknown> : {};
  const dadosGerais = b.dados && typeof b.dados === "object" ? b.dados : null;
  const dadosOk = (v: unknown) => {
    if (!v || typeof v !== "object") return null;
    return JSON.stringify(v).length <= 20_000 ? v : null;
  };

  const linhas = ids.map(id => ({
    empresa_id: id,
    tipo, nivel, titulo, mensagem,
    acao_label: acaoLabel,
    acao_url: acaoUrl,
    exige_confirmacao: b.exige_confirmacao === true,
    dados: dadosOk(porEmpresa[id]) ?? dadosOk(dadosGerais),
  }));

  let enviados = 0;
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await admin.from("avisos_admin").insert(linhas.slice(i, i + 500));
    if (error) {
      if (faltaMigracao(error)) return NextResponse.json({ error: AVISO_MIGRACAO, migracao_pendente: true }, { status: 409 });
      return NextResponse.json({ error: error.message, enviados }, { status: 500 });
    }
    enviados += Math.min(500, linhas.length - i);
  }
  return NextResponse.json({ ok: true, enviados });
}

// DELETE /api/god/avisos — { id } ou { ids: [] }
export async function DELETE(req: NextRequest) {
  if (!await requireGod()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const b = await req.json().catch(() => ({})) as { id?: string; ids?: string[] };
  const ids = [...new Set([...(b.ids ?? []), ...(b.id ? [b.id] : [])].map(String).filter(x => UUID.test(x)))];
  if (!ids.length) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("avisos_admin").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: faltaMigracao(error) ? 409 : 500 });
  return NextResponse.json({ ok: true, apagados: ids.length });
}
