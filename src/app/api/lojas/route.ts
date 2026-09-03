import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

async function checkBusiness(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("empresas").select("plano").eq("id", userId).single();
  return data?.plano === "enterprise";
}

// GET /api/lojas
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { data, error } = await supabase
    .from("lojas")
    .select("*")
    .eq("empresa_id", user.id)
    .order("ordem")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/lojas  { nome, cor?, descricao? }
export async function POST(req: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  if (!await checkBusiness(supabase, user.id))
    return NextResponse.json({ error: "Requer plano Business" }, { status: 403 });

  const { nome, cor, descricao } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

  const { data: existing } = await supabase.from("lojas").select("id").eq("empresa_id", user.id);
  const { data, error } = await supabase
    .from("lojas")
    .insert({ empresa_id: user.id, nome: nome.trim(), cor: cor ?? "#E4002B", descricao: descricao ?? "", ordem: (existing?.length ?? 0) })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH /api/lojas  { id, nome?, cor?, descricao?, ativo? }
export async function PATCH(req: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { id, nome, cor, descricao, ativo } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (nome !== undefined) updates.nome = nome.trim();
  if (cor !== undefined) updates.cor = cor;
  if (descricao !== undefined) updates.descricao = descricao;
  if (ativo !== undefined) updates.ativo = ativo;

  const { data, error } = await supabase
    .from("lojas").update(updates).eq("id", id).eq("empresa_id", user.id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/lojas  { id }
export async function DELETE(req: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { error } = await supabase.from("lojas").delete().eq("id", id).eq("empresa_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
