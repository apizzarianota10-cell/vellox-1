"use client";

import dynamic from "next/dynamic";
import type { Motoboy, Pedido } from "@/types";

// Leaflet acessa `window` — só pode rodar no cliente.
const TrackingMap = dynamic(() => import("./TrackingMap"), {
  ssr: false,
  loading: () => (
    <div style={{
      width: "100%", height: "100%", minHeight: 320, borderRadius: 16,
      border: "1px solid #1a1a1a", background: "#0f0f12",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#64748b", fontSize: 13,
    }}>
      Carregando mapa…
    </div>
  ),
});

interface Props {
  motoboys: Motoboy[];
  pedidos: Pedido[];
  empresaId: string;
  empresaLat?: number | null;
  empresaLng?: number | null;
  empresaRaio?: number | null;
  height?: string;
}

export default function TrackingMapClient(props: Props) {
  return <TrackingMap {...props} />;
}
