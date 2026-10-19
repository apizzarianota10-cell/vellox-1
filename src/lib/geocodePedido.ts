// Geocodificação gratuita de pedidos (servidor) via Nominatim / OpenStreetMap.
//
// Por que não o Google: a chave do /api/geocode está negada (REQUEST_DENIED).
// Política de uso do Nominatim: User-Agent identificando a aplicação, no
// máximo ~1 requisição/segundo e cache dos resultados — tudo atendido aqui.
// Best-effort: qualquer falha só registra aviso, nunca quebra o pedido.
// Uso exclusivo no servidor (recebe o client service-role).
import type { SupabaseClient } from "@supabase/supabase-js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Vellox/1.0 (SaaS de delivery para restaurantes; geocodificacao de pedidos)";
const TIMEOUT_MS = 5000;
/** Resultado mais longe que isso da empresa é tratado como erro de geocodificação (outra cidade). */
const MAX_DIST_KM = 60;

type Coord = { lat: number; lng: number };

// ── Cache simples em memória (por instância serverless) ─────────────────
const CACHE_MAX = 500;
const cache = new Map<string, Coord | null>();
function cacheGet(k: string) { return cache.has(k) ? { hit: true, v: cache.get(k) ?? null } : { hit: false, v: null }; }
function cacheSet(k: string, v: Coord | null) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(k, v);
}

// ── Throttle: serializa chamadas com ≥1,1s de intervalo ─────────────────
let fila: Promise<unknown> = Promise.resolve();
let ultimaChamada = 0;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = fila.then(async () => {
    const espera = ultimaChamada + 1100 - Date.now();
    if (espera > 0) await new Promise(r => setTimeout(r, espera));
    ultimaChamada = Date.now();
    return fn();
  });
  fila = run.catch(() => undefined);
  return run;
}

export function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function nominatim(query: string, perto: Coord | null): Promise<Coord | null> {
  const key = `${query.toLowerCase()}|${perto ? `${perto.lat.toFixed(2)},${perto.lng.toFixed(2)}` : ""}`;
  const c = cacheGet(key);
  if (c.hit) return c.v;

  const params = new URLSearchParams({
    q: query, format: "jsonv2", limit: "1", countrycodes: "br", "accept-language": "pt-BR",
  });
  if (perto) {
    // Prioriza resultados perto da empresa (sem restringir: bounded=0)
    const d = 0.35;
    params.set("viewbox", `${perto.lng - d},${perto.lat + d},${perto.lng + d},${perto.lat - d}`);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await throttled(() => fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    }));
    if (!res.ok) {
      console.warn(`[geocode] Nominatim HTTP ${res.status}`);
      return null; // não cacheia erro transitório
    }
    const json = (await res.json()) as { lat?: string; lon?: string }[];
    const first = Array.isArray(json) ? json[0] : undefined;
    const coord = first?.lat && first?.lon ? { lat: Number(first.lat), lng: Number(first.lon) } : null;
    const valido = coord && Number.isFinite(coord.lat) && Number.isFinite(coord.lng) ? coord : null;
    cacheSet(key, valido);
    return valido;
  } catch (err) {
    console.warn("[geocode] falha no Nominatim:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Centro de uma cidade ("Palmares", "PE") — usado para centralizar o mapa do painel. */
export async function geocodificarCidade(cidade: string, uf: string): Promise<Coord | null> {
  return nominatim(`${cidade.trim()}, ${uf.trim()}, Brasil`, null);
}

/**
 * Geocodifica um endereço com o contexto (cidade/estado) da empresa.
 * Tenta do mais específico ao mais genérico. Descarta resultados longe demais.
 */
export async function geocodificarEndereco(
  endereco: string,
  ctx: { bairro?: string | null; cidade?: string | null; estado?: string | null; base?: Coord | null },
): Promise<Coord | null> {
  const limpo = endereco.replace(/\s+/g, " ").trim();
  if (!limpo || /retirada no local/i.test(limpo)) return null;

  const cidadeUF = [ctx.cidade, ctx.estado].filter(Boolean).join(", ");
  // Remove complemento depois de "-" (ex.: "Rua X, 10 - apto 3") para a 2ª tentativa
  const semComplemento = limpo.split(/\s[-–]\s/)[0];
  const jaTemCidade = ctx.cidade ? limpo.toLowerCase().includes(ctx.cidade.toLowerCase()) : false;
  const sufixo = jaTemCidade ? "Brasil" : [cidadeUF, "Brasil"].filter(Boolean).join(", ");

  const tentativas = [
    [limpo, ctx.bairro, sufixo],
    [semComplemento, sufixo],
  ]
    .map(parts => parts.filter(Boolean).join(", "))
    .filter((q, i, arr) => arr.indexOf(q) === i);

  for (const q of tentativas) {
    const r = await nominatim(q, ctx.base ?? null);
    if (!r) continue;
    if (ctx.base && haversineKm(ctx.base, r) > MAX_DIST_KM) {
      console.warn(`[geocode] resultado descartado (${haversineKm(ctx.base, r).toFixed(0)}km da empresa): ${q}`);
      continue;
    }
    return r;
  }
  return null;
}

type PedidoGeo = {
  id: string;
  empresa_id: string;
  tipo_pedido: string | null;
  endereco_entrega: string | null;
  route_address: string | null;
  bairro: string | null;
  endereco_lat: number | null;
  endereco_lng: number | null;
  distancia_km: number | null;
};

async function carregarEmpresa(admin: SupabaseClient, empresaId: string) {
  const r = await admin.from("empresas").select("lat, lng, cidade, estado").eq("id", empresaId).maybeSingle();
  if (!r.error) return r.data as { lat: number | null; lng: number | null; cidade: string | null; estado: string | null } | null;
  // Colunas cidade/estado ausentes (schema_v11 não aplicada): degrada para lat/lng
  const r2 = await admin.from("empresas").select("lat, lng").eq("id", empresaId).maybeSingle();
  return r2.data ? { ...(r2.data as { lat: number | null; lng: number | null }), cidade: null, estado: null } : null;
}

/**
 * Preenche endereco_lat/endereco_lng/distancia_km de um pedido.
 * `admin` deve ser o client service-role. Nunca lança exceção.
 */
export async function geocodificarPedido(admin: SupabaseClient, pedidoId: string): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const { data: ped, error } = await admin
      .from("pedidos")
      .select("id, empresa_id, tipo_pedido, endereco_entrega, route_address, bairro, endereco_lat, endereco_lng, distancia_km")
      .eq("id", pedidoId)
      .maybeSingle();
    if (error || !ped) return { ok: false, motivo: "pedido_nao_encontrado" };
    const p = ped as PedidoGeo;
    if (p.tipo_pedido === "retirada") return { ok: false, motivo: "retirada" };

    const emp = await carregarEmpresa(admin, p.empresa_id);
    const base = emp?.lat != null && emp?.lng != null ? { lat: Number(emp.lat), lng: Number(emp.lng) } : null;

    let coord: Coord | null = p.endereco_lat != null && p.endereco_lng != null
      ? { lat: Number(p.endereco_lat), lng: Number(p.endereco_lng) }
      : null;

    if (!coord) {
      const endereco = p.route_address || p.endereco_entrega || "";
      coord = await geocodificarEndereco(endereco, { bairro: p.bairro, cidade: emp?.cidade, estado: emp?.estado, base });
      // route_address às vezes não tem o número/bairro certo — tenta o endereço completo
      if (!coord && p.route_address && p.endereco_entrega && p.endereco_entrega !== p.route_address) {
        coord = await geocodificarEndereco(p.endereco_entrega, { bairro: p.bairro, cidade: emp?.cidade, estado: emp?.estado, base });
      }
    }
    if (!coord) return { ok: false, motivo: "endereco_nao_encontrado" };

    const update: Record<string, number> = {};
    if (p.endereco_lat == null || p.endereco_lng == null) {
      update.endereco_lat = coord.lat;
      update.endereco_lng = coord.lng;
    }
    if (p.distancia_km == null && base) {
      update.distancia_km = Math.round(haversineKm(base, coord) * 100) / 100;
    }
    if (Object.keys(update).length === 0) return { ok: true };

    const { error: upErr } = await admin.from("pedidos").update(update).eq("id", p.id);
    if (upErr) {
      console.warn("[geocode] falha ao salvar coordenadas do pedido:", upErr.message);
      return { ok: false, motivo: "erro_update" };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[geocode] erro inesperado:", err instanceof Error ? err.message : err);
    return { ok: false, motivo: "erro" };
  }
}
