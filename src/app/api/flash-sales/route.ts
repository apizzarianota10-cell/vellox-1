import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET: lista flash sales ativas (público) ou todas da empresa (?empresa_id=...)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get("empresa_id");
  const supabase  = await createClient();

  if (empresaId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== empresaId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
    const { data } = await supabase
      .from("flash_sales")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false });
    return NextResponse.json({ flash_sales: data ?? [] });
  }

  try {
    const { data } = await supabase
      .from("flash_sales")
      .select("id, empresa_id, nome, descricao, preco_original, preco_flash, imagem_url, termina_em")
      .eq("ativo", true)
      .gt("termina_em", new Date().toISOString())
      .order("termina_em", { ascending: true })
      .limit(10);
    return NextResponse.json({ flash_sales: data ?? [] });
  } catch {
    return NextResponse.json({ flash_sales: [] });
  }
}

// POST: empresa cria uma flash sale
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { nome, descricao, preco_original, preco_flash, imagem_url, duracao_horas } = await req.json();
  if (!nome || !preco_flash || !duracao_horas) {
    return NextResponse.json({ error: "Campos obrigatórios: nome, preco_flash, duracao_horas" }, { status: 400 });
  }

  const termina_em = new Date(Date.now() + Number(duracao_horas) * 3_600_000).toISOString();

  const { data, error } = await supabase
    .from("flash_sales")
    .insert({
      empresa_id:    user.id,
      nome,
      descricao:     descricao  || null,
      preco_original: preco_original ?? null,
      preco_flash:   Number(preco_flash),
      imagem_url:    imagem_url || null,
      termina_em,
      ativo:         true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flash_sale: data });
}
