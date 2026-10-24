import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isLojaDemo } from "@/lib/demoLoja";
import ExplorarClient from "./ExplorarClient";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Explorar — Vellox",
  description: "Descubra restaurantes e deliveries perto de você. Peça comida rápido pelo Vellox.",
};

interface ExplorarConfig {
  badge_text: string; hero_titulo: string; hero_destaque: string;
  hero_subtitulo: string; accent_color: string;
}

const CONFIG_DEFAULTS: ExplorarConfig = {
  badge_text:     "DESCUBRA · PEÇA · RECEBA",
  hero_titulo:    "Peça comida no",
  hero_destaque:  "seu jeito",
  hero_subtitulo: "Descubra restaurantes incríveis e peça com entrega rápida",
  accent_color:   "#E4002B",
};

export default async function ExplorarPage() {
  const supabase = await createClient();

  // Empresas ativas com assinatura válida (sem a loja de demonstração)
  const { data: empresasRaw } = await supabase
    .from("empresas_publica")
    .select("id, nome, slug, verificado, lat, lng, created_at")
    .eq("ativo", true)
    .eq("assinatura_ativa", true);

  const empresas = (empresasRaw ?? []).filter(e => !isLojaDemo(e.slug as string));
  const empresaIds = empresas.map(e => e.id);

  // Configurações (logo, banner, aberto, taxas, horário)
  const { data: configs } = empresaIds.length
    ? await supabase
        .from("configuracao_loja")
        .select("empresa_id, cor_principal, logo_url, banner_url, aberto, taxa_entrega, tempo_entrega, descricao, horario_funcionamento")
        .in("empresa_id", empresaIds)
    : { data: [] };

  const configMap = new Map((configs ?? []).map(c => [c.empresa_id, c]));

  // Cardápio resumido: menor preço ("pratos a partir de") e categorias de
  // produto (filtro de categoria/busca). Paginado porque o PostgREST corta
  // em 1000 linhas por resposta.
  const resumo = new Map<string, { min: number | null; total: number; cats: Map<string, number> }>();
  if (empresaIds.length) {
    for (let pagina = 0; pagina < 10; pagina++) {
      const { data: prods, error } = await supabase
        .from("produtos")
        .select("empresa_id, preco, categoria, ativo")
        .in("empresa_id", empresaIds)
        .range(pagina * 1000, pagina * 1000 + 999);
      if (error || !prods?.length) break;
      for (const p of prods as { empresa_id: string; preco: number | null; categoria: string | null; ativo: boolean | null }[]) {
        if (p.ativo === false) continue;
        const r = resumo.get(p.empresa_id) ?? { min: null, total: 0, cats: new Map<string, number>() };
        r.total++;
        const preco = Number(p.preco);
        if (preco > 0 && (r.min === null || preco < r.min)) r.min = preco;
        const cat = (p.categoria ?? "").trim();
        if (cat) r.cats.set(cat, (r.cats.get(cat) ?? 0) + 1);
        resumo.set(p.empresa_id, r);
      }
      if (prods.length < 1000) break;
    }
  }

  // Bairros atendidos + taxa por bairro ("Entrega no meu bairro?").
  // Loja sem bairros cadastrados usa a taxa fixa da configuração.
  const bairrosMap = new Map<string, { bairro: string; taxa: number }[]>();
  if (empresaIds.length) {
    for (let pagina = 0; pagina < 10; pagina++) {
      const { data: bts, error } = await supabase
        .from("bairros_taxa")
        .select("empresa_id, bairro, taxa")
        .in("empresa_id", empresaIds)
        .eq("ativo", true)
        .range(pagina * 1000, pagina * 1000 + 999);
      if (error || !bts?.length) break;
      for (const b of bts as { empresa_id: string; bairro: string | null; taxa: number | string | null }[]) {
        const nome = (b.bairro ?? "").trim();
        if (!nome) continue;
        const lista = bairrosMap.get(b.empresa_id) ?? [];
        lista.push({ bairro: nome, taxa: Number(b.taxa) || 0 });
        bairrosMap.set(b.empresa_id, lista);
      }
      if (bts.length < 1000) break;
    }
  }

  // Extras (destaque/categoria) — tabela opcional
  let extrasMap = new Map<string, { destaque: boolean; categoria: string | null }>();
  try {
    const { data: extras } = await supabase
      .from("explorar_extras")
      .select("empresa_id, destaque, categoria")
      .in("empresa_id", empresaIds);
    extrasMap = new Map((extras ?? []).map(e => [e.empresa_id, e]));
  } catch { /* ainda não migrado */ }

  // Banners do carrossel — tabela opcional
  let banners: {
    id: string; titulo: string; subtitulo: string | null;
    imagem_url: string | null; link_url: string | null; cor_fundo: string;
  }[] = [];
  try {
    const { data } = await supabase
      .from("explorar_banners")
      .select("id, titulo, subtitulo, imagem_url, link_url, cor_fundo")
      .eq("ativo", true)
      .order("ordem");
    banners = (data ?? []) as typeof banners;
  } catch { /* ainda não migrado */ }

  // Categorias configuráveis — tabela opcional
  let categorias: { id: string; nome: string; emoji: string }[] = [];
  try {
    const { data } = await supabase
      .from("explorar_categorias")
      .select("id, nome, emoji")
      .eq("ativo", true)
      .order("ordem");
    categorias = (data ?? []) as typeof categorias;
  } catch { /* ainda não migrado */ }

  // Config do hero (badge, títulos, cor) — tabela opcional
  let config: ExplorarConfig = CONFIG_DEFAULTS;
  try {
    const { data } = await supabase.from("explorar_config").select("*").eq("id", 1).single();
    if (data) config = { ...CONFIG_DEFAULTS, ...data };
  } catch { /* tabela ainda não criada */ }

  // Avaliações reais (média + total) por loja — RPC opcional, degrada pra
  // "sem avaliação" se a migração ainda não rodou.
  let avaliacoesMap = new Map<string, { media: number; total: number }>();
  try {
    const { data: avaliacoes } = empresaIds.length
      ? await supabase.rpc("get_avaliacoes_publicas", { p_empresa_ids: empresaIds })
      : { data: [] };
    avaliacoesMap = new Map(
      (avaliacoes ?? []).map((a: { empresa_id: string; media: number; total: number }) => [a.empresa_id, { media: a.media, total: a.total }])
    );
  } catch { /* ainda não migrado */ }

  const lojas = empresas.map(e => {
    const cfg   = configMap.get(e.id) ?? null;
    const extra = extrasMap.get(e.id);
    const aval  = avaliacoesMap.get(e.id);
    const res   = resumo.get(e.id);
    const cats  = res ? [...res.cats.entries()] : [];
    return {
      id:         e.id,
      nome:       e.nome,
      slug:       e.slug as string,
      verificado: e.verificado as boolean,
      lat:        e.lat as number | null,
      lng:        e.lng as number | null,
      config:     cfg as {
        empresa_id: string;
        cor_principal: string | null;
        logo_url: string | null;
        banner_url: string | null;
        aberto: boolean;
        taxa_entrega: number | null;
        tempo_entrega: string | null;
        descricao: string | null;
        horario_funcionamento: string | null;
      } | null,
      destaque:    extra?.destaque  ?? false,
      categoria:   extra?.categoria ?? null,
      created_at:  e.created_at as string,
      avaliacaoMedia: aval?.media ?? null,
      avaliacaoTotal: aval?.total ?? 0,
      precoMin:       res?.min ?? null,
      tagsPrincipais: res ? cats.filter(([, n]) => n / res.total >= 0.3).map(([c]) => c) : [],
      catsProdutos:   cats.map(([c]) => c),
      bairros:        bairrosMap.get(e.id) ?? [],
    };
  });

  return (
    <ExplorarClient
      lojas={lojas}
      banners={banners}
      categorias={categorias}
      heroConfig={config}
    />
  );
}
