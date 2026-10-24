-- MIGRAÇÃO V74 — Avaliação com foto (página de rastreio /pedido/[token])
-- Idempotente: pode rodar mais de uma vez.
--
-- Já existiam (schema_v65): pedidos.avaliacao_nota (1-5),
-- pedidos.avaliacao_comentario e pedidos.avaliacao_criada_em.
-- Aqui entram a foto opcional e a data "avaliado_em" (usada para ordenar as
-- últimas avaliações na página da loja). A gravação é feita só pela rota
-- /api/pedido/[token] (service role), que valida o tracking_token, exige
-- status 'entregue' e permite uma única avaliação por pedido.
-- Sem esta migração o app continua funcionando: só não guarda/mostra foto.

alter table public.pedidos add column if not exists avaliacao_foto_url text;
alter table public.pedidos add column if not exists avaliado_em timestamptz;

-- Avaliações antigas: avaliado_em = avaliacao_criada_em
update public.pedidos
   set avaliado_em = avaliacao_criada_em
 where avaliado_em is null
   and avaliacao_criada_em is not null;

-- Só URL http(s) e de tamanho razoável
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pedidos_avaliacao_foto_url_check'
  ) then
    alter table public.pedidos add constraint pedidos_avaliacao_foto_url_check
      check (avaliacao_foto_url is null
             or (avaliacao_foto_url ~ '^https?://' and length(avaliacao_foto_url) <= 1000));
  end if;
end $$;

-- "Últimas avaliações" da loja: pedidos avaliados, mais recentes primeiro
create index if not exists pedidos_avaliados_empresa_idx
  on public.pedidos (empresa_id, avaliado_em desc)
  where avaliacao_nota is not null;
