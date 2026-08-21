-- v55: vínculo explícito de sabores entre produtos (substitui mesclar_sabores por categoria)
-- Executar no Supabase SQL Editor
--
-- O recurso "mesclar sabores" juntava numa lista compartilhada QUALQUER produto
-- que tivesse a flag mesclar_sabores ligada, sem separar por categoria — um
-- produto de padaria (ex: Pão de Alho) podia acabar puxando sabores de bebidas
-- só porque ambos tinham a flag ligada. Substituímos isso por um vínculo
-- explícito por produto: cada produto só compartilha sabores com os produtos
-- específicos que o admin escolher (nada automático por categoria).

alter table public.produtos
  add column if not exists sabores_vinculo_ids uuid[] not null default '{}'::uuid[];
