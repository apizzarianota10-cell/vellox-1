import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const GOD_EMAIL = process.env.GOD_EMAIL;

async function checkGod() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== GOD_EMAIL) return null;
  return supabase;
}

// GET: banners + categorias + empresas com seus extras
export async function GET() {
  const supabase = await checkGod();
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let banners:    unknown[] = [];
  let categorias: unknown[] = [];

  try {
    const { data } = await supabase
      .from("explorar_banners")
      .select("id, titulo, subtitulo, imagem_url, link_url, cor_fundo, ativo, ordem")
      .order("ordem");
    banners = data ?? [];
  } catch {}

  try {
    const { data } = await supabase
      .from("explorar_categorias")
      .select("id, nome, emoji, ativo, ordem")
      .order("ordem");
    categorias = data ?? [];
  } catch {}

  // Empresas ativas
  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, nome, assinatura_ativa")
    .eq("ativo", true)
    .order("nome");

  // Extras (destaque + categoria) por empresa
  let extrasMap: Record<string, { destaque: boolean; categoria: string | null }> = {};
  try {
    const ids = (empresas ?? []).map(e => e.id);
    if (ids.length) {
      const { data: extras } = await supabase
        .from("explorar_extras")
        .select("empresa_id, destaque, categoria")
        .in("empresa_id", ids);
      for (const ex of extras ?? []) {
        extrasMap[ex.empresa_id] = { destaque: ex.destaque, categoria: ex.categoria };
      }
    }
  } catch {}

  const empresasComExtras = (empresas ?? []).map(e => ({
    id:              e.id,
    nome:            e.nome,
    assinatura_ativa: e.assinatura_ativa,
    destaque:        extrasMap[e.id]?.destaque  ?? false,
    categoria:       extrasMap[e.id]?.categoria ?? null,
  }));

  return NextResponse.json({ banners, categorias, empresas: empresasComExtras });
}

// POST: cria banner ou categoria
export async function POST(req: Request) {
  const supabase = await checkGod();
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body     = await req.json();
  const { type } = body;

  if (type === "banner") {
    const { titulo, subtitulo, imagem_url, link_url, cor_fundo } = body;
    try {
      const { data, error } = await supabase
        .from("explorar_banners")
        .insert({ titulo, subtitulo: subtitulo || null, imagem_url: imagem_url || null, link_url: link_url || null, cor_fundo: cor_fundo ?? "#E4002B" })
        .select().single();
      if (error) throw error;
      return NextResponse.json(data);
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  if (type === "categoria") {
    const { nome, emoji } = body;
    try {
      const { data, error } = await supabase
        .from("explorar_categorias")
        .insert({ nome, emoji: emoji || "🍽️" })
        .select().single();
      if (error) throw error;
      return NextResponse.json(data);
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "type inválido" }, { status: 400 });
}

// PATCH: atualiza banner, categoria ou destaque/categoria de empresa
export async function PATCH(req: Request) {
  const supabase = await checkGod();
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.type === "banner") {
    const { id, titulo, subtitulo, imagem_url, link_url, cor_fundo } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    try {
      const { error } = await supabase
        .from("explorar_banners")
        .update({ titulo, subtitulo: subtitulo || null, imagem_url: imagem_url || null, link_url: link_url || null, cor_fundo })
        .eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  if (body.type === "categoria") {
    const { id, nome, emoji } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    try {
      const { error } = await supabase
        .from("explorar_categorias")
        .update({ nome, emoji: emoji || "🍽️" })
        .eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  const { empresa_id, destaque, categoria } = body;
  if (!empresa_id) return NextResponse.json({ error: "empresa_id obrigatório" }, { status: 400 });

  try {
    const { error } = await supabase
      .from("explorar_extras")
      .upsert({ empresa_id, destaque: destaque ?? false, categoria: categoria ?? null }, { onConflict: "empresa_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE: remove banner ou categoria
export async function DELETE(req: Request) {
  const supabase = await checkGod();
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, id } = await req.json();

  if (type === "banner") {
    try {
      await supabase.from("explorar_banners").delete().eq("id", id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  if (type === "categoria") {
    try {
      await supabase.from("explorar_categorias").delete().eq("id", id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "type inválido" }, { status: 400 });
}
