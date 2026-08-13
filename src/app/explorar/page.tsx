import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
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
  accent_color:   "#FF6A00",
};

export default async function ExplorarPage() {
  const supabase = await createClient();

  // Empresas ativas com assinatura válida
  const { data: empresas } = await supabase
    .from("empresas_publica")
    .select("id, nome, slug, verificado, lat, lng, created_at")
    .eq("ativo", true)
    .eq("assinatura_ativa", true);

  const empresaIds = (empresas ?? []).map(e => e.id);

  // Configurações (logo, banner, aberto, taxas)
  const { data: configs } = empresaIds.length
    ? await supabase
        .from("configuracao_loja")
        .select("empresa_id, cor_principal, logo_url, banner_url, aberto, taxa_entrega, tempo_entrega, descricao")
        .in("empresa_id", empresaIds)
    : { data: [] };

  const configMap = new Map((configs ?? []).map(c => [c.empresa_id, c]));

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

  const lojas = (empresas ?? []).map(e => {
    const cfg   = configMap.get(e.id) ?? null;
    const extra = extrasMap.get(e.id);
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
      } | null,
      destaque:    extra?.destaque  ?? false,
      categoria:   extra?.categoria ?? null,
      created_at:  e.created_at as string,
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
