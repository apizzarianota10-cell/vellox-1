"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer, TileLayer, Marker, Circle,
  useMapEvents, useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ── Child: handles map clicks ── */
function ClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onMapClick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

/* ── Child: flies to a new target when it changes ── */
function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  const prev = useRef<string>("");
  useEffect(() => {
    if (!target) return;
    const key = `${target[0]},${target[1]}`;
    if (key === prev.current) return;
    prev.current = key;
    map.flyTo(target, 16, { duration: 1.0 });
  }, [target, map]);
  return null;
}

/* ── Custom pin icon ── */
const pinIcon = L.divIcon({
  html: `
    <div style="display:flex;flex-direction:column;align-items:center;gap:0;">
      <div style="
        width:28px;height:28px;border-radius:50%;
        background:#E4002B;
        border:3px solid white;
        box-shadow:0 0 0 3px rgba(228,0,43,0.28),0 4px 10px rgba(0,0,0,0.38);
        filter:drop-shadow(0 2px 4px rgba(228,0,43,0.4));
      "></div>
      <div style="width:2.5px;height:6px;background:#E4002B;margin-top:-2px;border-radius:0 0 2px 2px;"></div>
    </div>
  `,
  className: "",
  iconSize: [28, 36],
  iconAnchor: [14, 36],
  popupAnchor: [0, -38],
});

/* ── Props ── */
export interface LocationMapPickerInnerProps {
  lat: number | null;
  lng: number | null;
  raio: number;
  initialLat?: number | null;
  initialLng?: number | null;
  onMapClick: (lat: number, lng: number) => void;
  flyTarget: [number, number] | null;
}

export default function LocationMapPickerInner({
  lat, lng, raio,
  initialLat, initialLng,
  onMapClick, flyTarget,
}: LocationMapPickerInnerProps) {
  const centerLat = lat ?? initialLat ?? -14.235;
  const centerLng = lng ?? initialLng ?? -51.925;
  const initialZoom = (initialLat && initialLng) ? 16 : 4;

  return (
    <MapContainer
      center={[centerLat, centerLng]}
      zoom={initialZoom}
      style={{ height: "100%", width: "100%", cursor: "crosshair" }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
        attribution='© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank">CARTO</a>'
      />

      <ClickHandler onMapClick={onMapClick} />
      <FlyTo target={flyTarget} />

      {lat != null && lng != null && (
        <>
          <Circle
            center={[lat, lng]}
            radius={raio}
            pathOptions={{
              color: "#E4002B",
              fillColor: "#E4002B",
              fillOpacity: 0.10,
              weight: 2,
              dashArray: "6, 4",
            }}
          />
          <Marker
            position={[lat, lng]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend(e) {
                const pos = e.target.getLatLng() as L.LatLng;
                onMapClick(pos.lat, pos.lng);
              },
            }}
          />
        </>
      )}
    </MapContainer>
  );
}
