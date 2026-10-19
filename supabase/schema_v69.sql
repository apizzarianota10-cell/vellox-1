-- schema_v69: Fechamento de caixa do motoboy (acertos)
--
-- Idempotente: pode rodar mais de uma vez.
--
-- Conceitos:
--   total_taxas             = soma de pedidos.valor_motoboy (o que a loja deve ao motoboy)
--   total_dinheiro_recebido = soma de pedidos.valor_pedido pagos em "dinheiro"
--                             (o motoboy recebeu esse dinheiro do cliente e está com ele)
--   total_troco             = soma do troco entregue ao cliente (troco_para − valor_pedido,
--                             quando troco_para > valor_pedido). Informativo: o motoboy
--                             recebe troco_para e devolve o troco, ficando com valor_pedido.
--   valor_a_repassar        = total_dinheiro_recebido − total_taxas
--                             > 0  → motoboy devolve esse valor à loja
--                             < 0  → loja paga |valor| ao motoboy
--
-- Período: pedidos com status 'entregue', sem acerto_id, do motoboy, da empresa
-- logada, com created_at em [p_inicio, p_fim) (fim exclusivo).

-- ─────────────────────────────────────────────────────────────
-- 1. Tabela motoboy_acertos
-- ─────────────────────────────────────────────────────────────
create table if not exists public.motoboy_acertos (
  id                      uuid          primary key default gen_random_uuid(),
  empresa_id              uuid          not null references public.empresas(id) on delete cascade,
  motoboy_id              uuid          references public.motoboys(id) on delete set null,
  motoboy_nome            text,
  periodo_inicio          timestamptz   not null,
  periodo_fim             timestamptz   not null,
  qtd_entregas            integer       not null default 0,
  total_taxas             numeric(12,2) not null default 0,
  total_dinheiro_recebido numeric(12,2) not null default 0,
  total_troco             numeric(12,2) not null default 0,
  valor_a_repassar        numeric(12,2) not null default 0,
  status                  text          not null default 'pendente',
  pago_em                 timestamptz,
  observacao              text,
  created_at              timestamptz   not null default now()
);

-- Colunas adicionadas depois (caso a tabela já exista de uma versão anterior deste arquivo)
alter table public.motoboy_acertos add column if not exists motoboy_nome text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'motoboy_acertos_status_check'
      and conrelid = 'public.motoboy_acertos'::regclass
  ) then
    alter table public.motoboy_acertos
      add constraint motoboy_acertos_status_check check (status in ('pendente', 'pago'));
  end if;
end $$;

create index if not exists motoboy_acertos_empresa_idx
  on public.motoboy_acertos (empresa_id, created_at desc);
create index if not exists motoboy_acertos_motoboy_idx
  on public.motoboy_acertos (motoboy_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 2. pedidos.acerto_id — impede contar o mesmo pedido em dois acertos.
--    Excluir um acerto "libera" os pedidos (on delete set null).
-- ─────────────────────────────────────────────────────────────
alter table public.pedidos
  add column if not exists acerto_id uuid references public.motoboy_acertos(id) on delete set null;

create index if not exists pedidos_acerto_pendente_idx
  on public.pedidos (empresa_id, motoboy_id, created_at)
  where acerto_id is null and status = 'entregue';

-- Marcar acerto_id não deve alterar pedidos.updated_at (o painel usa updated_at
-- para "ganhos do dia"). Este trigger roda depois de set_pedidos_updated_at
-- (ordem alfabética) e restaura o updated_at quando SÓ o acerto_id mudou.
create or replace function public.pedidos_acerto_preserva_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'acerto_id' - 'updated_at') = (to_jsonb(old) - 'acerto_id' - 'updated_at') then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_pedidos_acerto_preserva_updated_at on public.pedidos;
create trigger zz_pedidos_acerto_preserva_updated_at
  before update on public.pedidos
  for each row
  when (new.acerto_id is distinct from old.acerto_id)
  execute function public.pedidos_acerto_preserva_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────
alter table public.motoboy_acertos enable row level security;

drop policy if exists "motoboy_acertos_empresa_all" on public.motoboy_acertos;
create policy "motoboy_acertos_empresa_all" on public.motoboy_acertos
  for all
  using (auth.uid() = empresa_id)
  with check (auth.uid() = empresa_id);

drop policy if exists "motoboy_acertos_motoboy_sel" on public.motoboy_acertos;
create policy "motoboy_acertos_motoboy_sel" on public.motoboy_acertos
  for select
  using (
    motoboy_id in (select m.id from public.motoboys m where m.auth_id = auth.uid())
  );

grant select, insert, update, delete on public.motoboy_acertos to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. RPC fechar_acerto_motoboy — calcula, cria o acerto e marca os pedidos (atômico)
-- ─────────────────────────────────────────────────────────────
create or replace function public.fechar_acerto_motoboy(
  p_motoboy_id uuid,
  p_inicio     timestamptz,
  p_fim        timestamptz,
  p_observacao text default null
)
returns public.motoboy_acertos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa  uuid := auth.uid();
  v_nome     text;
  v_acerto   public.motoboy_acertos;
  v_qtd      integer;
  v_taxas    numeric(12,2);
  v_dinheiro numeric(12,2);
  v_troco    numeric(12,2);
begin
  if v_empresa is null then
    raise exception 'Usuário não autenticado';
  end if;
  if p_motoboy_id is null or p_inicio is null or p_fim is null then
    raise exception 'Motoboy e período são obrigatórios';
  end if;
  if p_fim <= p_inicio then
    raise exception 'Período inválido: o fim deve ser depois do início';
  end if;

  -- O motoboy precisa pertencer à empresa (principal ou multi-empresa).
  -- "for update" serializa fechamentos simultâneos do mesmo motoboy.
  select m.nome into v_nome
  from public.motoboys m
  where m.id = p_motoboy_id
    and (
      m.empresa_id = v_empresa
      or exists (
        select 1 from public.motoboy_empresas me
        where me.motoboy_id = m.id and me.empresa_id = v_empresa
      )
    )
  for update;

  if not found then
    raise exception 'Motoboy não encontrado nesta empresa';
  end if;

  -- Trava os pedidos elegíveis
  perform 1
  from public.pedidos p
  where p.empresa_id = v_empresa
    and p.motoboy_id = p_motoboy_id
    and p.status = 'entregue'
    and p.acerto_id is null
    and p.created_at >= p_inicio
    and p.created_at <  p_fim
  for update;

  select
    count(*)::int,
    coalesce(sum(coalesce(p.valor_motoboy, 0)), 0),
    coalesce(sum(case when p.forma_pagamento = 'dinheiro' then coalesce(p.valor_pedido, 0) else 0 end), 0),
    coalesce(sum(case when p.forma_pagamento = 'dinheiro'
                       and p.troco_para is not null
                       and p.troco_para > coalesce(p.valor_pedido, 0)
                      then p.troco_para - coalesce(p.valor_pedido, 0) else 0 end), 0)
  into v_qtd, v_taxas, v_dinheiro, v_troco
  from public.pedidos p
  where p.empresa_id = v_empresa
    and p.motoboy_id = p_motoboy_id
    and p.status = 'entregue'
    and p.acerto_id is null
    and p.created_at >= p_inicio
    and p.created_at <  p_fim;

  if v_qtd = 0 then
    raise exception 'Nenhuma entrega pendente de acerto neste período';
  end if;

  insert into public.motoboy_acertos (
    empresa_id, motoboy_id, motoboy_nome, periodo_inicio, periodo_fim,
    qtd_entregas, total_taxas, total_dinheiro_recebido, total_troco,
    valor_a_repassar, status, observacao
  ) values (
    v_empresa, p_motoboy_id, v_nome, p_inicio, p_fim,
    v_qtd, v_taxas, v_dinheiro, v_troco,
    v_dinheiro - v_taxas, 'pendente', nullif(btrim(coalesce(p_observacao, '')), '')
  )
  returning * into v_acerto;

  update public.pedidos p
  set acerto_id = v_acerto.id
  where p.empresa_id = v_empresa
    and p.motoboy_id = p_motoboy_id
    and p.status = 'entregue'
    and p.acerto_id is null
    and p.created_at >= p_inicio
    and p.created_at <  p_fim;

  return v_acerto;
end;
$$;

revoke all on function public.fechar_acerto_motoboy(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.fechar_acerto_motoboy(uuid, timestamptz, timestamptz, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. RPC marcar_acerto_pago
-- ─────────────────────────────────────────────────────────────
create or replace function public.marcar_acerto_pago(p_acerto_id uuid)
returns public.motoboy_acertos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acerto public.motoboy_acertos;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  update public.motoboy_acertos a
  set status  = 'pago',
      pago_em = coalesce(a.pago_em, now())
  where a.id = p_acerto_id
    and a.empresa_id = auth.uid()
  returning * into v_acerto;

  if not found then
    raise exception 'Acerto não encontrado';
  end if;

  return v_acerto;
end;
$$;

revoke all on function public.marcar_acerto_pago(uuid) from public;
grant execute on function public.marcar_acerto_pago(uuid) to authenticated;
