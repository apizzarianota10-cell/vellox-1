-- schema_v68: correções do app do motoboy
-- Executar no Supabase SQL Editor. Idempotente (pode rodar mais de uma vez).
-- O app funciona antes de rodar este arquivo (degrada com fallback), mas:
--   1. sem a constraint nova, status 'em_coleta'/'aguardando_confirmacao' podem ser rejeitados;
--   2. sem get_base_motoboy(), o raio da geofence cai no padrão (200 m);
--   3. sem o trigger, motoboys.avaliacao_media fica parada (o app calcula na leitura).

-- ── 1. pedidos_status_check com TODOS os valores de PedidoStatus ─────────
-- schema_v9 criou a constraint sem 'em_coleta' e 'aguardando_confirmacao',
-- mas aceitar_pedido (v15/v17/v18) e o painel gravam 'em_coleta'.
-- Nenhuma migration posterior recriou essa constraint.
alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos
  add constraint pedidos_status_check
  check (status in (
    'em_fila', 'em_preparo', 'finalizado', 'em_coleta',
    'em_rota_de_entrega', 'aguardando_confirmacao', 'entregue', 'cancelado'
  )) not valid;

-- Valida as linhas antigas; se houver algum status legado fora da lista, a
-- constraint continua valendo para novas gravações e só avisa.
do $$
begin
  alter table public.pedidos validate constraint pedidos_status_check;
exception when check_violation then
  raise notice 'pedidos_status_check: existem pedidos antigos com status fora da lista — constraint ativa só para novas gravações (NOT VALID).';
end $$;

-- ── 2. Base (empresa) do motoboy: lat/lng + raio da geofence ─────────────
-- O motoboy não pode ler a tabela empresas (RLS só deixa a própria empresa).
-- A view empresas_publica (v50) tem lat/lng mas não tem raio_geofence.
create or replace function public.get_base_motoboy(p_empresa_id uuid default null)
returns table(empresa_id uuid, lat double precision, lng double precision, raio_geofence integer)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.lat::double precision, e.lng::double precision, e.raio_geofence::integer
  from public.empresas e
  join public.motoboys m on m.auth_id = auth.uid()
  where (p_empresa_id is null or e.id = p_empresa_id)
    and (
      e.id = m.empresa_id
      or exists (
        select 1 from public.motoboy_empresas me
        where me.motoboy_id = m.id and me.empresa_id = e.id and me.ativo = true
      )
    );
$$;

grant execute on function public.get_base_motoboy(uuid) to authenticated;

-- ── 3. Avaliação real do motoboy = média de pedidos.avaliacao_nota ──────
create or replace function public.recalcular_avaliacao_motoboy(p_motoboy_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.motoboys m
     set avaliacao_media = (
       select round(avg(p.avaliacao_nota)::numeric, 2)
         from public.pedidos p
        where p.motoboy_id = p_motoboy_id
          and p.avaliacao_nota is not null
     )
   where m.id = p_motoboy_id;
$$;

create or replace function public.trg_pedidos_avaliacao_motoboy_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.motoboy_id is not null and old.avaliacao_nota is not null then
      perform public.recalcular_avaliacao_motoboy(old.motoboy_id);
    end if;
    return old;
  end if;

  if new.motoboy_id is not null
     and (tg_op = 'INSERT'
          or new.avaliacao_nota is distinct from old.avaliacao_nota
          or new.motoboy_id     is distinct from old.motoboy_id) then
    perform public.recalcular_avaliacao_motoboy(new.motoboy_id);
  end if;

  if tg_op = 'UPDATE' and old.motoboy_id is not null
     and old.motoboy_id is distinct from new.motoboy_id
     and old.avaliacao_nota is not null then
    perform public.recalcular_avaliacao_motoboy(old.motoboy_id);
  end if;

  return new;
end $$;

drop trigger if exists trg_pedidos_avaliacao_motoboy on public.pedidos;
create trigger trg_pedidos_avaliacao_motoboy
after insert or update of avaliacao_nota, motoboy_id or delete on public.pedidos
for each row execute function public.trg_pedidos_avaliacao_motoboy_fn();

-- Backfill: média real para todos (sem avaliações → NULL, em vez do 5.00 fixo)
update public.motoboys m
   set avaliacao_media = sub.media
  from (
    select mb.id,
           (select round(avg(p.avaliacao_nota)::numeric, 2)
              from public.pedidos p
             where p.motoboy_id = mb.id and p.avaliacao_nota is not null) as media
      from public.motoboys mb
  ) sub
 where sub.id = m.id
   and m.avaliacao_media is distinct from sub.media;

alter table public.motoboys alter column avaliacao_media drop default;
