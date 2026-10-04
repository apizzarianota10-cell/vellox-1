-- Avaliação do cliente pós-entrega: nota 1-5 + comentário opcional, uma por
-- pedido, só liberada depois que o status vira 'entregue'.
alter table pedidos add column if not exists avaliacao_nota smallint;
alter table pedidos add column if not exists avaliacao_comentario text;
alter table pedidos add column if not exists avaliacao_criada_em timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pedidos_avaliacao_nota_check'
  ) then
    alter table pedidos add constraint pedidos_avaliacao_nota_check
      check (avaliacao_nota is null or (avaliacao_nota >= 1 and avaliacao_nota <= 5));
  end if;
end $$;

-- Resumo público (média + total) por empresa, pra vitrine (/explorar) — só
-- o agregado, nunca nome/telefone/comentário do cliente. security definer
-- de propósito: é a única forma de um visitante anônimo enxergar qualquer
-- coisa da tabela pedidos, e está restrito a esse agregado não-sensível.
create or replace function public.get_avaliacoes_publicas(p_empresa_ids uuid[])
returns table(empresa_id uuid, media numeric, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id, round(avg(avaliacao_nota)::numeric, 1) as media, count(*) as total
  from pedidos
  where empresa_id = any(p_empresa_ids)
    and avaliacao_nota is not null
  group by empresa_id;
$$;

grant execute on function public.get_avaliacoes_publicas(uuid[]) to anon;
grant execute on function public.get_avaliacoes_publicas(uuid[]) to authenticated;
