import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import LojaClient from "./LojaClient";
import type { Produto, ConfiguracaoLoja, Empresa, BairroTaxa } from "@/types";
import { precoVitrine, brl, SELECT_PRECO_VITRINE, type ProdutoPrecoInfo } from "@/lib/precoVitrine";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: empresa } = await supabase
    .from("empresas_publica")
    .select("id, nome")
    .eq("slug", slug.toLowerCase())
    .single();

  if (!empresa) {
    return { title: "Loja não encontrada" };
  }

  const base = `/loja/${encodeURIComponent(slug.toLowerCase())}`;

  // Link profundo de um prato (?produto=<id>): prévia com a foto, o nome e o
  // preço do prato (WhatsApp, Instagram, etc.).
  const produtoId = typeof sp.produto === "string" && UUID_RE.test(sp.produto) ? sp.produto : null;
  if (produtoId) {
    const { data: prod } = await supabase
      .from("produtos")
      .select(`id, nome, descricao, ativo, ${SELECT_PRECO_VITRINE}`)
      .eq("id", produtoId)
      .eq("empresa_id", empresa.id)
      .maybeSingle();
    if (prod && prod.ativo !== false) {
      const { preco, aPartirDe } = precoVitrine(prod as unknown as ProdutoPrecoInfo);
      const valor = preco > 0 ? `${aPartirDe ? "a partir de " : ""}${brl(preco)}` : "";
      const titulo = `${prod.nome}${valor ? ` · ${valor}` : ""} — ${empresa.nome}`;
      const descricao = (prod.descricao as string | null)?.trim()
        || `Olha que delícia: ${prod.nome}${valor ? ` por ${valor}` : ""} na ${empresa.nome}. Peça online!`;
      const imagem = { url: `${base}/og?produto=${prod.id}`, width: 1200, height: 630, alt: prod.nome as string };
      const url = `${base}?produto=${prod.id}`;
      return {
        title: titulo,
        description: descricao,
        alternates: { canonical: url },
        openGraph: { title: titulo, description: descricao, type: "website", url, images: [imagem] },
        twitter: { card: "summary_large_image", title: titulo, description: descricao, images: [imagem.url] },
      };
    }
  }

  const { data: config } = await supabase
    .from("configuracao_loja")
    .select("descricao")
    .eq("empresa_id", empresa.id)
    .single();

  const titulo = empresa.nome;
  const descricao = config?.descricao || `Faça seu pedido na ${empresa.nome}`;
  const imagem = { url: `${base}/og`, width: 1200, height: 630, alt: empresa.nome };

  return {
    title: titulo,
    description: descricao,
    openGraph: {
      title: titulo,
      description: descricao,
      type: "website",
      images: [imagem],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descricao,
      images: [imagem.url],
    },
  };
}

export default async function LojaPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: empresa } = await supabase
    .from("empresas_publica")
    .select("id, nome, codigo, slug, verificado")
    .eq("slug", slug.toLowerCase())
    .single();

  if (!empresa) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f7f8" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <p style={{ fontSize: 48, margin: "0 0 16px" }}>🔍</p>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#0f172a", margin: "0 0 8px" }}>Loja não encontrada</h1>
          <p style={{ fontSize: 14, color: "#64748b" }}>A loja <strong>{slug}</strong> não existe.</p>
        </div>
      </div>
    );
  }

  const [{ data: produtos }, { data: config }, { data: bairros }] = await Promise.all([
    supabase
      .from("produtos")
      .select("*, produto_variacoes(*), produto_sabores(*), produto_adicionais(*), produto_categorias_sabor(*), categoria_preco:categorias_preco!categoria_preco_id(*, tamanhos:categorias_preco_tamanhos(*))")
      .eq("empresa_id", empresa.id)
      .eq("ativo", true)
      .order("categoria")
      .order("ordem")
      .order("created_at"),
    supabase
      .from("configuracao_loja")
      .select("*")
      .eq("empresa_id", empresa.id)
      .single(),
    supabase
      .from("bairros_taxa")
      .select("*")
      .eq("empresa_id", empresa.id)
      .eq("ativo", true)
      .order("ordem")
      .order("bairro"),
  ]);

  return (
    <LojaClient
      produtos={(produtos ?? []) as Produto[]}
      config={config as ConfiguracaoLoja | null}
      empresa={empresa as Pick<Empresa, "id" | "nome" | "codigo" | "slug" | "verificado">}
      bairros={(bairros ?? []) as BairroTaxa[]}
    />
  );
}
