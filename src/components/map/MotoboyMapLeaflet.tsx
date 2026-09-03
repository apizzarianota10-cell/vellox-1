"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { Map as LeafletMap, Marker, Polyline } from "leaflet";

const MOTOBOY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="64" viewBox="0 0 48 64">
  <circle cx="24" cy="24" r="21" fill="#f59e0b" stroke="white" stroke-width="3"/>
  <text x="24" y="33" text-anchor="middle" font-size="24" font-family="Apple Color Emoji,Segoe UI Emoji,sans-serif">🛵</text>
  <rect x="14" y="46" width="20" height="14" rx="4" fill="rgba(15,23,42,0.85)"/>
  <text x="24" y="57" text-anchor="middle" fill="white" font-size="9" font-weight="700" font-family="system-ui,sans-serif">Você</text>
</svg>`;

const DEST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
  <circle cx="18" cy="18" r="15" fill="#E4002B" stroke="white" stroke-width="3"/>
  <path d="M18 10c-3.87 0-7 3.13-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="white"/>
  <rect x="16.5" y="33" width="3" height="10" rx="1.5" fill="#E4002B"/>
</svg>`;

interface Props {
  coords: { lat: number; lng: number } | null;
  destLat?: number | null;
  destLng?: number | null;
  destAddress?: string;
  routeAddress?: string | null;
  pedidoId?: string | null;
  isDelivery: boolean;
}

async function fetchOSRMRoute(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): Promise<[number, number][]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const data = await res.json();
  const coords = data.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
  if (!coords) throw new Error("no route");
  return coords.map(([lng, lat]) => [lat, lng]);
}

export default function MotoboyMapLeaflet({ coords, destLat, destLng, pedidoId, isDelivery }: Props) {
  const mapDivRef     = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<LeafletMap | null>(null);
  const mbMarkerRef   = useRef<Marker | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);
  const polylineRef   = useRef<Polyline | null>(null);
  const lastPedidoRef = useRef<string | null>(null);
  const fittedRef     = useRef(false);

  /* ── Init map + cleanup on unmount ── */
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const centerLat = coords?.lat ?? -15.78;
    const centerLng = coords?.lng ?? -47.93;

    const map = L.map(mapDivRef.current, {
      center: [centerLat, centerLng],
      zoom: coords ? 15 : 5,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      if (mbMarkerRef.current)   { mbMarkerRef.current.remove();   mbMarkerRef.current   = null; }
      if (destMarkerRef.current) { destMarkerRef.current.remove(); destMarkerRef.current = null; }
      if (polylineRef.current)   { polylineRef.current.remove();   polylineRef.current   = null; }
      mapRef.current?.remove();
      mapRef.current      = null;
      fittedRef.current   = false;
      lastPedidoRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  /* ── Update motoboy marker position ── */
  useEffect(() => {
    if (!mapRef.current || !coords) return;
    const pos: [number, number] = [coords.lat, coords.lng];

    const icon = L.divIcon({
      html: MOTOBOY_SVG,
      className: "",
      iconSize: [48, 64],
      iconAnchor: [24, 54],
    });

    if (!mbMarkerRef.current) {
      mbMarkerRef.current = L.marker(pos, { icon, zIndexOffset: 200 }).addTo(mapRef.current);
    } else {
      mbMarkerRef.current.setLatLng(pos);
    }

    if (!fittedRef.current) {
      fittedRef.current = true;
      if (destLat && destLng) {
        mapRef.current.fitBounds([[coords.lat, coords.lng], [destLat, destLng]], { padding: [60, 60] });
      } else {
        mapRef.current.setView(pos, 15);
      }
    } else {
      mapRef.current.panTo(pos);
    }
  }, [coords, destLat, destLng]);

  /* ── Update destination marker ── */
  useEffect(() => {
    if (!mapRef.current) return;

    if (destLat != null && destLng != null) {
      const pos: [number, number] = [destLat, destLng];
      const icon = L.divIcon({
        html: DEST_SVG,
        className: "",
        iconSize: [36, 46],
        iconAnchor: [18, 46],
      });

      if (!destMarkerRef.current) {
        destMarkerRef.current = L.marker(pos, { icon, zIndexOffset: 150 }).addTo(mapRef.current);
      } else {
        destMarkerRef.current.setLatLng(pos);
      }
    } else if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
  }, [destLat, destLng]);

  /* ── Fetch route on delivery start ── */
  useEffect(() => {
    if (!isDelivery || !coords || !destLat || !destLng || !mapRef.current) {
      if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
      return;
    }
    if (pedidoId && pedidoId === lastPedidoRef.current) return;
    lastPedidoRef.current = pedidoId ?? null;

    let cancelled = false;

    fetchOSRMRoute(coords.lat, coords.lng, destLat, destLng)
      .then((latlngs) => {
        if (cancelled || !mapRef.current) return;
        if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
        polylineRef.current = L.polyline(latlngs, {
          color: "#60a5fa",
          weight: 4,
          opacity: 0.9,
        }).addTo(mapRef.current);
      })
      .catch(() => {
        if (cancelled || !mapRef.current || !coords) return;
        if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
        polylineRef.current = L.polyline(
          [[coords.lat, coords.lng], [destLat, destLng]],
          { color: "#60a5fa", weight: 4, opacity: 0.7, dashArray: "8,8" },
        ).addTo(mapRef.current);
      });

    return () => { cancelled = true; };
  }, [pedidoId, isDelivery, coords, destLat, destLng]);

  function zoomIn()  { mapRef.current?.setZoom((mapRef.current.getZoom() ?? 15) + 1); }
  function zoomOut() { mapRef.current?.setZoom((mapRef.current.getZoom() ?? 15) - 1); }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 1000, display: "flex", flexDirection: "column", gap: 4 }}>
        {[{ fn: zoomIn, label: "+" }, { fn: zoomOut, label: "−" }].map(({ fn, label }) => (
          <button key={label} onClick={fn}
            style={{
              width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
              color: "white", fontSize: 18, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{label}</button>
        ))}
      </div>
    </div>
  );
}
