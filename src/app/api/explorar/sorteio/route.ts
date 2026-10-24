import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isLojaDemo } from "@/lib/demoLoja";
import { precoVitrine, SELECT_PRECO_VITRINE, type ProdutoPrecoInfo } from "@/lib/precoVitrine";

export const dynamic = "force-dynamic";

// "Não sei o que comer": pratos ativos de lojas ABERTAS para o sorteio do
// /explorar. O sorteio em si (filtros, categoria, preferência por foto)
// acontece no navegador; aqui só vai um apanhado enxuto por loja.
const POR_LOJA = 30;

export async function GET() {
  const supabase = await createClient();

  const { data: empresasRaw } = await supabase
    .from("empresas_publica")
    .select("id, nome, slug")
    .eq("ativo", true)
    .eq("assinatura_ativa", true);
  const empresas = (empresasRaw ?? []).filter(e => !isLojaDemo(e.slug as string));
  if (!empresas.length) return NextResponse.json({ pratos: [] });

  const { data: configs } = await supabase
    .from("configuracao_loja")
    .select("empresa_id, aberto")
    .in("empresa_id", empresas.map(e => e.id));
  const fechadas = new Set((configs ?? []).filter(c => c.aberto === false).map(c => c.empresa_id as string));
  const abertas = empresas.filter(e => !fechadas.has(e.id));
  if (!abertas.length) return NextResponse.json({ pratos: [] });
  const empresaMap = new Map(abertas.map(e => [e.id as string, { id: e.id as string, nome: e.nome as string, slug: e.slug as string }]));

  const { data: raw, error } = await supabase
    .from("produtos")
    .select(`id, nome, imagem_url, categoria, empresa_id, ativo, ${SELECT_PRECO_VITRINE}`)
    .in("empresa_id", [...empresaMap.keys()])
    .eq("ativo", true)
    .limit(1000);
  if (error) return NextResponse.json({ pratos: [] });

  // Por loja: primeiro os com foto, no máximo POR_LOJA
  const porLoja = new Map<string, NonNullable<typeof raw>>();
  for (const p of raw ?? []) {
    const l = porLoja.get(p.empresa_id as string) ?? [];
    l.push(p);
    porLoja.set(p.empresa_id as string, l);
  }

  const pratos = [...porLoja.entries()].flatMap(([empresaId, lista]) =>
    [...lista]
      .sort((a, b) => (b.imagem_url ? 1 : 0) - (a.imagem_url ? 1 : 0))
      .slice(0, POR_LOJA)
      .map(p => {
        const { preco, aPartirDe } = precoVitrine(p as unknown as ProdutoPrecoInfo);
        return {
          id:         p.id as string,
          nome:       p.nome as string,
          preco,
          aPartirDe,
          imagem_url: (p.imagem_url as string | null) || null,
          categoria:  (p.categoria as string | null) ?? null,
          empresa:    empresaMap.get(empresaId)!,
        };
      }),
  );

  return NextResponse.json({ pratos }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
