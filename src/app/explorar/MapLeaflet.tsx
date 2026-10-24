"use client";
import { useEffect, useRef } from "react";
import { TILE_CLARO } from "@/lib/mapTiles";

interface LojaMap {
  id: string; nome: string; slug: string;
  lat: number | null; lng: number | null;
  verificado: boolean; destaque: boolean;
  categoria: string | null; created_at: string;
  config: {
    empresa_id: string;
    cor_principal: string | null; logo_url: string | null; banner_url: string | null;
    aberto: boolean; taxa_entrega: number | null; tempo_entrega: string | null; descricao: string | null;
  } | null;
}

interface Props {
  lojas: LojaMap[];
  userLat: number | null;
  userLng: number | null;
  accent: string;
  /** Opcional: chamado ao tocar no marcador (o popup já tem o link da loja). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPreview?: (l: any) => void;
  height?: number | string;
}

function getInitial(nome: string) { return nome.trim().charAt(0).toUpperCase(); }
function formatTaxa(taxa: number | null) { return (!taxa || taxa === 0) ? "Grátis" : `R$ ${taxa.toFixed(2).replace(".", ",")}`; }

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export default function MapLeaflet({ lojas, userLat, userLng, accent, onPreview, height = 420 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<import("leaflet").Map | null>(null);
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const withCoords = lojas.filter(l => l.lat && l.lng);
    const centerLat  = userLat ?? withCoords[0]?.lat ?? -23.55;
    const centerLng  = userLng ?? withCoords[0]?.lng ?? -46.63;

    let cancelado = false;
    import("leaflet").then(L => {
      // StrictMode/desmontagem antes do import terminar: não cria mapa duplicado
      if (cancelado || !containerRef.current || mapRef.current) return;
      // Fix Leaflet default icon path issue with bundlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current!, {
        center: [centerLat, centerLng],
        zoom: userLat ? 14 : 12,
        zoomControl: false,
        attributionControl: true,
      });
      mapRef.current = map;

      // Tiles claros gratuitos sem chave (o CARTO passou a exigir chave) — ver mapTiles.ts
      L.tileLayer(TILE_CLARO.url, TILE_CLARO.options).addTo(map);
      if (TILE_CLARO.labels) L.tileLayer(TILE_CLARO.labels.url, TILE_CLARO.labels.options).addTo(map);

      // Controle de zoom (canto inferior direito)
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Marcador do usuário
      if (userLat && userLng) {
        const userIcon = L.divIcon({
          className: "",
          html: `
            <div style="position:relative;width:20px;height:20px">
              <div style="position:absolute;inset:0;border-radius:50%;background:rgba(37,99,235,0.25);animation:mapPulse 1.8s ease-out infinite"></div>
              <div style="position:absolute;inset:3px;border-radius:50%;background:#2563eb;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.25)"></div>
            </div>
            <style>@keyframes mapPulse{0%{transform:scale(1);opacity:.7}100%{transform:scale(3.5);opacity:0}}</style>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        L.marker([userLat, userLng], { icon: userIcon, zIndexOffset: 1000 })
          .addTo(map)
          .bindTooltip("Você está aqui", { permanent: false, className: "map-tooltip" });
      }

      // Marcadores das lojas
      withCoords.forEach(loja => {
        const cor    = loja.config?.cor_principal ?? accent;
        const aberto = loja.config?.aberto !== false;
        const taxa   = loja.config?.taxa_entrega ?? null;
        const tempo  = loja.config?.tempo_entrega ?? "30-45 min";
        const logo   = loja.config?.logo_url;

        const inner = logo
          ? `<img src="${logo}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:block" onerror="this.style.display='none';this.nextSibling.style.display='flex'" />
             <span style="display:none;width:28px;height:28px;align-items:center;justify-content:center;font-weight:900;font-size:13px;color:#fff">${getInitial(loja.nome)}</span>`
          : `<span style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;color:#fff">${getInitial(loja.nome)}</span>`;

        const icon = L.divIcon({
          className: "",
          html: `
            <div style="
              width:32px;height:32px;border-radius:50%;
              background:${cor};
              border:2.5px solid #fff;
              box-shadow:0 3px 12px rgba(16,12,8,0.28)${loja.destaque ? `,0 0 0 3px ${cor}50` : ""};
              opacity:${aberto ? 1 : 0.55};
              overflow:hidden;
              display:flex;align-items:center;justify-content:center;
              transition:transform .15s;
              cursor:pointer;
            ">${inner}</div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -18],
        });

        const popup = L.popup({
          closeButton: false,
          className: "map-popup",
          maxWidth: 200,
          minWidth: 180,
        }).setContent(`
          <div style="background:#fff;border-radius:16px;padding:12px 14px;border:1px solid rgba(22,19,15,0.08);box-shadow:0 12px 32px rgba(16,12,8,0.16);font-family:var(--font-inter),system-ui,sans-serif">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <div style="width:32px;height:32px;border-radius:10px;background:${cor};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#fff;flex-shrink:0;overflow:hidden">
                ${logo ? `<img src="${logo}" style="width:100%;height:100%;object-fit:cover;border-radius:10px" />` : getInitial(loja.nome)}
              </div>
              <div>
                <p style="color:#16130f;font-weight:800;font-size:13px;margin:0;line-height:1.2">${esc(loja.nome)}</p>
                <p style="color:${aberto ? "#0f7a43" : "#A80021"};font-size:11px;margin:0;font-weight:700">${aberto ? "Aberto agora" : "Fechado"}</p>
              </div>
            </div>
            <div style="display:flex;gap:6px;font-size:11px;color:#6f6a63;margin-bottom:10px">
              <span>${esc(tempo)}</span>
              <span>·</span>
              <span style="color:${!taxa ? "#0f7a43" : "#6f6a63"};font-weight:${!taxa ? 700 : 400}">${!taxa ? "Entrega grátis" : "Entrega " + formatTaxa(taxa)}</span>
            </div>
            <a href="/loja/${loja.slug}" style="display:block;text-align:center;background:${cor};color:#fff;padding:8px;border-radius:10px;font-weight:800;font-size:12px;text-decoration:none">
              Ver cardápio
            </a>
          </div>
        `);

        const marker = L.marker([loja.lat!, loja.lng!], { icon }).addTo(map);
        marker.bindPopup(popup);
        marker.on("click", () => {
          onPreviewRef.current?.(loja);
        });
      });

      // Se não há lojas com coords, mostrar aviso via div overlay
      if (withCoords.length === 0 && lojas.length > 0 && containerRef.current) {
        const badge = document.createElement("div");
        badge.style.cssText = "position:absolute;top:12px;left:12px;right:12px;z-index:999;background:rgba(255,255,255,0.94);color:#4a453f;padding:10px 12px;border-radius:12px;font-size:12px;font-weight:600;box-shadow:0 6px 18px rgba(16,12,8,0.12);pointer-events:none;text-align:center";
        badge.textContent = "As lojas desta lista ainda não cadastraram a localização no mapa";
        containerRef.current.style.position = "relative";
        containerRef.current.appendChild(badge);
      }
    });

    return () => {
      cancelado = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{`
        .map-popup .leaflet-popup-content-wrapper { background:transparent!important;border:none!important;box-shadow:none!important;padding:0!important }
        .map-popup .leaflet-popup-content { margin:0!important }
        .map-popup .leaflet-popup-tip-container { display:none }
        .map-tooltip { background:#fff!important;border:1px solid rgba(22,19,15,0.1)!important;color:#16130f!important;font-size:12px!important;font-weight:600!important;padding:4px 10px!important;border-radius:8px!important;box-shadow:0 4px 16px rgba(16,12,8,0.15)!important }
        .map-tooltip::before { display:none!important }
        .leaflet-control-zoom { border:none!important;box-shadow:0 4px 14px rgba(16,12,8,0.14)!important;border-radius:12px!important;overflow:hidden }
        .leaflet-control-zoom a { width:40px!important;height:40px!important;line-height:40px!important;background:#fff!important;color:#16130f!important;border-color:rgba(22,19,15,0.08)!important }
        .leaflet-control-zoom a:hover { background:#f7f7f5!important }
        .leaflet-control-attribution { background:rgba(255,255,255,0.85)!important;color:#6f6a63!important }
        .leaflet-control-attribution a { color:#4a453f!important }
      `}</style>
      <div ref={containerRef} role="region" aria-label="Mapa das lojas" style={{ height, width: "100%", borderRadius: 24, overflow: "hidden", border: "1px solid rgba(22,19,15,0.08)", background: "#eef0ea", boxShadow: "0 1px 2px rgba(16,12,8,0.04), 0 6px 16px rgba(16,12,8,0.06)" }} />
    </>
  );
}
