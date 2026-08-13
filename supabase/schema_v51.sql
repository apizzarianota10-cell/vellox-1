-- v51: opção por produto para combinar sabores com outros produtos (ex: pizzas meio a meio entre tamanhos)
-- Executar no Supabase SQL Editor
--
-- Antes, a loja pública misturava os sabores de TODOS os produtos tipo
-- "pizza" numa única lista ao escolher sabor — sem opção de desligar
-- isso por produto. Agora cada produto só mostra seus próprios sabores
-- por padrão; quem marcar mesclar_sabores = true entra no "pool" com
-- outros produtos que também tiverem a flag ligada.

alter table public.produtos
  add column if not exists mesclar_sabores boolean not null default false;
