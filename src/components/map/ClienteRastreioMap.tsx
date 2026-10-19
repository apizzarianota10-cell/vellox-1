"use client";

/**
 * Mapinha da página pública de rastreio (/pedido/[token]).
 *
 * Mostra o motoboy e, se houver, o destino. Leaflet puro + tiles gratuitos sem
 * chave (CARTO Voyager, com fallback para OpenStreetMap). Carregar SEMPRE via
 * next/dynamic com ssr:false — Leaflet acessa `window`.
 *
 * A posição chega por props (o TrackingClient faz polling da API a cada 15s);
 * aqui só movemos o marcador suavemente, sem recriar o mapa.
 */

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { Map as LeafletMap, Marker, Polyline } from "leaflet";

const TILE_PROVIDERS = [
  {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    options: {
      subdomains: "abcd",
      maxZoom: 20,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
] as const;

const MOTOBOY_ICON = () => L.divIcon({
  className: "",
  html: `<div style="position:relative;width:46px;height:46px;">
    <span style="position:absolute;inset:0;border-radius:50%;background:rgba(228,0,43,.25);animation:vx-ping 1.8s ease-out infinite;"></span>
    <div style="position:absolute;inset:5px;border-radius:50%;background:#E4002B;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
    </div>
  </div>`,
  iconSize: [46, 46],
  iconAnchor: [23, 23],
});

const DEST_ICON = () => L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))">
    <path d="M17 2C9.27 2 3 8.27 3 16c0 10.5 14 26 14 26s14-15.5 14-26C31 8.27 24.73 2 17 2z" fill="#0f172a" stroke="white" stroke-width="2.5"/>
    <path d="M17 10l-6 5h1.8v6h3v-4h2.4v4h3v-6H23z" fill="white"/>
  </svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 43],
});

interface Props {
  motoboyLat: number;
  motoboyLng: number;
  destinoLat?: number | null;
  destinoLng?: number | null;
  height?: number;
}

function temDestino(lat?: number | null, lng?: number | null): boolean {
  return typeof lat === "number" && typeof lng === "number"
    && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

export default function ClienteRastreioMap({ motoboyLat, motoboyLng, destinoLat, destinoLng, height = 230 }: Props) {
  const divRef     = useRef<HTMLDivElement>(null);
  const mapRef     = useRef<LeafletMap | null>(null);
  const mbRef      = useRef<Marker | null>(null);
  const destRef    = useRef<Marker | null>(null);
  const lineRef    = useRef<Polyline | null>(null);
  const animRef    = useRef<number | null>(null);
  const userMoved  = useRef(false);
  const [falhou, setFalhou] = useState(false);

  // Cria o mapa uma vez
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    let map: LeafletMap;
    try {
      map = L.map(divRef.current, {
        center: [motoboyLat, motoboyLng], zoom: 15,
        zoomControl: false, attributionControl: true,
        // No celular, um dedo rola a página (não prende o scroll); pinça dá zoom.
        dragging: !L.Browser.mobile, scrollWheelZoom: false,
      });
    } catch {
      setFalhou(true);
      return;
    }
    map.attributionControl.setPrefix(false);
    mapRef.current = map;

    let idx = 0, loaded = 0, errors = 0;
    const addTiles = () => {
      const prov = TILE_PROVIDERS[idx];
      const layer = L.tileLayer(prov.url, { ...prov.options });
      layer.on("tileload", () => { loaded++; });
      layer.on("tileerror", () => {
        errors++;
        if (loaded === 0 && errors >= 6 && idx < TILE_PROVIDERS.length - 1) {
          idx++; loaded = 0; errors = 0;
          layer.remove();
          addTiles();
        }
      });
      layer.addTo(map);
    };
    addTiles();

    map.on("dragstart zoomstart", (e) => {
      // zoomstart também dispara no fitBounds programático; só conta gesto real
      if (e.type === "dragstart") userMoved.current = true;
    });
    map.getContainer().addEventListener("touchstart", (ev) => {
      if ((ev as TouchEvent).touches.length > 1) userMoved.current = true;
    }, { passive: true });

    mbRef.current = L.marker([motoboyLat, motoboyLng], { icon: MOTOBOY_ICON(), zIndexOffset: 500, keyboard: false }).addTo(map);
    setTimeout(() => mapRef.current?.invalidateSize(), 150);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      map.remove();
      mapRef.current = null;
      mbRef.current = null;
      destRef.current = null;
      lineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atualiza posição (animação curta) + destino + linha + enquadramento
  useEffect(() => {
    const map = mapRef.current;
    const mb = mbRef.current;
    if (!map || !mb) return;

    const destOk = temDestino(destinoLat, destinoLng);
    const dest: [number, number] | null = destOk ? [destinoLat as number, destinoLng as number] : null;

    if (dest) {
      if (!destRef.current) destRef.current = L.marker(dest, { icon: DEST_ICON(), zIndexOffset: 300, keyboard: false }).addTo(map);
      else destRef.current.setLatLng(dest);
    } else if (destRef.current) {
      destRef.current.remove();
      destRef.current = null;
    }

    const from = mb.getLatLng();
    const to = L.latLng(motoboyLat, motoboyLng);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const start = performance.now();
    const DUR = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DUR);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const cur = L.latLng(from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e);
      mb.setLatLng(cur);
      if (lineRef.current && dest) lineRef.current.setLatLngs([cur, dest]);
      if (t < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);

    if (dest) {
      if (!lineRef.current) {
        lineRef.current = L.polyline([from, dest], { color: "#E4002B", weight: 3, opacity: 0.75, dashArray: "6,8" }).addTo(map);
      }
    } else if (lineRef.current) {
      lineRef.current.remove();
      lineRef.current = null;
    }

    if (!userMoved.current) {
      if (dest) map.fitBounds(L.latLngBounds([to, dest]), { padding: [40, 40], maxZoom: 16, animate: true });
      else map.setView(to, Math.max(map.getZoom(), 15), { animate: true });
    }
  }, [motoboyLat, motoboyLng, destinoLat, destinoLng]);

  function recentralizar() {
    const map = mapRef.current;
    if (!map) return;
    userMoved.current = false;
    const to = L.latLng(motoboyLat, motoboyLng);
    if (temDestino(destinoLat, destinoLng)) {
      map.fitBounds(L.latLngBounds([to, [destinoLat as number, destinoLng as number]]), { padding: [40, 40], maxZoom: 16 });
    } else {
      map.setView(to, 15);
    }
  }

  if (falhou) return null;

  return (
    <div style={{ position: "relative", width: "100%", height, background: "#e5e7eb", isolation: "isolate" }}>
      <style>{`@keyframes vx-ping{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.5);opacity:0}}`}</style>
      <div ref={divRef} style={{ width: "100%", height: "100%" }} />
      <button
        type="button"
        onClick={recentralizar}
        aria-label="Centralizar no motoboy"
        title="Centralizar"
        style={{
          position: "absolute", right: 10, bottom: 22, zIndex: 1000,
          width: 36, height: 36, borderRadius: 10, border: "none",
          background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
          fontSize: 16, fontWeight: 800, color: "#0f172a", cursor: "pointer",
        }}
      >◎</button>
    </div>
  );
}
