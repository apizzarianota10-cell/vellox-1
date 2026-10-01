import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyPassword } from "@/lib/passwordHash";

// Confirma a senha do financeiro e, se bater, já devolve os dados na mesma
// resposta — assim o relatório financeiro só sai do servidor depois da
// senha confirmada, em vez de ir no HTML da página e só esconder na tela.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { senha } = await req.json().catch(() => ({ senha: null }));
  if (typeof senha !== "string" || !senha) {
    return NextResponse.json({ error: "Informe a senha" }, { status: 400 });
  }

  const { data: empresa, error: empErr } = await supabase
    .from("empresas")
    .select("senha_financeiro")
    .eq("id", user.id)
    .single();

  if (empErr || !empresa?.senha_financeiro) {
    return NextResponse.json({ error: "Proteção por senha não está ativada" }, { status: 400 });
  }

  if (!verifyPassword(senha, empresa.senha_financeiro)) {
    return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
  }

  const [pedidosRes, motoboysRes] = await Promise.all([
    supabase
      .from("pedidos")
      .select("*, motoboy:motoboys(id, nome)")
      .eq("empresa_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("motoboys")
      .select("id, nome")
      .eq("empresa_id", user.id),
  ]);

  if (pedidosRes.error) {
    return NextResponse.json({ error: "Erro ao carregar o relatório" }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, pedidos: pedidosRes.data ?? [], motoboys: motoboysRes.data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
