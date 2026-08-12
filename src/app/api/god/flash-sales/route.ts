import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const GOD_EMAIL = process.env.GOD_EMAIL;

async function checkGod() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== GOD_EMAIL) return false;
  return true;
}

export async function GET() {
  if (!await checkGod()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  try {
    const { data: sales, error } = await admin
      .from("flash_sales")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const empresaIds = [...new Set((sales ?? []).map((s: { empresa_id: string }) => s.empresa_id))];
    let nomes: Record<string, string> = {};
    if (empresaIds.length > 0) {
      const { data: emps } = await admin.from("empresas").select("id, nome").in("id", empresaIds);
      for (const e of emps ?? []) nomes[e.id] = e.nome;
    }

    return NextResponse.json({
      flash_sales: (sales ?? []).map((s: Record<string, unknown>) => ({ ...s, empresa_nome: nomes[s.empresa_id as string] ?? "Desconhecida" })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!await checkGod()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const admin = createAdminClient();
  try {
    await admin.from("flash_sales").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
