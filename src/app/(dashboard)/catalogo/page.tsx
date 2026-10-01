import { createClient } from "@/lib/supabase/server";
import CatalogoClient from "./CatalogoClient";
import DbError from "@/components/DbError";
import type { Produto, ConfiguracaoLoja, BairroTaxa, CategoriaPreco, ProdutoMaisVendido } from "@/types";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [produtosRes, { data: config }, { data: empresa }, { data: bairros }, { data: categoriasPreco }, { data: maisVendidos }] = await Promise.all([
    supabase
      .from("produtos")
      .select("*, produto_variacoes(*), produto_sabores(*), produto_adicionais(*), produto_categorias_sabor(*)")
      .eq("empresa_id", user.id)
      .order("categoria")
      .order("ordem")
      .order("created_at"),
    supabase
      .from("configuracao_loja")
      .select("*")
      .eq("empresa_id", user.id)
      .single(),
    supabase
      .from("empresas")
      .select("nome, codigo, slug, verificado")
      .eq("id", user.id)
      .single(),
    supabase
      .from("bairros_taxa")
      .select("*")
      .eq("empresa_id", user.id)
      .order("ordem")
      .order("bairro"),
    supabase
      .from("categorias_preco")
      .select("*, tamanhos:categorias_preco_tamanhos(*)")
      .eq("empresa_id", user.id)
      .order("ordem"),
    supabase.rpc("get_produtos_mais_vendidos", { p_empresa_id: user.id, p_limit: 8 }),
  ]);

  if (produtosRes.error) return <DbError message="Erro ao carregar o catálogo. Tente novamente." />;

  return (
    <CatalogoClient
      initialProdutos={(produtosRes.data ?? []) as Produto[]}
      initialConfig={config as ConfiguracaoLoja | null}
      initialBairros={(bairros ?? []) as BairroTaxa[]}
      initialCategoriasPreco={(categoriasPreco ?? []) as CategoriaPreco[]}
      initialMaisVendidos={(maisVendidos ?? []) as ProdutoMaisVendido[]}
      empresaId={user.id}
      empresaNome={empresa?.nome ?? ""}
      empresaCodigo={empresa?.codigo ?? ""}
      empresaSlug={empresa?.slug ?? ""}
      initialVerificado={empresa?.verificado ?? false}
    />
  );
}
