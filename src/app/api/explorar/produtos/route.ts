import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isLojaDemo } from "@/lib/demoLoja";

export const dynamic = "force-dynamic";
export const revalidate = 120;

// "Pratos em alta" do /explorar: pratos ativos com foto, variados entre as
// lojas (no máximo 4 por loja, intercalados) para a vitrine não virar o
// cardápio de uma loja só.
export async function GET() {
  const supabase = await createClient();

  // Empresas ativas (sem a loja de demonstração)
  const { data: empresasRaw } = await supabase
    .from("empresas_publica")
    .select("id, nome, slug")
    .eq("ativo", true)
    .eq("assinatura_ativa", true);

  const empresas = (empresasRaw ?? []).filter(e => !isLojaDemo(e.slug));
  const empresaIds = empresas.map(e => e.id);
  if (!empresaIds.length) return NextResponse.json({ produtos: [] });

  const empresaMap = new Map(empresas.map(e => [e.id, { nome: e.nome, slug: e.slug }]));

  // Produtos com imagem
  const { data: raw } = await supabase
    .from("produtos")
    .select("id, nome, preco, imagem_url, empresa_id, ativo")
    .in("empresa_id", empresaIds)
    .not("imagem_url", "is", null)
    .neq("imagem_url", "")
    .limit(200);

  const porLoja = new Map<string, NonNullable<typeof raw>>();
  for (const p of raw ?? []) {
    if (!p.imagem_url || p.ativo === false) continue;
    const l = porLoja.get(p.empresa_id) ?? [];
    if (l.length < 4) l.push(p);
    porLoja.set(p.empresa_id, l);
  }

  // Intercala: 1º de cada loja, depois 2º de cada loja…
  const listas = [...porLoja.values()];
  const intercalados: NonNullable<typeof raw> = [];
  for (let i = 0; i < 4; i++) for (const l of listas) if (l[i]) intercalados.push(l[i]);

  const produtos = intercalados.slice(0, 16).map(p => ({
    id:         p.id,
    nome:       p.nome,
    preco:      Number(p.preco),
    imagem_url: p.imagem_url,
    empresa:    empresaMap.get(p.empresa_id) ?? { nome: "", slug: "" },
  }));

  return NextResponse.json({ produtos });
}
