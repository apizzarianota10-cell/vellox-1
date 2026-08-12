import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q           = searchParams.get("q")?.trim() ?? "";
  const categoria   = searchParams.get("categoria") ?? "";
  const apenasAberto = searchParams.get("aberto") === "1";

  const supabase = await createClient();

  // ── 1. Empresas ativas com assinatura válida ──────────────────
  let empQuery = supabase
    .from("empresas")
    .select("id, nome, slug, verificado, lat, lng")
    .eq("ativo", true)
    .eq("assinatura_ativa", true);

  const { data: empresas } = await empQuery;

  if (!empresas?.length) {
    return NextResponse.json({ lojas: [], banners: [], categorias: [] });
  }

  const empresaIds = empresas.map(e => e.id);

  // ── 2. Configurações das lojas (aberto, taxas, logo, banner) ──
  const { data: configs } = await supabase
    .from("configuracoes_loja")
    .select("empresa_id, cor_principal, logo_url, banner_url, aberto, taxa_entrega, tempo_entrega, descricao")
    .in("empresa_id", empresaIds);

  const configMap = new Map((configs ?? []).map(c => [c.empresa_id, c]));

  // ── 3. Flags extras (destaque, categoria) — opcionais, adicionados via migração ──
  let extrasMap = new Map<string, { destaque: boolean; categoria: string | null }>();
  try {
    const { data: extras } = await supabase
      .from("explorar_extras")
      .select("empresa_id, destaque, categoria")
      .in("empresa_id", empresaIds);
    extrasMap = new Map((extras ?? []).map(e => [e.empresa_id, e]));
  } catch { /* tabela ainda não existe — ignora */ }

  // ── 4. Monta resultado ────────────────────────────────────────
  let lojas = empresas.map(e => {
    const cfg   = configMap.get(e.id) ?? null;
    const extra = extrasMap.get(e.id);
    return {
      id:          e.id,
      nome:        e.nome,
      slug:        e.slug,
      verificado:  e.verificado,
      lat:         e.lat,
      lng:         e.lng,
      config:      cfg,
      destaque:    extra?.destaque  ?? false,
      categoria:   extra?.categoria ?? null,
    };
  });

  // Filtros client-request
  if (q) {
    const ql = q.toLowerCase();
    lojas = lojas.filter(l =>
      l.nome.toLowerCase().includes(ql) ||
      (l.config?.descricao ?? "").toLowerCase().includes(ql) ||
      (l.categoria ?? "").toLowerCase().includes(ql),
    );
  }
  if (categoria) lojas = lojas.filter(l => l.categoria === categoria);
  if (apenasAberto) lojas = lojas.filter(l => l.config?.aberto !== false);

  // Destaques primeiro
  lojas.sort((a, b) => (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0));

  // Busca por produto quando há query
  let produtos_busca: {
    id: string; nome: string; preco: number;
    imagem_url: string | null;
    empresa: { nome: string; slug: string };
  }[] = [];
  if (q && empresaIds.length) {
    const empresaMap = new Map(empresas.map(e => [e.id, e]));
    const { data: prodRaw } = await supabase
      .from("produtos")
      .select("id, nome, preco, imagem_url, empresa_id")
      .ilike("nome", `%${q}%`)
      .in("empresa_id", empresaIds)
      .limit(12);
    produtos_busca = (prodRaw ?? []).map(p => ({
      id:         p.id,
      nome:       p.nome,
      preco:      p.preco,
      imagem_url: p.imagem_url ?? null,
      empresa:    { nome: empresaMap.get(p.empresa_id)?.nome ?? "", slug: empresaMap.get(p.empresa_id)?.slug ?? "" },
    }));
  }

  // ── 5. Banners do carrossel ───────────────────────────────────
  let banners: unknown[] = [];
  try {
    const { data } = await supabase
      .from("explorar_banners")
      .select("id, titulo, subtitulo, imagem_url, link_url, cor_fundo")
      .eq("ativo", true)
      .order("ordem");
    banners = data ?? [];
  } catch { /* tabela ainda não existe */ }

  // ── 6. Categorias configuráveis ───────────────────────────────
  let categorias: unknown[] = [];
  try {
    const { data } = await supabase
      .from("explorar_categorias")
      .select("id, nome, emoji")
      .eq("ativo", true)
      .order("ordem");
    categorias = data ?? [];
  } catch { /* tabela ainda não existe */ }

  return NextResponse.json({ lojas, banners, categorias, produtos_busca });
}
