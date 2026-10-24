// Loja de demonstração (schema_v66.sql — conta demo@appvellox.online,
// empresa "Restaurante Demo"). Ela precisa continuar ativa e com assinatura
// válida para o "modo demo" do painel funcionar, então não dá pra filtrar
// por ativo/assinatura: escondemos só das vitrines públicas (/explorar e
// APIs dele) pelo slug, que o trigger de slug gerou a partir do nome.
// A página /loja/restaurante-demo continua acessível por link direto.

export const DEMO_SLUGS = ["restaurante-demo"] as const;

export function isLojaDemo(slug: string | null | undefined): boolean {
  return !!slug && (DEMO_SLUGS as readonly string[]).includes(slug);
}
