"use client";

/**
 * Mapa de rastreamento ao vivo (painel /mapa).
 *
 * Usa Leaflet + tiles gratuitos sem chave (Esri cinza-escuro, com fallback
 * para OpenStreetMap — ver src/lib/mapTiles.ts). Antes usava Google Maps JS com NEXT_PUBLIC_GOOGLE_MAPS_KEY,
 * cuja chave está ausente/restrita (REQUEST_DENIED) — o mapa ficava em branco.
 * Rotas: OSRM público, com fallback para linha reta tracejada.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { Map as LeafletMap, Marker, Polyline, TileLayer, LatLngExpression } from "leaflet";
import { createClient } from "@/lib/supabase/client";
import type { Motoboy, Pedido } from "@/types";
import { TILE_ESCURO, TILE_OSM, type TileDef } from "@/lib/mapTiles";

/* ───────────────────────── helpers ───────────────────────── */

const ACTIVE_PEDIDO_STATUS = "em_rota_de_entrega";
const STALE_MS = 10 * 60 * 1000; // posição sem atualização há 10 min = "sem sinal"
const DEFAULT_CENTER: [number, number] = [-15.78, -47.93]; // Brasília

const TILE_PROVIDERS: TileDef[] = [TILE_ESCURO, TILE_OSM];

function escapeHtml(s: string | null | undefined) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function validCoord(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && typeof lng === "number"
    && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    && !(lat === 0 && lng === 0);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function isStale(mb: Motoboy) {
  if (!mb.ultima_localizacao_at) return false; // sem info: não marca como sem sinal
  const t = new Date(mb.ultima_localizacao_at).getTime();
  return Number.isFinite(t) && Date.now() - t > STALE_MS;
}

function tempoDesde(iso: string | null) {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(min) || min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
}

function motoboyColor(mb: Motoboy) {
  if (isStale(mb)) return "#6b7280";
  if (mb.status === "em_entrega") return "#f59e0b";
  if (mb.status === "disponivel") return "#22c55e";
  return "#6b7280";
}

function motoboyStatusLabel(mb: Motoboy) {
  if (mb.status === "em_entrega") return "🛵 Em entrega";
  if (mb.status === "disponivel") return "✓ Disponível";
  return "○ Offline";
}

function motoboyIcon(mb: Motoboy) {
  const color = motoboyColor(mb);
  const initial = escapeHtml((mb.nome || "?").trim().charAt(0).toUpperCase() || "?");
  const opacity = isStale(mb) ? 0.55 : 1;
  return L.divIcon({
    className: "",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52" style="opacity:${opacity};filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">
      <circle cx="22" cy="22" r="19" fill="${color}" stroke="white" stroke-width="3"/>
      <text x="22" y="29" text-anchor="middle" fill="white" font-size="17" font-weight="900" font-family="system-ui, sans-serif">${initial}</text>
      <path d="M16 40 L22 50 L28 40 Z" fill="${color}"/>
    </svg>`,
    iconSize: [44, 52],
    iconAnchor: [22, 50],
    popupAnchor: [0, -46],
  });
}

const DEST_ICON = () => L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">
    <circle cx="18" cy="18" r="15" fill="#E4002B" stroke="white" stroke-width="3"/>
    <path d="M18 10c-3.87 0-7 3.13-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="white"/>
    <rect x="16.5" y="33" width="3" height="10" rx="1.5" fill="#E4002B"/>
  </svg>`,
  iconSize: [36, 46],
  iconAnchor: [18, 46],
  popupAnchor: [0, -40],
});

const COMPANY_ICON = () => L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="44" viewBox="0 0 42 44" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">
    <circle cx="21" cy="21" r="19" fill="#A80021" stroke="white" stroke-width="3"/>
    <path d="M21 8 8 18.5h3.5V31h7v-6h5v6h7V18.5H34Z" fill="white"/>
  </svg>`,
  iconSize: [42, 44],
  iconAnchor: [21, 42],
  popupAnchor: [0, -38],
});

function motoboyPopup(mb: Motoboy) {
  const stale = isStale(mb);
  return `<div style="padding:10px 12px;font-family:system-ui;min-width:140px;">
    <p style="font-weight:800;font-size:14px;margin:0 0 4px;color:#0f172a;">${escapeHtml(mb.nome)}</p>
    <p style="font-size:11px;margin:0;font-weight:600;color:${motoboyColor(mb)};">${motoboyStatusLabel(mb)}</p>
    ${mb.ultima_localizacao_at
      ? `<p style="font-size:10px;margin:4px 0 0;color:#64748b;">${stale ? "Sem sinal — última posição " : "Atualizado "}${tempoDesde(mb.ultima_localizacao_at)}</p>`
      : ""}
  </div>`;
}

function pedidoPopup(p: Pedido) {
  return `<div style="padding:10px 12px;font-family:system-ui;min-width:160px;">
    <p style="font-weight:800;font-size:13px;margin:0 0 3px;color:#0f172a;">${escapeHtml(p.cliente_nome)}</p>
    <p style="font-size:11px;margin:0;color:#64748b;line-height:1.4;">${escapeHtml(p.endereco_entrega)}</p>
  </div>`;
}

async function fetchRoute(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<[number, number][] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
    if (!coords?.length) return null;
    return coords.map(([lng, lat]) => [lat, lng]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────────────────── component ───────────────────────── */

interface RouteCache { coords: [number, number][]; straight: boolean; fetchLat: number; fetchLng: number; motoboyId: string; }
interface PedidoLayers { marker: Marker; lines: Polyline[]; }

interface Props {
  motoboys: Motoboy[];
  pedidos: Pedido[];
  empresaId: string;
  empresaLat?: number | null;
  empresaLng?: number | null;
  empresaRaio?: number | null;
  cidadeCentro?: [number, number] | null;
  height?: string;
}

type LiveStatus = "conectando" | "ao_vivo" | "reconectando" | "sem_internet";

export default function TrackingMap({
  motoboys: initialMotoboys, pedidos: initialPedidos, empresaId,
  empresaLat, empresaLng, empresaRaio, cidadeCentro = null, height = "100%",
}: Props) {
  const mapDivRef      = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<LeafletMap | null>(null);
  const tileRef        = useRef<TileLayer | null>(null);
  const mbMarkersRef   = useRef<Map<string, Marker>>(new Map());
  const pedidoLayersRef = useRef<Map<string, PedidoLayers>>(new Map());
  const routeCacheRef  = useRef<Map<string, RouteCache>>(new Map());
  const routeRunRef    = useRef(0);
  const userMovedRef   = useRef(false);
  const fittedRef      = useRef(false);
  const companyRef     = useRef<[number, number] | null>(null);

  const [mapReady, setMapReady]   = useState(false);
  const [tileError, setTileError] = useState(false);
  const [mapError, setMapError]   = useState<string | null>(null);
  const [live, setLive]           = useState<LiveStatus>("conectando");
  const [motoboys, setMotoboys]   = useState<Motoboy[]>(initialMotoboys ?? []);
  const [pedidos,  setPedidos]    = useState<Pedido[]>(initialPedidos ?? []);

  /* ── Cidade escolhida depois do mapa aberto: recentraliza ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cidadeCentro || !validCoord(cidadeCentro[0], cidadeCentro[1])) return;
    map.setView(cidadeCentro, 13);
  }, [cidadeCentro?.[0], cidadeCentro?.[1], mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Init map (uma vez) ── */
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    // Centro inicial: localização salva da empresa → localStorage → 1º motoboy com GPS → Brasília
    let company: [number, number] | null = null;
    if (validCoord(empresaLat, empresaLng)) {
      company = [empresaLat as number, empresaLng as number];
    } else {
      try {
        const la = parseFloat(localStorage.getItem("empresa_lat") ?? "");
        const ln = parseFloat(localStorage.getItem("empresa_lng") ?? "");
        if (validCoord(la, ln)) company = [la, ln];
      } catch { /* localStorage indisponível */ }
    }
    companyRef.current = company;
    const firstMb = (initialMotoboys ?? []).find(m => validCoord(m.latitude, m.longitude));
    // A cidade escolhida pelo DDD vem primeiro: é a escolha explícita do dono.
    const cidadeOk = cidadeCentro && validCoord(cidadeCentro[0], cidadeCentro[1]) ? cidadeCentro : null;
    const center: [number, number] = cidadeOk ?? company ?? (firstMb ? [firstMb.latitude!, firstMb.longitude!] : DEFAULT_CENTER);
    const zoom = cidadeOk || company || firstMb ? 13 : 4;

    let map: LeafletMap;
    try {
      map = L.map(mapDivRef.current, { center, zoom, zoomControl: false, attributionControl: true });
    } catch (err) {
      console.error("[mapa] falha ao iniciar Leaflet", err);
      setMapError("Não foi possível iniciar o mapa neste navegador.");
      return;
    }
    map.attributionControl.setPrefix(false);
    mapRef.current = map;

    // Tiles com fallback automático
    let providerIdx = 0;
    let loaded = 0;
    let errors = 0;
    let labelsLayer: TileLayer | null = null;
    const addTiles = () => {
      const prov = TILE_PROVIDERS[providerIdx];
      const layer = L.tileLayer(prov.url, { ...prov.options });
      labelsLayer?.remove();
      labelsLayer = prov.labels ? L.tileLayer(prov.labels.url, { ...prov.labels.options }) : null;
      layer.on("tileload", () => { loaded++; setTileError(false); });
      layer.on("tileerror", () => {
        errors++;
        if (loaded === 0 && errors >= 6) {
          if (providerIdx < TILE_PROVIDERS.length - 1) {
            providerIdx++; loaded = 0; errors = 0;
            layer.remove();
            addTiles();
          } else {
            setTileError(true);
          }
        }
      });
      layer.addTo(map);
      labelsLayer?.addTo(map);
      tileRef.current = layer;
    };
    addTiles();

    if (company) {
      L.marker(company, { icon: COMPANY_ICON(), zIndexOffset: 100 })
        .bindPopup(`<div style="padding:10px 12px;font-family:system-ui;font-weight:700;font-size:13px;color:#0f172a;">Sua loja</div>`)
        .addTo(map);
      const raio = typeof empresaRaio === "number" && empresaRaio > 0 ? empresaRaio : 50;
      L.circle(company, {
        radius: raio, color: "#E4002B", opacity: 0.5, weight: 1.5,
        fillColor: "#E4002B", fillOpacity: 0.07,
      }).addTo(map);
    }

    // Interação do usuário desliga o auto-enquadramento
    map.on("dragstart", () => { userMovedRef.current = true; });
    const container = map.getContainer();
    const markMoved = () => { userMovedRef.current = true; };
    container.addEventListener("wheel", markMoved, { passive: true });
    container.addEventListener("touchstart", markMoved, { passive: true });

    // Corrige tamanho quando o container muda (mobile, rotação, sidebar)
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => { mapRef.current?.invalidateSize(); });
      ro.observe(container);
    }
    setTimeout(() => mapRef.current?.invalidateSize(), 200);

    setMapReady(true);

    const mbMarkers = mbMarkersRef.current;
    const pedidoLayers = pedidoLayersRef.current;
    return () => {
      ro?.disconnect();
      container.removeEventListener("wheel", markMoved);
      container.removeEventListener("touchstart", markMoved);
      routeRunRef.current++;
      mbMarkers.clear();
      pedidoLayers.clear();
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      fittedRef.current = false;
      setMapReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Busca completa (fallback quando o realtime cai) ── */
  const refetch = useCallback(async () => {
    const supabase = createClient();
    const [mbRes, pRes] = await Promise.all([
      supabase.from("motoboys").select("*").eq("empresa_id", empresaId),
      supabase.from("pedidos").select("*").eq("empresa_id", empresaId).in("status", [ACTIVE_PEDIDO_STATUS, "em_fila"]),
    ]);
    if (!mbRes.error && mbRes.data) setMotoboys(mbRes.data as Motoboy[]);
    if (!pRes.error && pRes.data) setPedidos(pRes.data as Pedido[]);
  }, [empresaId]);

  /* ── Realtime (nome de canal único por montagem: evita conflito no StrictMode/remount) ── */
  useEffect(() => {
    if (!empresaId) return;
    const supabase = createClient();
    const suffix = `${empresaId}-${Math.random().toString(36).slice(2, 8)}`;
    let mbOk = false, pOk = false;
    const update = () => setLive(mbOk && pOk ? "ao_vivo" : "reconectando");

    const ch1 = supabase.channel(`map-motoboys-${suffix}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "motoboys", filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as Partial<Motoboy>)?.id;
            if (oldId) setMotoboys(prev => prev.filter(m => m.id !== oldId));
            return;
          }
          const row = payload.new as Motoboy;
          if (!row?.id) return;
          setMotoboys(prev => prev.some(m => m.id === row.id)
            ? prev.map(m => m.id === row.id ? { ...m, ...row } : m)
            : [...prev, row]);
        })
      .subscribe((status) => { mbOk = status === "SUBSCRIBED"; update(); });

    const ch2 = supabase.channel(`map-pedidos-${suffix}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos", filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as Partial<Pedido>)?.id;
            if (oldId) setPedidos(prev => prev.filter(p => p.id !== oldId));
            return;
          }
          const row = payload.new as Pedido;
          if (!row?.id) return;
          setPedidos(prev => prev.some(p => p.id === row.id)
            ? prev.map(p => p.id === row.id ? { ...p, ...row } : p)
            : [...prev, row]);
        })
      .subscribe((status) => { pOk = status === "SUBSCRIBED"; update(); });

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [empresaId]);

  /* ── Conexão do navegador + polling de segurança ── */
  useEffect(() => {
    const onOffline = () => setLive("sem_internet");
    const onOnline  = () => { setLive("reconectando"); refetch().catch(() => {}); };
    const onVisible = () => { if (document.visibilityState === "visible") refetch().catch(() => {}); };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    if (typeof navigator !== "undefined" && navigator.onLine === false) setLive("sem_internet");
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  useEffect(() => {
    if (live === "ao_vivo") return;
    const id = setInterval(() => { refetch().catch(() => {}); }, 20000);
    return () => clearInterval(id);
  }, [live, refetch]);

  /* ── Enquadrar tudo ── */
  const fitAll = useCallback((force = false) => {
    const map = mapRef.current;
    if (!map) return;
    if (!force && (userMovedRef.current || fittedRef.current)) return;
    const pts: LatLngExpression[] = [];
    if (companyRef.current) pts.push(companyRef.current);
    motoboys.forEach(mb => {
      if (mb.status !== "offline" && validCoord(mb.latitude, mb.longitude)) pts.push([mb.latitude!, mb.longitude!]);
    });
    pedidos.forEach(p => {
      if (p.status === ACTIVE_PEDIDO_STATUS && validCoord(p.endereco_lat, p.endereco_lng)) pts.push([p.endereco_lat!, p.endereco_lng!]);
    });
    if (pts.length === 0) return;
    if (pts.length === 1) map.setView(pts[0], 15);
    else map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 16 });
    fittedRef.current = true;
  }, [motoboys, pedidos]);

  /* ── Marcadores dos motoboys (um por id, sem duplicar) ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const visible = new Map<string, Motoboy>();
    motoboys.forEach(mb => {
      if (mb.status !== "offline" && validCoord(mb.latitude, mb.longitude)) visible.set(mb.id, mb);
    });

    mbMarkersRef.current.forEach((marker, id) => {
      if (!visible.has(id)) { marker.remove(); mbMarkersRef.current.delete(id); }
    });

    visible.forEach((mb, id) => {
      const pos: [number, number] = [mb.latitude!, mb.longitude!];
      const existing = mbMarkersRef.current.get(id);
      if (existing) {
        existing.setLatLng(pos);
        existing.setIcon(motoboyIcon(mb));
        existing.setPopupContent(motoboyPopup(mb));
      } else {
        const marker = L.marker(pos, { icon: motoboyIcon(mb), zIndexOffset: 300 })
          .bindPopup(motoboyPopup(mb))
          .addTo(map);
        mbMarkersRef.current.set(id, marker);
      }
    });
  }, [motoboys, mapReady]);

  /* ── Destinos + rotas (protegido contra corrida: só a execução mais recente desenha) ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const run = ++routeRunRef.current;

    const active = pedidos.filter(p => p.status === ACTIVE_PEDIDO_STATUS && validCoord(p.endereco_lat, p.endereco_lng));
    const activeIds = new Set(active.map(p => p.id));

    pedidoLayersRef.current.forEach((layers, id) => {
      if (!activeIds.has(id)) {
        layers.marker.remove();
        layers.lines.forEach(l => l.remove());
        pedidoLayersRef.current.delete(id);
        routeCacheRef.current.delete(id);
      }
    });

    const drawLines = (p: Pedido, coords: [number, number][], straight: boolean) => {
      const layers = pedidoLayersRef.current.get(p.id);
      if (!layers || !mapRef.current) return;
      layers.lines.forEach(l => l.remove());
      layers.lines = straight
        ? [L.polyline(coords, { color: "#E4002B", weight: 3, opacity: 0.8, dashArray: "8,8" }).addTo(mapRef.current)]
        : [
            L.polyline(coords, { color: "#7f1d1d", weight: 7, opacity: 0.35 }).addTo(mapRef.current),
            L.polyline(coords, { color: "#E4002B", weight: 3.5, opacity: 0.9 }).addTo(mapRef.current),
          ];
    };

    const clearLines = (id: string) => {
      const layers = pedidoLayersRef.current.get(id);
      if (layers) { layers.lines.forEach(l => l.remove()); layers.lines = []; }
    };

    (async () => {
      for (const p of active) {
        if (run !== routeRunRef.current) return;
        const dest: [number, number] = [p.endereco_lat!, p.endereco_lng!];

        let layers = pedidoLayersRef.current.get(p.id);
        if (!layers) {
          const marker = L.marker(dest, { icon: DEST_ICON(), zIndexOffset: 200 }).bindPopup(pedidoPopup(p)).addTo(map);
          layers = { marker, lines: [] };
          pedidoLayersRef.current.set(p.id, layers);
        } else {
          layers.marker.setLatLng(dest);
          layers.marker.setPopupContent(pedidoPopup(p));
        }

        const mb = p.motoboy_id ? motoboys.find(m => m.id === p.motoboy_id) : undefined;
        if (!mb || mb.status === "offline" || !validCoord(mb.latitude, mb.longitude)) {
          clearLines(p.id);
          routeCacheRef.current.delete(p.id);
          continue;
        }

        const cached = routeCacheRef.current.get(p.id);
        const needsFetch = !cached || cached.motoboyId !== mb.id
          || haversineKm(cached.fetchLat, cached.fetchLng, mb.latitude!, mb.longitude!) > 0.15;

        if (!needsFetch && cached) {
          if (layers.lines.length === 0) drawLines(p, cached.coords, cached.straight);
          continue;
        }

        const route = await fetchRoute(mb.latitude!, mb.longitude!, dest[0], dest[1]);
        if (run !== routeRunRef.current) return;
        const coords: [number, number][] = route ?? [[mb.latitude!, mb.longitude!], dest];
        routeCacheRef.current.set(p.id, {
          coords, straight: !route, fetchLat: mb.latitude!, fetchLng: mb.longitude!, motoboyId: mb.id,
        });
        drawLines(p, coords, !route);
      }
    })();
  }, [pedidos, motoboys, mapReady]);

  /* ── Auto-enquadramento inicial ── */
  useEffect(() => { if (mapReady) fitAll(false); }, [mapReady, fitAll]);

  function zoomIn()  { userMovedRef.current = true; mapRef.current?.zoomIn(); }
  function zoomOut() { userMovedRef.current = true; mapRef.current?.zoomOut(); }
  function recenter() { userMovedRef.current = false; fitAll(true); }

  const comGps = motoboys.filter(mb => mb.status !== "offline" && validCoord(mb.latitude, mb.longitude)).length;

  const badge = {
    ao_vivo:      { color: "#4ade80", text: "Ao vivo" },
    conectando:   { color: "#fbbf24", text: "Conectando…" },
    reconectando: { color: "#fbbf24", text: "Reconectando…" },
    sem_internet: { color: "#f87171", text: "Sem internet" },
  }[live];

  const overlayBox: React.CSSProperties = {
    background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
    border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
  };

  return (
    <div style={{
      position: "relative", width: "100%", height, minHeight: 320,
      borderRadius: 16, overflow: "hidden", border: "1px solid #1a1a1a",
      background: "#0f0f12", isolation: "isolate",
    }}>
      <div ref={mapDivRef} style={{ width: "100%", height: "100%", background: "#0f0f12" }} />

      {/* Status da conexão */}
      <div style={{
        ...overlayBox, position: "absolute", top: 12, left: 12, zIndex: 1000,
        display: "flex", alignItems: "center", gap: 6, padding: "5px 10px",
        color: badge.color, fontSize: 12, fontWeight: 700,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%", background: badge.color, display: "inline-block",
          animation: live === "ao_vivo" ? "vellox-pulse 2s infinite" : undefined,
        }} />
        {badge.text}
      </div>

      {/* Controles */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 1000, display: "flex", flexDirection: "column", gap: 4 }}>
        {[
          { fn: zoomIn, label: "+", title: "Aproximar" },
          { fn: zoomOut, label: "−", title: "Afastar" },
          { fn: recenter, label: "◎", title: "Centralizar" },
        ].map(({ fn, label, title }) => (
          <button key={label} onClick={fn} title={title} aria-label={title} type="button"
            style={{
              ...overlayBox, width: 36, height: 36, borderRadius: 8,
              color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{label}</button>
        ))}
      </div>

      {/* Estado vazio: nenhum motoboy com GPS */}
      {mapReady && !mapError && comGps === 0 && (
        <div style={{
          ...overlayBox, position: "absolute", top: 56, left: "50%", transform: "translateX(-50%)", zIndex: 1000,
          padding: "8px 14px", color: "#cbd5e1", fontSize: 12, fontWeight: 600, textAlign: "center",
          maxWidth: "calc(100% - 32px)",
        }}>
          {motoboys.length === 0
            ? "Nenhum motoboy cadastrado ainda."
            : "Nenhum motoboy com GPS ativo no momento. A posição aparece quando o motoboy abre o app e fica online."}
        </div>
      )}

      {/* Erro de tiles / mapa */}
      {(tileError || mapError) && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: mapError ? "auto" : "none", padding: 16,
        }}>
          <div style={{ ...overlayBox, padding: "14px 18px", color: "#f1f5f9", fontSize: 13, textAlign: "center", maxWidth: 340, pointerEvents: "auto" }}>
            <p style={{ fontWeight: 700, margin: "0 0 6px" }}>Mapa indisponível</p>
            <p style={{ margin: "0 0 10px", color: "#94a3b8", fontSize: 12 }}>
              {mapError ?? "Não foi possível carregar as imagens do mapa. Verifique sua conexão com a internet."}
            </p>
            <button type="button" onClick={() => window.location.reload()}
              style={{ background: "#E4002B", color: "white", border: 0, borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Legenda */}
      <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 1000, display: "flex", gap: 6, flexWrap: "wrap", maxWidth: "calc(100% - 24px)" }}>
        {[
          { color: "#f59e0b", label: "Em entrega" },
          { color: "#22c55e", label: "Disponível" },
          { color: "#6b7280", label: "Sem sinal" },
          { color: "#E4002B", label: "Destino" },
        ].map(({ color, label }) => (
          <span key={label} style={{
            ...overlayBox, display: "flex", alignItems: "center", gap: 5,
            fontSize: 11, padding: "4px 9px", borderRadius: 8, fontWeight: 600, color: "#cbd5e1",
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
