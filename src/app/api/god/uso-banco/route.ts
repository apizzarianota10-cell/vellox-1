import { NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { requireGod, createAdminClient, buscarTudo, faltaMigracao, num, type Admin } from "@/lib/godServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Bucket público do projeto Supabase de IMAGENS (separado do banco — ver /api/upload)
const BUCKET_IMAGENS = "produtos";
const MAX_LISTAGENS = 400;     // chamadas de list() no Storage
const MAX_ARQUIVOS  = 60_000;

interface UsoRpc {
  db_bytes: number;
  tabelas: { tabela: string; total_bytes: number; linhas_estimadas: number }[];
  linhas: { empresa_id: string; tabela: string; linhas: number; bytes: number }[];
  storage_total: number | null;
  storage_buckets: { bucket: string; objetos: number; bytes: number }[];
  storage: { empresa_id: string | null; objetos: number | null; bytes: number }[];
  gerado_em: string;
}

interface ArquivoImg { caminho: string; bytes: number }

let cache: { em: number; dados: unknown } | null = null;
const CACHE_MS = 5 * 60 * 1000;

/** Varre o bucket de imagens (pastas recursivas) e devolve caminho + tamanho. */
async function listarImagens(): Promise<{ arquivos: ArquivoImg[]; truncado: boolean; erro: string | null } | null> {
  const url = process.env.IMAGES_SUPABASE_URL;
  const key = process.env.IMAGES_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const sb = createSbClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const arquivos: ArquivoImg[] = [];
  const fila: string[] = [""];
  let chamadas = 0;
  try {
    while (fila.length) {
      const pasta = fila.shift()!;
      for (let offset = 0; ; offset += 1000) {
        if (++chamadas > MAX_LISTAGENS || arquivos.length >= MAX_ARQUIVOS) return { arquivos, truncado: true, erro: null };
        const { data, error } = await sb.storage.from(BUCKET_IMAGENS).list(pasta, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
        if (error) return { arquivos, truncado: true, erro: error.message };
        const itens = data ?? [];
        for (const it of itens) {
          const caminho = pasta ? `${pasta}/${it.name}` : it.name;
          if (it.id == null) fila.push(caminho);        // pasta
          else arquivos.push({ caminho, bytes: num((it.metadata as { size?: number } | null)?.size) });
        }
        if (itens.length < 1000) break;
      }
    }
  } catch (e) {
    return { arquivos, truncado: true, erro: String(e) };
  }
  return { arquivos, truncado: false, erro: null };
}

/** Caminho do objeto dentro do bucket a partir da URL pública (só do projeto de imagens). */
function caminhoDaUrl(u: unknown, host: string): string | null {
  if (typeof u !== "string" || !u) return null;
  try {
    const url = new URL(u);
    if (host && url.host !== host) return null;
    const marca = `/storage/v1/object/public/${BUCKET_IMAGENS}/`;
    const i = url.pathname.indexOf(marca);
    if (i < 0) return null;
    return decodeURIComponent(url.pathname.slice(i + marca.length));
  } catch { return null; }
}

/** Mapa caminho → empresa_id a partir das URLs gravadas no banco principal. */
async function referenciasImagens(admin: Admin, host: string) {
  const ref = new Map<string, string>();      // caminho → empresa_id
  const plataforma = new Set<string>();       // banners do Explorar (do god)
  const put = (url: unknown, emp: unknown) => {
    const c = caminhoDaUrl(url, host);
    if (c && typeof emp === "string" && !ref.has(c)) ref.set(c, emp);
  };

  const prods = await buscarTudo<{ id: string; empresa_id: string; imagem_url: string | null }>((de, ate) =>
    admin.from("produtos").select("id, empresa_id, imagem_url").order("id").range(de, ate), 200_000);
  const prodEmp = new Map<string, string>();
  for (const p of prods.rows) { prodEmp.set(p.id, p.empresa_id); put(p.imagem_url, p.empresa_id); }

  const sabores = await buscarTudo<{ produto_id: string; imagem_url: string | null }>((de, ate) =>
    admin.from("produto_sabores").select("produto_id, imagem_url").not("imagem_url", "is", null).order("id").range(de, ate), 200_000);
  for (const s of sabores.rows) put(s.imagem_url, prodEmp.get(s.produto_id));

  const [cfg, lojas, mbs, fs, banners] = await Promise.all([
    admin.from("configuracao_loja").select("empresa_id, logo_url, banner_url"),
    admin.from("lojas").select("empresa_id, logo_url"),
    admin.from("motoboys").select("empresa_id, foto_url").not("foto_url", "is", null),
    admin.from("flash_sales").select("empresa_id, imagem_url"),
    admin.from("explorar_banners").select("imagem_url"),
  ]);
  for (const c of cfg.data ?? []) { put(c.logo_url, c.empresa_id); put(c.banner_url, c.empresa_id); }
  for (const l of lojas.data ?? []) put(l.logo_url, l.empresa_id);
  for (const m of mbs.data ?? []) put(m.foto_url, m.empresa_id);
  for (const f of fs.error ? [] : fs.data ?? []) put(f.imagem_url, f.empresa_id);
  for (const b of banners.error ? [] : banners.data ?? []) {
    const c = caminhoDaUrl(b.imagem_url, host);
    if (c) plataforma.add(c);
  }
  return { ref, plataforma };
}

// GET /api/god/uso-banco[?refresh=1]
export async function GET(req: NextRequest) {
  if (!await requireGod()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  if (cache && Date.now() - cache.em < CACHE_MS && req.nextUrl.searchParams.get("refresh") !== "1") {
    return NextResponse.json(cache.dados);
  }

  const admin = createAdminClient();
  const [rpcRes, empRes, imgs] = await Promise.all([
    admin.rpc("god_uso_banco"),
    admin.from("empresas").select("id, nome, plano, assinatura_ativa"),
    listarImagens(),
  ]);
  if (empRes.error) return NextResponse.json({ error: empRes.error.message }, { status: 500 });

  const migracaoPendente = !!rpcRes.error && faltaMigracao(rpcRes.error);
  const rpcErro = rpcRes.error && !migracaoPendente ? rpcRes.error.message : null;
  const uso = (rpcRes.error ? null : rpcRes.data) as UsoRpc | null;

  type Tab = { tabela: string; linhas: number; bytes: number; estimado_bytes: number };
  type Emp = {
    id: string; nome: string; plano: string; ativa: boolean;
    linhas: number; db_bytes: number; db_estimado_bytes: number;
    storage_bytes: number; storage_arquivos: number; imagens_bytes: number; imagens_arquivos: number;
    total_bytes: number; tabelas: Tab[];
  };
  const emps = new Map<string, Emp>();
  for (const e of empRes.data ?? []) {
    emps.set(e.id, {
      id: e.id, nome: e.nome, plano: e.plano ?? "basic", ativa: !!e.assinatura_ativa,
      linhas: 0, db_bytes: 0, db_estimado_bytes: 0, storage_bytes: 0, storage_arquivos: 0,
      imagens_bytes: 0, imagens_arquivos: 0, total_bytes: 0, tabelas: [],
    });
  }

  // Banco: bytes de linha + projeção proporcional do tamanho real da tabela (índices/toast)
  if (uso) {
    const somaPorTabela = new Map<string, number>();
    for (const l of uso.linhas) somaPorTabela.set(l.tabela, (somaPorTabela.get(l.tabela) ?? 0) + num(l.bytes));
    const totalTabela = new Map(uso.tabelas.map(t => [t.tabela, num(t.total_bytes)]));
    for (const l of uso.linhas) {
      const e = emps.get(l.empresa_id);
      if (!e) continue;
      const soma = somaPorTabela.get(l.tabela) ?? 0;
      const real = totalTabela.get(l.tabela) ?? 0;
      const fator = soma > 0 && real > soma ? real / soma : 1;
      const est = Math.round(num(l.bytes) * fator);
      e.tabelas.push({ tabela: l.tabela, linhas: num(l.linhas), bytes: num(l.bytes), estimado_bytes: est });
      e.linhas += num(l.linhas);
      e.db_bytes += num(l.bytes);
      e.db_estimado_bytes += est;
    }
    for (const s of uso.storage) {
      if (!s.empresa_id) continue;
      const e = emps.get(s.empresa_id);
      if (!e) continue;
      e.storage_bytes += num(s.bytes);
      e.storage_arquivos += num(s.objetos);
    }
  }

  // Storage do projeto de imagens
  let imagens: {
    configurado: boolean; total_bytes: number; arquivos: number; nao_atribuido_bytes: number;
    nao_atribuido_arquivos: number; plataforma_bytes: number; truncado: boolean; erro: string | null;
  } = { configurado: false, total_bytes: 0, arquivos: 0, nao_atribuido_bytes: 0, nao_atribuido_arquivos: 0, plataforma_bytes: 0, truncado: false, erro: null };
  if (imgs) {
    let host = "";
    try { host = new URL(process.env.IMAGES_SUPABASE_URL!).host; } catch {}
    const { ref, plataforma } = await referenciasImagens(admin, host);
    imagens = { ...imagens, configurado: true, truncado: imgs.truncado, erro: imgs.erro };
    for (const a of imgs.arquivos) {
      imagens.total_bytes += a.bytes;
      imagens.arquivos++;
      // avaliacoes/<empresa_id>/... identifica a loja pelo caminho
      const m = /^avaliacoes\/([0-9a-f-]{36})\//i.exec(a.caminho);
      const empId = (m && emps.has(m[1]) ? m[1] : null) ?? ref.get(a.caminho) ?? null;
      const e = empId ? emps.get(empId) : null;
      if (e) { e.imagens_bytes += a.bytes; e.imagens_arquivos++; }
      else if (plataforma.has(a.caminho)) imagens.plataforma_bytes += a.bytes;
      else { imagens.nao_atribuido_bytes += a.bytes; imagens.nao_atribuido_arquivos++; }
    }
  }

  const lista = [...emps.values()].map(e => {
    e.tabelas.sort((a, b) => b.estimado_bytes - a.estimado_bytes);
    e.total_bytes = e.db_estimado_bytes + e.storage_bytes + e.imagens_bytes;
    return e;
  }).sort((a, b) => b.total_bytes - a.total_bytes);

  const stNaoAtrib = uso ? uso.storage.filter(s => !s.empresa_id || !emps.has(s.empresa_id)).reduce((s, x) => s + num(x.bytes), 0) : 0;

  const dados = {
    migracao_pendente: migracaoPendente,
    erro: rpcErro,
    gerado_em: new Date().toISOString(),
    db: uso ? {
      total_bytes: num(uso.db_bytes),
      atribuido_bytes: lista.reduce((s, e) => s + e.db_estimado_bytes, 0),
      tabelas: uso.tabelas.slice(0, 40),
    } : null,
    storage_principal: uso ? {
      total_bytes: uso.storage_total,
      buckets: uso.storage_buckets,
      nao_atribuido_bytes: stNaoAtrib,
    } : null,
    storage_imagens: imagens,
    empresas: lista,
  };
  cache = { em: Date.now(), dados };
  return NextResponse.json(dados);
}
