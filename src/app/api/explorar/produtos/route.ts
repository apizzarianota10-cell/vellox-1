import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 120;

export async function GET() {
  const supabase = await createClient();

  // Empresas ativas
  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, nome, slug")
    .eq("ativo", true)
    .eq("assinatura_ativa", true);

  const empresaIds = (empresas ?? []).map(e => e.id);
  if (!empresaIds.length) return NextResponse.json({ produtos: [] });

  const empresaMap = new Map((empresas ?? []).map(e => [e.id, e]));

  // Produtos com imagem
  const { data: raw } = await supabase
    .from("produtos")
    .select("id, nome, preco, imagem_url, empresa_id")
    .in("empresa_id", empresaIds)
    .not("imagem_url", "is", null)
    .neq("imagem_url", "")
    .limit(24);

  const produtos = (raw ?? [])
    .filter(p => p.imagem_url)
    .map(p => ({
      id:          p.id,
      nome:        p.nome,
      preco:       p.preco,
      imagem_url:  p.imagem_url,
      empresa:     empresaMap.get(p.empresa_id) ?? { nome: "", slug: "" },
    }));

  return NextResponse.json({ produtos });
}
