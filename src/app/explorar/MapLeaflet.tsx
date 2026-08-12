"use client";
import { useEffect, useRef } from "react";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPreview: (l: any) => void;
}

function getInitial(nome: string) { return nome.trim().charAt(0).toUpperCase(); }
function formatTaxa(taxa: number | null) { return (!taxa || taxa === 0) ? "Grátis" : `R$ ${taxa.toFixed(2).replace(".", ",")}`; }

export default function MapLeaflet({ lojas, userLat, userLng, accent, onPreview }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<import("leaflet").Map | null>(null);
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const withCoords = lojas.filter(l => l.lat && l.lng);
    const centerLat  = userLat ?? withCoords[0]?.lat ?? -23.55;
    const centerLng  = userLng ?? withCoords[0]?.lng ?? -46.63;

    import("leaflet").then(L => {
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

      // Tiles escuros (Carto Dark — sem API key necessária)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright" style="color:#555">OSM</a> © <a href="https://carto.com/attributions" style="color:#555">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

      // Controle de zoom (canto inferior direito)
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Marcador do usuário
      if (userLat && userLng) {
        const userIcon = L.divIcon({
          className: "",
          html: `
            <div style="position:relative;width:20px;height:20px">
              <div style="position:absolute;inset:0;border-radius:50%;background:rgba(96,165,250,0.25);animation:mapPulse 1.8s ease-out infinite"></div>
              <div style="position:absolute;inset:3px;border-radius:50%;background:#60a5fa;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>
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
              border:2.5px solid ${aberto ? "rgba(255,255,255,0.9)" : "rgba(100,116,139,0.6)"};
              box-shadow:0 3px 12px rgba(0,0,0,0.5)${loja.destaque ? `,0 0 0 3px ${cor}50` : ""};
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
          <div style="background:#161616;border-radius:14px;padding:12px 14px;border:1px solid rgba(255,255,255,0.08);font-family:system-ui,sans-serif">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <div style="width:32px;height:32px;border-radius:10px;background:${cor};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#fff;flex-shrink:0;overflow:hidden">
                ${logo ? `<img src="${logo}" style="width:100%;height:100%;object-fit:cover;border-radius:10px" />` : getInitial(loja.nome)}
              </div>
              <div>
                <p style="color:#fff;font-weight:800;font-size:13px;margin:0;line-height:1.2">${loja.nome}</p>
                <p style="color:${aberto ? "#4ade80" : "#f87171"};font-size:11px;margin:0;font-weight:600">${aberto ? "● Aberto agora" : "● Fechado"}</p>
              </div>
            </div>
            <div style="display:flex;gap:6px;font-size:11px;color:#9ca3af;margin-bottom:10px">
              <span>⏱ ${tempo}</span>
              <span>·</span>
              <span style="color:${taxa === 0 ? "#4ade80" : "#9ca3af"}">🛵 ${formatTaxa(taxa)}</span>
            </div>
            <a href="/loja/${loja.slug}" style="display:block;text-align:center;background:${cor};color:#fff;padding:8px;border-radius:10px;font-weight:800;font-size:12px;text-decoration:none">
              Ver Cardápio →
            </a>
          </div>
        `);

        const marker = L.marker([loja.lat!, loja.lng!], { icon }).addTo(map);
        marker.bindPopup(popup);
        marker.on("click", () => {
          onPreviewRef.current(loja as Parameters<typeof onPreviewRef.current>[0]);
        });
      });

      // Se não há lojas com coords, mostrar aviso via div overlay
      if (withCoords.length === 0 && lojas.length > 0 && containerRef.current) {
        const badge = document.createElement("div");
        badge.style.cssText = "position:absolute;top:12px;right:12px;z-index:999;background:rgba(0,0,0,0.75);color:#9ca3af;padding:8px 12px;border-radius:10px;font-size:12px;backdrop-filter:blur(8px);pointer-events:none";
        badge.textContent = "Lojas sem coordenadas cadastradas";
        containerRef.current.style.position = "relative";
        containerRef.current.appendChild(badge);
      }
    });

    return () => {
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
        .map-tooltip { background:#161616!important;border:1px solid rgba(255,255,255,0.1)!important;color:#e5e7eb!important;font-size:12px!important;font-weight:600!important;padding:4px 10px!important;border-radius:8px!important;box-shadow:0 4px 16px rgba(0,0,0,0.4)!important }
        .map-tooltip::before { display:none!important }
        .leaflet-control-zoom a { background:#161616!important;color:#9ca3af!important;border-color:rgba(255,255,255,0.08)!important }
        .leaflet-control-zoom a:hover { background:#222!important;color:#fff!important }
        .leaflet-control-attribution { background:rgba(0,0,0,0.5)!important;color:#4b5563!important }
        .leaflet-control-attribution a { color:#6b7280!important }
      `}</style>
      <div ref={containerRef} style={{ height: 400, width: "100%", borderRadius: 24, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }} />
    </>
  );
}
