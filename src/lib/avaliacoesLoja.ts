// Avaliações públicas de uma loja (página /loja/[slug]) — só no servidor.
// Lê pedidos com o service role porque visitante anônimo não enxerga a tabela
// pedidos; devolve apenas o que pode ser público: nota, comentário, foto,
// data e o PRIMEIRO nome do cliente (nunca nome completo, telefone, endereço).
// Funciona sem a schema_v74 (sem foto/avaliado_em) e sem a v65 (vazio).

import { createAdminClient } from "@/lib/supabase/admin";

export interface AvaliacaoPublica {
  nota: number;
  comentario: string | null;
  foto_url: string | null;
  data: string | null;
  nome: string;
}

export interface ResumoAvaliacoes {
  media: number | null;
  total: number;
  recentes: AvaliacaoPublica[];
}

const VAZIO: ResumoAvaliacoes = { media: null, total: 0, recentes: [] };

function primeiroNome(nome: string | null | undefined): string {
  const p = (nome ?? "").trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, "") ?? "";
  if (p.length < 2) return "Cliente";
  const curto = p.slice(0, 18);
  return curto.charAt(0).toUpperCase() + curto.slice(1).toLowerCase();
}

type Linha = {
  avaliacao_nota: number | null;
  avaliacao_comentario: string | null;
  avaliacao_criada_em: string | null;
  avaliacao_foto_url?: string | null;
  avaliado_em?: string | null;
  cliente_nome: string | null;
};

export async function carregarAvaliacoesLoja(empresaId: string): Promise<ResumoAvaliacoes> {
  try {
    const supabase = createAdminClient();

    // Média + total: mesmo agregado do /explorar (schema_v65)
    let media: number | null = null;
    let total = 0;
    const { data: agg } = await supabase.rpc("get_avaliacoes_publicas", { p_empresa_ids: [empresaId] });
    const linhaAgg = (agg as { media: number | string; total: number | string }[] | null)?.[0];
    if (linhaAgg) { media = Number(linhaAgg.media) || null; total = Number(linhaAgg.total) || 0; }

    // Últimas avaliações (com foto quando a schema_v74 existe)
    const base = "avaliacao_nota, avaliacao_comentario, avaliacao_criada_em, cliente_nome";
    const r1 = await supabase
      .from("pedidos")
      .select(`${base}, avaliacao_foto_url, avaliado_em`)
      .eq("empresa_id", empresaId)
      .not("avaliacao_nota", "is", null)
      .order("avaliado_em", { ascending: false, nullsFirst: false })
      .limit(30);
    let data = r1.data as Linha[] | null;
    let error = r1.error;
    if (error?.code === "42703") {
      ({ data, error } = await supabase
        .from("pedidos")
        .select(base)
        .eq("empresa_id", empresaId)
        .not("avaliacao_nota", "is", null)
        .order("avaliacao_criada_em", { ascending: false, nullsFirst: false })
        .limit(30));
    }
    if (error || !data) return { ...VAZIO, media, total };

    const todas: AvaliacaoPublica[] = (data as Linha[])
      .filter(l => Number(l.avaliacao_nota) >= 1)
      .map(l => ({
        nota: Math.min(5, Math.max(1, Math.round(Number(l.avaliacao_nota)))),
        comentario: l.avaliacao_comentario?.trim() || null,
        foto_url: l.avaliacao_foto_url && /^https?:\/\//.test(l.avaliacao_foto_url) ? l.avaliacao_foto_url : null,
        data: l.avaliado_em ?? l.avaliacao_criada_em ?? null,
        nome: primeiroNome(l.cliente_nome),
      }));

    // Prefere as que têm comentário ou foto; se forem poucas, mostra todas
    const comConteudo = todas.filter(a => a.comentario || a.foto_url);
    const recentes = (comConteudo.length >= 3 ? comConteudo : todas).slice(0, 10);

    if (!total && todas.length) {
      total = todas.length;
      media = Math.round((todas.reduce((s, a) => s + a.nota, 0) / todas.length) * 10) / 10;
    }
    return { media, total, recentes };
  } catch {
    return VAZIO; // sem service role / banco fora: loja abre normal, sem avaliações
  }
}
