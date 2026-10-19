-- schema_v67: controle de estoque por produto
-- Executar no Supabase SQL Editor (idempotente: pode rodar mais de uma vez)
--
-- Regras:
--  - Estoque é por PRODUTO (não por ingrediente). Só produtos com
--    controla_estoque = true são movimentados.
--  - Criar o pedido NÃO baixa estoque. A baixa acontece UMA vez, quando o
--    pedido chega em 'finalizado' — ou em qualquer status posterior
--    ('em_coleta', 'em_rota_de_entrega', 'entregue') se 'finalizado' foi pulado.
--    A coluna pedidos.estoque_baixado_em marca que a baixa já ocorreu.
--  - Pedido cancelado depois da baixa devolve as quantidades ao estoque.
--  - Estoque pode ficar negativo: nada bloqueia a venda, o painel só alerta.
--  - pedidos.itens é a cópia estruturada do que foi pedido:
--      [{ "produto_id": "<uuid>", "qtd": <int>, "nome": "<texto>" }]
--    Pedidos antigos (itens = null) nunca mexem no estoque.

-- ── 1. produtos ──────────────────────────────────────────────────────────────
alter table public.produtos
  add column if not exists controla_estoque boolean not null default false,
  add column if not exists estoque_qtd      integer not null default 0,
  add column if not exists estoque_minimo   integer;

-- ── 2. pedidos ───────────────────────────────────────────────────────────────
alter table public.pedidos
  add column if not exists itens              jsonb,
  add column if not exists estoque_baixado_em timestamptz;

-- ── 3. estoque_movimentos ────────────────────────────────────────────────────
-- A FK para pedidos é DEFERRABLE INITIALLY DEFERRED porque a baixa roda num
-- trigger BEFORE INSERT em pedidos: nesse momento a linha do pedido ainda não
-- existe, então a FK só pode ser conferida no commit.
create table if not exists public.estoque_movimentos (
  id          uuid        primary key default gen_random_uuid(),
  empresa_id  uuid        not null references public.empresas(id) on delete cascade,
  produto_id  uuid        not null references public.produtos(id) on delete cascade,
  pedido_id   uuid        references public.pedidos(id) on delete set null
                          deferrable initially deferred,
  tipo        text        not null check (tipo in ('entrada', 'ajuste', 'saida_pedido', 'devolucao_pedido')),
  quantidade  integer     not null,   -- delta com sinal (+entrada/devolução, -saída)
  saldo_apos  integer     not null,
  observacao  text,
  created_at  timestamptz not null default now()
);

create index if not exists estoque_movimentos_empresa_created_idx
  on public.estoque_movimentos (empresa_id, created_at desc);
create index if not exists estoque_movimentos_produto_created_idx
  on public.estoque_movimentos (produto_id, created_at desc);
create index if not exists estoque_movimentos_pedido_idx
  on public.estoque_movimentos (pedido_id)
  where pedido_id is not null;

alter table public.estoque_movimentos enable row level security;

-- Cliente só lê os próprios movimentos. Escrita só via trigger/RPC
-- (security definer) — sem policy de insert/update/delete.
drop policy if exists "estoque_movimentos_select_own" on public.estoque_movimentos;
create policy "estoque_movimentos_select_own" on public.estoque_movimentos
  for select to authenticated
  using (empresa_id = auth.uid());

revoke insert, update, delete on public.estoque_movimentos from anon, authenticated;
grant select on public.estoque_movimentos to authenticated;

-- ── 4. RPC: entrada / ajuste manual ──────────────────────────────────────────
create or replace function public.estoque_movimentar(
  p_produto_id  uuid,
  p_tipo        text,
  p_quantidade  integer,
  p_observacao  text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_saldo      integer;
  v_novo_saldo integer;
  v_delta      integer;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select empresa_id, estoque_qtd
    into v_empresa_id, v_saldo
    from public.produtos
   where id = p_produto_id
   for update;

  if not found or v_empresa_id <> auth.uid() then
    raise exception 'Produto não encontrado' using errcode = '42501';
  end if;

  if p_tipo = 'entrada' then
    if p_quantidade is null or p_quantidade <= 0 then
      raise exception 'A quantidade de entrada deve ser maior que zero';
    end if;
    v_delta      := p_quantidade;
    v_novo_saldo := v_saldo + p_quantidade;
  elsif p_tipo = 'ajuste' then
    if p_quantidade is null then
      raise exception 'Informe o novo saldo para o ajuste';
    end if;
    v_novo_saldo := p_quantidade;
    v_delta      := v_novo_saldo - v_saldo;
  else
    raise exception 'Tipo de movimento inválido: %', coalesce(p_tipo, 'null');
  end if;

  update public.produtos
     set estoque_qtd = v_novo_saldo
   where id = p_produto_id;

  insert into public.estoque_movimentos
    (empresa_id, produto_id, pedido_id, tipo, quantidade, saldo_apos, observacao)
  values
    (v_empresa_id, p_produto_id, null, p_tipo, v_delta, v_novo_saldo, nullif(trim(p_observacao), ''));

  return v_novo_saldo;
end;
$$;

revoke all on function public.estoque_movimentar(uuid, text, integer, text) from public;
grant execute on function public.estoque_movimentar(uuid, text, integer, text) to authenticated;

-- ── 5. Trigger: baixa / devolução automática pelo status do pedido ───────────
create or replace function public.pedidos_estoque_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item  record;
  v_saldo integer;
begin
  -- Baixa: primeiro status "pronto/saiu" com itens estruturados e sem baixa anterior
  if new.status in ('finalizado', 'em_coleta', 'em_rota_de_entrega', 'entregue')
     and new.estoque_baixado_em is null
     and new.itens is not null
     and jsonb_typeof(new.itens) = 'array'
  then
    begin
      -- Agrega produto_id duplicado e descarta item malformado antes de tocar no
      -- estoque. CASE garante que o cast só roda em valor já validado pelo regex.
      for v_item in
        select t.produto_id, sum(t.qtd) as qtd
          from (
            select case when (e->>'produto_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        then (e->>'produto_id')::uuid end as produto_id,
                   case when (e->>'qtd') ~ '^[0-9]{1,9}$'
                        then (e->>'qtd')::integer else 0 end as qtd
              from jsonb_array_elements(new.itens) e
             where jsonb_typeof(e) = 'object'
          ) t
         where t.produto_id is not null
           and t.qtd > 0
         group by t.produto_id
      loop
        begin
          -- UPDATE já trava a linha do produto; só produtos da mesma empresa com controle ligado
          update public.produtos
             set estoque_qtd = estoque_qtd - v_item.qtd
           where id = v_item.produto_id
             and empresa_id = new.empresa_id
             and controla_estoque = true
          returning estoque_qtd into v_saldo;

          if found then
            insert into public.estoque_movimentos
              (empresa_id, produto_id, pedido_id, tipo, quantidade, saldo_apos, observacao)
            values
              (new.empresa_id, v_item.produto_id, new.id, 'saida_pedido', -v_item.qtd, v_saldo,
               'Baixa automática — pedido ' || new.status);
          end if;
        exception when others then
          raise warning 'estoque: falha ao baixar produto % do pedido %: % (%)',
            v_item.produto_id, new.id, sqlerrm, sqlstate;
        end;
      end loop;

      -- Marca mesmo se nenhum item controla estoque: a decisão foi tomada uma vez só
      new.estoque_baixado_em := now();
    exception when others then
      raise warning 'estoque: falha ao processar itens do pedido %: % (%)', new.id, sqlerrm, sqlstate;
    end;

  -- Devolução: cancelou depois da baixa → devolve o que ainda está debitado
  elsif new.status = 'cancelado' and new.estoque_baixado_em is not null then
    begin
      -- Usa o saldo líquido dos movimentos do pedido (e não new.itens) para
      -- devolver exatamente o que foi baixado, mesmo se os itens foram editados depois
      for v_item in
        select m.produto_id, -sum(m.quantidade) as qtd
          from public.estoque_movimentos m
         where m.pedido_id = new.id
           and m.tipo in ('saida_pedido', 'devolucao_pedido')
         group by m.produto_id
        having sum(m.quantidade) < 0
      loop
        begin
          update public.produtos
             set estoque_qtd = estoque_qtd + v_item.qtd
           where id = v_item.produto_id
             and empresa_id = new.empresa_id
          returning estoque_qtd into v_saldo;

          if found then
            insert into public.estoque_movimentos
              (empresa_id, produto_id, pedido_id, tipo, quantidade, saldo_apos, observacao)
            values
              (new.empresa_id, v_item.produto_id, new.id, 'devolucao_pedido', v_item.qtd, v_saldo,
               'Devolução automática — pedido cancelado');
          end if;
        exception when others then
          raise warning 'estoque: falha ao devolver produto % do pedido %: % (%)',
            v_item.produto_id, new.id, sqlerrm, sqlstate;
        end;
      end loop;

      new.estoque_baixado_em := null;
    exception when others then
      raise warning 'estoque: falha ao devolver itens do pedido %: % (%)', new.id, sqlerrm, sqlstate;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pedidos_estoque_sync on public.pedidos;
create trigger trg_pedidos_estoque_sync
  before insert or update of status, itens on public.pedidos
  for each row execute function public.pedidos_estoque_sync();
