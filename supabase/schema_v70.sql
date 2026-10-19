-- ── Cidade do mapa do painel (pedida uma vez via DDD) ─────────────────────
-- O /mapa pergunta o DDD (e a cidade) na primeira vez e centraliza o mapa
-- ali. Fica salvo na empresa para não perguntar de novo em outro aparelho.
-- Sem esta migration, o painel guarda só no navegador (localStorage).
alter table public.empresas add column if not exists mapa_ddd    text;
alter table public.empresas add column if not exists mapa_cidade text;
alter table public.empresas add column if not exists mapa_lat    double precision;
alter table public.empresas add column if not exists mapa_lng    double precision;
