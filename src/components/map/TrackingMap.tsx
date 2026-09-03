"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadGoogleMaps, fetchGoogleDirections, DARK_MAP_STYLE } from "@/lib/googleMaps";
import type { Motoboy, Pedido } from "@/types";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function motoboyColor(status: string) {
  if (status === "em_entrega") return "#f59e0b";
  if (status === "disponivel") return "#22c55e";
  return "#6b7280";
}

function makeMotoboyIcon(color: string, initial: string): google.maps.Icon {
  const firstName = initial;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="62" viewBox="0 0 44 62">
    <circle cx="22" cy="22" r="19" fill="${color}" stroke="white" stroke-width="3"/>
    <text x="22" y="29" text-anchor="middle" fill="white" font-size="17" font-weight="900" font-family="system-ui, sans-serif">${firstName}</text>
    <rect x="18" y="41" width="8" height="3" rx="1.5" fill="rgba(15,23,42,0.7)"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(44, 62),
    anchor: new google.maps.Point(22, 52),
  };
}

const DEST_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
  <circle cx="18" cy="18" r="15" fill="#E4002B" stroke="white" stroke-width="3"/>
  <path d="M18 10c-3.87 0-7 3.13-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="white"/>
  <rect x="16.5" y="33" width="3" height="10" rx="1.5" fill="#E4002B"/>
</svg>`;
function makeDestIcon(): google.maps.Icon {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(DEST_ICON_SVG)}`,
    scaledSize: new google.maps.Size(36, 46),
    anchor: new google.maps.Point(18, 46),
  };
}

const COMPANY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="44" viewBox="0 0 42 44">
  <circle cx="21" cy="21" r="19" fill="#A80021" stroke="white" stroke-width="3"/>
  <path d="M21 8 8 18.5h3.5V31h7v-6h5v6h7V18.5H34Z" fill="white"/>
</svg>`;
function makeCompanyIcon(): google.maps.Icon {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(COMPANY_ICON_SVG)}`,
    scaledSize: new google.maps.Size(42, 44),
    anchor: new google.maps.Point(21, 42),
  };
}

interface RouteCache { coords: { lat: number; lng: number }[]; fetchLat: number; fetchLng: number; }
interface Props { motoboys: Motoboy[]; pedidos: Pedido[]; empresaId: string; height?: string; }

export default function TrackingMap({ motoboys: initialMotoboys, pedidos: initialPedidos, empresaId, height = "100%" }: Props) {
  const mapDivRef   = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<google.maps.Map | null>(null);
  const mbMarkersRef  = useRef<Map<string, google.maps.Marker>>(new Map());
  const destMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const polylinesRef  = useRef<google.maps.Polyline[]>([]);
  const routeCacheRef = useRef<Map<string, RouteCache>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [motoboys, setMotoboys] = useState(initialMotoboys);
  const [pedidos,  setPedidos]  = useState(initialPedidos);

  /* ── Init map ── */
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => {
      if (cancelled || !mapDivRef.current) return;
      const empLat = parseFloat(localStorage.getItem("empresa_lat") ?? "-15.78");
      const empLng = parseFloat(localStorage.getItem("empresa_lng") ?? "-47.93");
      const raio   = parseInt(localStorage.getItem("empresa_raio") ?? "50", 10);

      const map = new google.maps.Map(mapDivRef.current, {
        center: { lat: empLat, lng: empLng },
        zoom: 13,
        styles: DARK_MAP_STYLE as google.maps.MapTypeStyle[],
        disableDefaultUI: true,
        gestureHandling: "greedy",
        clickableIcons: false,
      });
      mapRef.current = map;

      new google.maps.Marker({ position: { lat: empLat, lng: empLng }, map, icon: makeCompanyIcon(), zIndex: 10 });

      new google.maps.Circle({
        center: { lat: empLat, lng: empLng }, radius: raio, map,
        strokeColor: "#E4002B", strokeOpacity: 0.5, strokeWeight: 1.5,
        fillColor: "#E4002B", fillOpacity: 0.07,
      });

      setMapReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  /* ── Realtime subscriptions ── */
  useEffect(() => {
    const supabase = createClient();
    const ch1 = supabase.channel("map-motoboys")
      .on("postgres_changes", { event: "*", schema: "public", table: "motoboys", filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setMotoboys(prev => prev.filter(m => m.id !== (payload.old as Motoboy).id));
          } else {
            setMotoboys(prev => {
              const exists = prev.find(m => m.id === (payload.new as Motoboy).id);
              return exists
                ? prev.map(m => m.id === (payload.new as Motoboy).id ? { ...m, ...payload.new } : m)
                : [...prev, payload.new as Motoboy];
            });
          }
        }).subscribe();

    const ch2 = supabase.channel("map-pedidos")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos", filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setPedidos(prev => prev.filter(p => p.id !== (payload.old as Pedido).id));
          } else {
            setPedidos(prev => {
              const exists = prev.find(p => p.id === (payload.new as Pedido).id);
              return exists
                ? prev.map(p => p.id === (payload.new as Pedido).id ? { ...p, ...payload.new } : p)
                : [...prev, payload.new as Pedido];
            });
          }
        }).subscribe();

    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [empresaId]);

  /* ── Update motoboy markers ── */
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    const currentIds = new Set(motoboys.map(mb => mb.id));
    mbMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) { marker.setMap(null); mbMarkersRef.current.delete(id); }
    });

    motoboys.forEach(mb => {
      if (!mb.latitude || !mb.longitude) return;
      const pos   = { lat: mb.latitude, lng: mb.longitude };
      const color = motoboyColor(mb.status);
      const initial = mb.nome.charAt(0).toUpperCase();
      const icon  = makeMotoboyIcon(color, initial);

      const existing = mbMarkersRef.current.get(mb.id);
      if (existing) {
        existing.setPosition(pos);
        existing.setIcon(icon);
      } else {
        const marker = new google.maps.Marker({ position: pos, map: mapRef.current!, icon, zIndex: 20 });
        const iw = new google.maps.InfoWindow({
          content: `<div style="padding:10px 12px;font-family:system-ui;min-width:140px;">
            <p style="font-weight:800;font-size:14px;margin:0 0 4px;color:#0f172a;">${mb.nome}</p>
            <p style="font-size:11px;margin:0;font-weight:600;color:${color};">
              ${mb.status === "em_entrega" ? "🛵 Em entrega" : mb.status === "disponivel" ? "✓ Disponível" : "○ Offline"}
            </p>
          </div>`,
        });
        marker.addListener("click", () => iw.open(mapRef.current!, marker));
        mbMarkersRef.current.set(mb.id, marker);
      }
    });

    // Fit bounds to visible markers
    const pts: google.maps.LatLng[] = [];
    motoboys.forEach(mb => { if (mb.latitude && mb.longitude) pts.push(new google.maps.LatLng(mb.latitude, mb.longitude)); });
    pedidos.filter(p => p.status === "em_rota_de_entrega" && p.endereco_lat && p.endereco_lng)
      .forEach(p => pts.push(new google.maps.LatLng(p.endereco_lat!, p.endereco_lng!)));

    if (pts.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      pts.forEach(p => bounds.extend(p));
      mapRef.current.fitBounds(bounds, 70);
    } else if (pts.length === 1) {
      mapRef.current.panTo(pts[0]);
      mapRef.current.setZoom(15);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motoboys, mapReady]);

  /* ── Update destination markers + route polylines ── */
  const updateRoutesAndDests = useCallback(async () => {
    if (!mapRef.current || !mapReady) return;

    const active   = pedidos.filter(p => p.status === "em_rota_de_entrega" && p.endereco_lat && p.endereco_lng);
    const activeIds = new Set(active.map(p => p.id));

    destMarkersRef.current.forEach((m, id) => {
      if (!activeIds.has(id)) { m.setMap(null); destMarkersRef.current.delete(id); }
    });
    polylinesRef.current.forEach(pl => pl.setMap(null));
    polylinesRef.current = [];
    routeCacheRef.current.forEach((_, k) => { if (!activeIds.has(k)) routeCacheRef.current.delete(k); });

    for (const p of active) {
      const pos = { lat: p.endereco_lat!, lng: p.endereco_lng! };

      if (!destMarkersRef.current.has(p.id)) {
        const marker = new google.maps.Marker({ position: pos, map: mapRef.current!, icon: makeDestIcon(), zIndex: 15 });
        const iw = new google.maps.InfoWindow({
          content: `<div style="padding:10px 14px;font-family:system-ui;min-width:160px;">
            <p style="font-weight:800;font-size:13px;margin:0 0 3px;color:#0f172a;">${p.cliente_nome}</p>
            <p style="font-size:11px;margin:0;color:#64748b;line-height:1.4;">${p.endereco_entrega}</p>
          </div>`,
        });
        marker.addListener("click", () => iw.open(mapRef.current!, marker));
        destMarkersRef.current.set(p.id, marker);
      }

      if (!p.motoboy_id) continue;
      const mb = motoboys.find(m => m.id === p.motoboy_id);
      if (!mb?.latitude || !mb?.longitude) continue;

      const cached = routeCacheRef.current.get(p.id);
      const moved  = !cached || haversineKm(cached.fetchLat, cached.fetchLng, mb.latitude, mb.longitude) > 0.15;
      const coords = moved
        ? await fetchGoogleDirections(mb.latitude, mb.longitude, p.endereco_lat!, p.endereco_lng!)
          .then(c => { routeCacheRef.current.set(p.id, { coords: c, fetchLat: mb.latitude!, fetchLng: mb.longitude! }); return c; })
        : cached!.coords;

      polylinesRef.current.push(new google.maps.Polyline({
        path: coords, strokeColor: "#7f1d1d", strokeOpacity: 0.35, strokeWeight: 7, map: mapRef.current,
      }));
      polylinesRef.current.push(new google.maps.Polyline({
        path: coords, strokeColor: "#E4002B", strokeOpacity: 0.9, strokeWeight: 3.5, map: mapRef.current,
      }));
    }
  }, [motoboys, pedidos, mapReady]);

  useEffect(() => { updateRoutesAndDests(); }, [updateRoutesAndDests]);

  function zoomIn()  { if (mapRef.current) mapRef.current.setZoom((mapRef.current.getZoom() ?? 13) + 1); }
  function zoomOut() { if (mapRef.current) mapRef.current.setZoom((mapRef.current.getZoom() ?? 13) - 1); }

  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: 16, overflow: "hidden", border: "1px solid #1a1a1a" }}>
      <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />

      {/* Live badge */}
      <div style={{
        position: "absolute", top: 12, left: 12, zIndex: 10,
        display: "flex", alignItems: "center", gap: 6,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
        border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "5px 10px",
        color: "#4ade80", fontSize: 12, fontWeight: 700,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", animation: "vellox-pulse 2s infinite", display: "inline-block" }} />
        Ao vivo
      </div>

      {/* Zoom controls */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {[{ fn: zoomIn, label: "+" }, { fn: zoomOut, label: "−" }].map(({ fn, label }) => (
          <button key={label} onClick={fn}
            style={{
              width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
              color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{label}</button>
        ))}
      </div>

      {/* Legend */}
      <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { color: "#f59e0b", label: "Em entrega" },
          { color: "#22c55e", label: "Disponível" },
          { color: "#E4002B", label: "Destino" },
        ].map(({ color, label }) => (
          <span key={label} style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 11, padding: "4px 9px", borderRadius: 8, fontWeight: 600,
            background: "rgba(0,0,0,0.75)", color: "#cbd5e1",
            backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
