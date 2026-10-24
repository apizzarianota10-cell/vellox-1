import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

interface MotoboyRow {
  nome: string;
  telefone: string | null;
  latitude: number | null;
  longitude: number | null;
  ultima_localizacao_at: string | null;
}

interface MotoboyPublico {
  nome: string;
  telefone: string | null;
  latitude: number | null;
  longitude: number | null;
  atualizado_em: string | null;
}

// Nome/telefone do motoboy: enquanto ele atende o pedido.
const STATUS_MOSTRA_MOTOBOY = new Set(["em_coleta", "em_rota_de_entrega", "aguardando_confirmacao"]);
// Posição no mapa: só enquanto ele está indo buscar (em_coleta) ou levando (em_rota).
const STATUS_MOSTRA_POSICAO = new Set(["em_coleta", "em_rota_de_entrega"]);
const STATUS_FINAIS = new Set(["entregue", "cancelado"]);
// Posição mais velha que isso é considerada sem sinal e não é exibida.
const POSICAO_MAX_IDADE_MS = 15 * 60 * 1000;

function posicaoValida(mb: MotoboyRow): boolean {
  const { latitude: lat, longitude: lng } = mb;
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return false;
  if (mb.ultima_localizacao_at) {
    const t = new Date(mb.ultima_localizacao_at).getTime();
    if (Number.isFinite(t) && Date.now() - t > POSICAO_MAX_IDADE_MS) return false;
  }
  return true;
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // configuracao_loja.empresa_id aponta pra auth.users, não pra empresas — o
  // embed aninhado empresas(configuracao_loja(...)) não existe pro PostgREST
  // e derrubava a consulta inteira (todo pedido virava "não encontrado").
  // Por isso o telefone da loja vem numa consulta separada.
  const CAMPOS = `
      id, empresa_id, tracking_token, status, created_at, updated_at,
      cliente_nome, tipo_pedido,
      endereco_entrega, bairro, endereco_lat, endereco_lng,
      descricao_itens, observacoes,
      valor_pedido, valor_motoboy, forma_pagamento, troco_para,
      avaliacao_nota, avaliacao_comentario,
      empresa:empresas(nome)`;
  let { data, error } = await supabase
    .from("pedidos")
    .select(`${CAMPOS}, motoboy:motoboys(nome, telefone, latitude, longitude, ultima_localizacao_at)`)
    .eq("tracking_token", token)
    .maybeSingle();

  // Banco sem a coluna ultima_localizacao_at (42703): repete sem ela em vez de
  // derrubar a página pública de rastreio.
  if (error?.code === "42703") {
    ({ data, error } = await supabase
      .from("pedidos")
      .select(`${CAMPOS}, motoboy:motoboys(nome, telefone, latitude, longitude)`)
      .eq("tracking_token", token)
      .maybeSingle());
  }

  if (error) {
    console.error("Erro ao buscar pedido (rastreio):", error.code, error.message);
    return NextResponse.json({ error: "Erro ao buscar o pedido" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  const { data: cfg } = await supabase
    .from("configuracao_loja")
    .select("telefone_contato")
    .eq("empresa_id", data.empresa_id)
    .maybeSingle();

  // Foto da avaliação — coluna da schema_v74; sem ela fica null.
  let avaliacaoFotoUrl: string | null = null;
  if (data.avaliacao_nota != null) {
    const { data: av, error: avErr } = await supabase
      .from("pedidos")
      .select("avaliacao_foto_url")
      .eq("id", data.id)
      .maybeSingle();
    if (!avErr) avaliacaoFotoUrl = (av as { avaliacao_foto_url?: string | null } | null)?.avaliacao_foto_url ?? null;
  }

  const { empresa_id: _empresaId, motoboy: motoboyRaw, endereco_lat, endereco_lng, ...publico } = data;
  const empresa = Array.isArray(publico.empresa) ? publico.empresa[0] : publico.empresa;
  const mb = (Array.isArray(motoboyRaw) ? motoboyRaw[0] : motoboyRaw) as MotoboyRow | null;
  const status = String(publico.status);
  const isEntrega = publico.tipo_pedido !== "retirada";

  // Privacidade: o link de rastreio é público (quem tem o token vê). Dados do
  // motoboy só enquanto ele está atendendo ESTE pedido; posição GPS só enquanto
  // ele está a caminho (coleta/rota) e se a posição for recente. Depois de
  // entregue/cancelado não sai nada do motoboy.
  let motoboy: MotoboyPublico | null = null;
  if (mb && STATUS_MOSTRA_MOTOBOY.has(status)) {
    motoboy = { nome: mb.nome, telefone: mb.telefone ?? null, latitude: null, longitude: null, atualizado_em: null };
    if (isEntrega && STATUS_MOSTRA_POSICAO.has(status) && posicaoValida(mb)) {
      motoboy.latitude = mb.latitude;
      motoboy.longitude = mb.longitude;
      motoboy.atualizado_em = mb.ultima_localizacao_at ?? null;
    }
  }

  const pedido = {
    ...publico,
    // Destino só pra entrega ainda em andamento (é o endereço do próprio cliente).
    endereco_lat: isEntrega && !STATUS_FINAIS.has(status) ? endereco_lat ?? null : null,
    endereco_lng: isEntrega && !STATUS_FINAIS.has(status) ? endereco_lng ?? null : null,
    motoboy,
    avaliacao_foto_url: avaliacaoFotoUrl,
    empresa: empresa ? { ...empresa, configuracao_loja: { telefone_contato: cfg?.telefone_contato ?? null } } : null,
  };

  return NextResponse.json({ pedido }, {
    headers: { "Cache-Control": "no-store" },
  });
}

// Avaliação do cliente — só depois do pedido marcado 'entregue', só uma vez
// (não permite sobrescrever uma nota já enviada).
const ipHits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_HITS  = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_HITS) return false;
  entry.count++;
  return true;
}

// Foto da avaliação: vai para o mesmo bucket público de imagens (projeto
// Supabase separado, ver /api/upload), pasta avaliacoes/. Cliente criado sob
// demanda pra que a falta das variáveis não derrube o rastreio.
const BUCKET_IMAGENS = "produtos";
const FOTO_MAX_BYTES = 4 * 1024 * 1024;
const FOTO_TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function clienteImagens() {
  const url = process.env.IMAGES_SUPABASE_URL;
  const key = process.env.IMAGES_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  }

  const { token } = await params;
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  // Aceita JSON { nota, comentario } ou multipart com o campo "foto"
  let notaRaw: unknown = null;
  let comentarioRaw: unknown = null;
  let foto: File | null = null;
  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Envio inválido" }, { status: 400 });
    notaRaw = form.get("nota");
    comentarioRaw = form.get("comentario");
    const f = form.get("foto");
    if (f && typeof f !== "string" && f.size > 0) foto = f;
  } else {
    const body = await req.json().catch(() => null);
    notaRaw = body?.nota;
    comentarioRaw = body?.comentario;
  }

  const nota = Number(notaRaw);
  const comentario = typeof comentarioRaw === "string" ? comentarioRaw.trim().slice(0, 1000) : null;

  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return NextResponse.json({ error: "Nota precisa ser um número de 1 a 5" }, { status: 400 });
  }
  if (foto) {
    if (!FOTO_TIPOS[foto.type]) {
      return NextResponse.json({ error: "A foto precisa ser JPG, PNG ou WebP" }, { status: 400 });
    }
    if (foto.size > FOTO_MAX_BYTES) {
      return NextResponse.json({ error: "Foto muito grande (máx. 4 MB)" }, { status: 400 });
    }
  }

  const supabase = createAdminClient();

  // Com a schema_v74 o pedido tem avaliacao_foto_url/avaliado_em; sem ela
  // (42703) a avaliação segue funcionando, só sem foto.
  let temColunasV74 = true;
  let { data: pedido, error: findErr } = await supabase
    .from("pedidos")
    .select("id, empresa_id, status, avaliacao_nota, avaliacao_foto_url")
    .eq("tracking_token", token)
    .maybeSingle();
  if (findErr?.code === "42703") {
    temColunasV74 = false;
    ({ data: pedido, error: findErr } = await supabase
      .from("pedidos")
      .select("id, empresa_id, status, avaliacao_nota")
      .eq("tracking_token", token)
      .maybeSingle());
  }

  if (findErr || !pedido) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }
  if (pedido.status !== "entregue") {
    return NextResponse.json({ error: "Só dá pra avaliar depois que o pedido for entregue" }, { status: 400 });
  }
  if (pedido.avaliacao_nota !== null) {
    return NextResponse.json({ error: "Esse pedido já foi avaliado" }, { status: 409 });
  }

  // Upload da foto pelo servidor (só depois de validar o pedido)
  let fotoUrl: string | null = null;
  let fotoCaminho: string | null = null;
  let fotoIgnorada = false;
  const imagens = foto && temColunasV74 ? clienteImagens() : null;
  if (foto && imagens) {
    fotoCaminho = `avaliacoes/${pedido.empresa_id}/${pedido.id}-${randomUUID().slice(0, 8)}.${FOTO_TIPOS[foto.type]}`;
    const { error: upErr } = await imagens.storage.from(BUCKET_IMAGENS).upload(
      fotoCaminho, Buffer.from(await foto.arrayBuffer()), { contentType: foto.type, upsert: false },
    );
    if (upErr) {
      console.error("Erro no upload da foto da avaliação:", upErr.message);
      fotoCaminho = null;
      fotoIgnorada = true;
    } else {
      fotoUrl = imagens.storage.from(BUCKET_IMAGENS).getPublicUrl(fotoCaminho).data.publicUrl;
    }
  } else if (foto) {
    fotoIgnorada = true;
  }

  const agoraIso = new Date().toISOString();
  const base = {
    avaliacao_nota: nota,
    avaliacao_comentario: comentario || null,
    avaliacao_criada_em: agoraIso,
  };

  // Condicional (status entregue + ainda sem nota): duas abas enviando ao
  // mesmo tempo não conseguem avaliar duas vezes.
  const gravar = (campos: Record<string, unknown>) => supabase
    .from("pedidos")
    .update(campos)
    .eq("id", pedido.id)
    .eq("status", "entregue")
    .is("avaliacao_nota", null)
    .select("id");

  let { data: gravados, error: updateErr } = await gravar(
    temColunasV74 ? { ...base, avaliado_em: agoraIso, avaliacao_foto_url: fotoUrl } : base,
  );
  if (updateErr?.code === "42703") {
    if (fotoUrl) fotoIgnorada = true;
    fotoUrl = null;
    ({ data: gravados, error: updateErr } = await gravar(base));
  }

  const limparFoto = async () => {
    if (fotoCaminho && imagens) await imagens.storage.from(BUCKET_IMAGENS).remove([fotoCaminho]).then(() => {}, () => {});
  };

  if (updateErr) {
    await limparFoto();
    return NextResponse.json({ error: "Erro ao salvar avaliação" }, { status: 500 });
  }
  if (!gravados?.length) {
    await limparFoto();
    return NextResponse.json({ error: "Esse pedido já foi avaliado" }, { status: 409 });
  }
  if (!fotoUrl) await limparFoto();

  return NextResponse.json({ ok: true, foto_url: fotoUrl, foto_ignorada: fotoIgnorada });
}
