import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashPassword } from "@/lib/passwordHash";

const MIN_LEN = 4;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { senha } = await req.json().catch(() => ({ senha: null }));
  if (typeof senha !== "string" || senha.length < MIN_LEN) {
    return NextResponse.json({ error: `Senha precisa ter pelo menos ${MIN_LEN} caracteres` }, { status: 400 });
  }

  const { error } = await supabase.rpc("set_senha_financeiro", { p_hash: hashPassword(senha) });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// Desativa a proteção (volta ao comportamento padrão, sem senha).
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { error } = await supabase.rpc("set_senha_financeiro", { p_hash: null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
