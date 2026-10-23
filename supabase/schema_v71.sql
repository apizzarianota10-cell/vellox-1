-- ── Ordem das categorias do catálogo ─────────────────────────────────────
-- O dono escolhe no painel (Catálogo → Ordenar) quais categorias aparecem
-- primeiro na loja. Categoria fora da lista vai para o fim (alfabética).
-- A ordem dos produtos dentro da categoria usa a coluna produtos.ordem.
alter table public.configuracao_loja add column if not exists ordem_categorias text[];

-- Produtos escolhidos pelo dono para o carrossel "Mais vendidos" da loja.
-- Nenhum marcado = a loja escolhe sozinha (como antes).
alter table public.produtos add column if not exists destaque boolean not null default false;
