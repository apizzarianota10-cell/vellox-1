// Tipos compartilhados da vitrine pública /explorar.

export interface LojaConfig {
  empresa_id: string;
  cor_principal: string | null;
  logo_url: string | null;
  banner_url: string | null;
  aberto: boolean;
  taxa_entrega: number | null;
  tempo_entrega: string | null;
  descricao: string | null;
  horario_funcionamento?: string | null;
}

export interface Loja {
  id: string; nome: string; slug: string;
  verificado: boolean; lat: number | null; lng: number | null;
  config: LojaConfig | null; destaque: boolean; categoria: string | null;
  created_at: string;
  avaliacaoMedia: number | null; avaliacaoTotal: number;
  /** Menor preço entre os produtos ativos (null se não houver). */
  precoMin?: number | null;
  /** Categorias de produto que dominam o cardápio (>= 30% dos itens). */
  tagsPrincipais?: string[];
  /** Todas as categorias de produto da loja (para a busca). */
  catsProdutos?: string[];
}

export interface Produto {
  id: string; nome: string; preco: number;
  imagem_url: string | null;
  empresa: { nome: string; slug: string };
}

export interface Banner {
  id: string; titulo: string; subtitulo: string | null;
  imagem_url: string | null; link_url: string | null; cor_fundo: string;
}

export interface Categoria { id: string; nome: string; emoji?: string }

export interface FlashSale {
  id: string; empresa_id: string; nome: string; descricao: string | null;
  preco_original: number | null; preco_flash: number;
  imagem_url: string | null; termina_em: string;
}

export interface HeroConfig {
  badge_text: string; hero_titulo: string; hero_destaque: string;
  hero_subtitulo: string; accent_color: string;
}

export type Ordem = "relevancia" | "rapidos" | "pedidos";
export type Tab = "explorar" | "pedidos" | "favoritos" | "perfil";
