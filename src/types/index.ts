export type UserTipo = "empresa" | "motoboy" | "god";
export type MotoboystStatus = "disponivel" | "em_entrega" | "offline";
export type PedidoStatus = "em_fila" | "em_preparo" | "finalizado" | "em_coleta" | "em_rota_de_entrega" | "aguardando_confirmacao" | "entregue" | "cancelado";
export type RouteStatus = "aguardando_saida" | "em_rota" | "parcialmente_entregue" | "concluida";
export type Plano = "basic" | "pro" | "enterprise" | "ktl";

export interface Empresa {
  id: string;
  nome: string;
  email: string;
  codigo: string;
  slug: string | null;
  cnpj: string | null;
  ativo: boolean;
  assinatura_ativa: boolean;
  assinatura_expira_em: string | null;
  kirvano_subscriber_id: string | null;
  created_at: string;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  raio_geofence: number | null;
  cidade: string | null;
  estado: string | null;
  pais: string | null;
  despacho_automatico: boolean;
  plano: Plano;
  verificado: boolean;
  senha_financeiro: string | null;
  mostrar_dashboard_menu: boolean;
}

export interface ProdutoMaisVendido {
  nome: string;
  qtd_total: number;
  qtd_hoje: number;
}

export interface Loja {
  id: string;
  empresa_id: string;
  nome: string;
  slug: string | null;
  descricao: string;
  cor: string;
  logo_url: string | null;
  ativo: boolean;
  ordem: number;
  created_at: string;
}

export interface Motoboy {
  id: string;
  empresa_id: string;
  auth_id: string | null;
  nome: string;
  telefone: string;
  email: string | null;
  codigo: string | null;
  foto_url: string | null;
  veiculo_tipo: string | null;
  area_atuacao: string | null;
  avaliacao_media: number | null;
  status: MotoboystStatus;
  latitude: number | null;
  longitude: number | null;
  ultima_localizacao_at: string | null;
  posicao_fila: number | null;
  created_at: string;
}

// Item estruturado do pedido (pedidos.itens, schema_v67) — base da baixa de estoque
export interface PedidoItem {
  produto_id: string;
  qtd: number;
  nome: string;
}

export interface Pedido {
  id: string;
  empresa_id: string;
  loja_id: string | null;
  motoboy_id: string | null;
  route_id: string | null;
  route_address: string | null;
  tipo_pedido: "entrega" | "retirada";
  cliente_nome: string;
  cliente_telefone: string;
  endereco_entrega: string;
  endereco_lat: number | null;
  endereco_lng: number | null;
  descricao_itens: string | null;
  valor_pedido: number;
  valor_motoboy: number;
  forma_pagamento: string | null;
  troco_para: number | null;
  status: PedidoStatus;
  observacoes: string | null;
  bairro: string | null;
  distancia_km: number | null;
  origem: "manual" | "catalogo" | null;
  tracking_token: string | null;
  created_at: string;
  updated_at: string;
  // Campos de impressão (schema_v49)
  printed_at: string | null;
  print_count: number;
  auto_printed: boolean;
  motoboy?: Motoboy;
  avaliacao_nota: number | null;
  avaliacao_comentario: string | null;
  // Estoque (schema_v67) — opcionais: pedidos legados não têm itens estruturados
  itens?: PedidoItem[] | null;
  estoque_baixado_em?: string | null;
  // Fechamento de caixa do motoboy (schema_v69) — null = ainda não entrou em acerto
  acerto_id?: string | null;
}

// Fechamento de caixa do motoboy (schema_v69)
export type MotoboyAcertoStatus = "pendente" | "pago";

export interface MotoboyAcerto {
  id: string;
  empresa_id: string;
  motoboy_id: string | null;
  motoboy_nome: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  qtd_entregas: number;
  total_taxas: number;
  total_dinheiro_recebido: number;
  total_troco: number;
  /** dinheiro recebido − taxas. > 0: motoboy devolve à loja; < 0: loja paga ao motoboy */
  valor_a_repassar: number;
  status: MotoboyAcertoStatus;
  pago_em: string | null;
  observacao: string | null;
  created_at: string;
}

export interface ConfiguracaoPrintAgent {
  empresa_id: string;
  ativo: boolean;
  impressora_nome: string | null;
  tamanho_papel: "58mm" | "80mm";
  agent_last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrintAgentStatus {
  online: boolean;
  printers: { name: string; isDefault: boolean }[];
  selectedPrinter: string | null;
  paperSize: "58mm" | "80mm";
  lastPrintedAt: string | null;
  lastError: string | null;
  version: string;
}

export interface DeliveryRoute {
  id: string;
  empresa_id: string;
  motoboy_id: string;
  status: RouteStatus;
  saiu_em: string | null;
  created_at: string;
  pedidos?: Pedido[];
  motoboy?: Motoboy;
}

export interface ProdutoVariacao {
  id: string;
  produto_id: string;
  nome: string;
  preco: number;
  max_sabores: number;
  ordem: number;
  ativo: boolean;
}

export interface CategoriaSabor {
  id: string;
  produto_id: string;
  nome: string;
  preco_adicional: number;
  ordem: number;
}

export interface CategoriaPrecoTamanho {
  id: string;
  categoria_preco_id: string;
  nome: string;
  preco: number;
  max_sabores: number;
  ordem: number;
}

export interface CategoriaPreco {
  id: string;
  empresa_id: string;
  nome: string;
  cor: string;
  ordem: number;
  created_at: string;
  tamanhos?: CategoriaPrecoTamanho[];
}

export interface ProdutoSabor {
  id: string;
  produto_id: string;
  nome: string;
  descricao: string;
  imagem_url: string | null;
  tipo_preco: "padrao" | "classico" | "premium";
  preco_adicional: number | null;
  categoria_sabor_id: string | null;
  ordem: number;
  ativo: boolean;
}

export interface ProdutoAdicional {
  id: string;
  produto_id: string;
  nome: string;
  preco: number;
  obrigatorio: boolean;
  ordem: number;
  ativo: boolean;
}

export interface Produto {
  id: string;
  empresa_id: string;
  loja_id: string | null;
  nome: string;
  descricao: string;
  preco: number;
  categoria: string;
  imagem_url: string | null;
  ativo: boolean;
  tipo: "simples" | "pizza";
  variantes_label: string | null;
  mesclar_sabores: boolean;
  sabores_vinculo_ids: string[];
  ordem: number;
  created_at: string;
  categoria_preco_id: string | null;
  /** Aparece no carrossel "Mais vendidos" da loja (schema_v71). */
  destaque?: boolean;
  // Estoque (schema_v67)
  controla_estoque?: boolean;
  estoque_qtd?: number;
  estoque_minimo?: number | null;
  produto_variacoes?: ProdutoVariacao[];
  produto_sabores?: ProdutoSabor[];
  produto_adicionais?: ProdutoAdicional[];
  produto_categorias_sabor?: CategoriaSabor[];
  categoria_preco?: CategoriaPreco;
}

export interface BairroTaxa {
  id: string;
  empresa_id: string;
  bairro: string;
  taxa: number;
  ativo: boolean;
  ordem: number;
  created_at: string;
}

export interface ConfiguracaoLoja {
  empresa_id: string;
  /** Ordem das categorias na loja (schema_v71) — null = alfabética. */
  ordem_categorias?: string[] | null;
  cor_principal: string;
  logo_url: string | null;
  banner_url: string | null;
  descricao: string;
  aberto: boolean;
  tempo_entrega: string;
  taxa_entrega: number;
  preco_padrao_sabor: number;
  updated_at: string;
  whatsapp_instance_id: string | null;
  whatsapp_token: string | null;
  telefone_contato: string | null;
  horario_funcionamento: string | null;
  modo_calculo_pizza: "maior_valor" | "proporcional" | null;
}

export interface Database {
  public: {
    Tables: {
      empresas: {
        Row: Empresa;
        Insert: Partial<Empresa>;
        Update: Partial<Empresa>;
      };
      motoboys: {
        Row: Motoboy;
        Insert: Omit<Motoboy, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<Motoboy, "id">>;
      };
      pedidos: {
        Row: Pedido;
        Insert: Omit<Pedido, "id" | "created_at" | "updated_at" | "motoboy"> & {
          id?: string; created_at?: string; updated_at?: string;
        };
        Update: Partial<Omit<Pedido, "id" | "motoboy">>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
