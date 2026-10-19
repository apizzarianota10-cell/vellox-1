// Tiles de mapa gratuitos e sem chave, usados por todos os mapas Leaflet.
//
// O CARTO (basemaps.cartocdn.com) passou a exigir chave: responde 200 com a
// imagem "API KEY REQUIRED" no lugar das ruas — por responder 200, nenhum
// fallback por erro disparava. Esri (ArcGIS Online) serve os mesmos estilos
// sem chave. Atenção: a URL do Esri é {z}/{y}/{x} (y antes de x).

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const ATTR_ESRI = 'Tiles © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>';
const ATTR_OSM = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export interface TileDef {
  url: string;
  options: { maxZoom: number; maxNativeZoom: number; attribution: string };
  /** Camada de nomes de ruas/bairros por cima da base (opcional). */
  labels?: { url: string; options: { maxZoom: number; maxNativeZoom: number } };
}

/** Escuro (painel): cinza-escuro com nomes por cima. */
export const TILE_ESCURO: TileDef = {
  url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
  options: { maxZoom: 20, maxNativeZoom: 16, attribution: ATTR_ESRI },
  labels: {
    url: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    options: { maxZoom: 20, maxNativeZoom: 16 },
  },
};

/** Claro (cliente/rastreio): mapa de ruas colorido. */
export const TILE_CLARO: TileDef = {
  url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
  options: { maxZoom: 20, maxNativeZoom: 19, attribution: ATTR_ESRI },
};

/** Reserva para quando o Esri falhar. */
export const TILE_OSM: TileDef = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  options: { maxZoom: 20, maxNativeZoom: 19, attribution: ATTR_OSM },
};
