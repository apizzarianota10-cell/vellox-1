-- ══════════════════════════════════════════
-- MIGRAÇÃO V2 — Rodar no SQL Editor do Supabase
-- ══════════════════════════════════════════

-- 1. Código curto da empresa (compartilhado com motoboys)
alter table public.empresas
  add column if not exists codigo varchar(6) unique;

-- Gerar códigos para empresas existentes
update public.empresas
set codigo = upper(substring(md5(id::text) from 1 for 6))
where codigo is null;

alter table public.empresas
  alter column codigo set not null;

-- 2. Auth no motoboy (vincula ao Supabase Auth)
alter table public.motoboys
  add column if not exists auth_id uuid references auth.users(id) on delete cascade,
  add column if not exists email text;

-- 3. Novos campos no pedido
alter table public.pedidos
  add column if not exists descricao_itens text,
  add column if not exists valor_pedido numeric(10,2) default 0,
  add column if not exists valor_motoboy numeric(10,2) default 0;

-- 4. Policy: motoboy vê e atualiza seus próprios dados
drop policy if exists "motoboy_see_own" on public.motoboys;
create policy "motoboy_see_own"
  on public.motoboys for select
  using (auth.uid() = auth_id OR empresa_id = auth.uid());

drop policy if exists "motoboys_empresa_crud" on public.motoboys;
create policy "motoboys_empresa_crud"
  on public.motoboys for all
  using (empresa_id = auth.uid() OR auth_id = auth.uid());

-- 5. Policy: motoboy vê seus próprios pedidos
drop policy if exists "pedidos_motoboy_select" on public.pedidos;
create policy "pedidos_motoboy_select"
  on public.pedidos for select
  using (
    empresa_id = auth.uid()
    OR motoboy_id IN (
      select id from public.motoboys where auth_id = auth.uid()
    )
  );

drop policy if exists "pedidos_empresa_crud" on public.pedidos;
create policy "pedidos_empresa_crud"
  on public.pedidos for all
  using (
    empresa_id = auth.uid()
    OR motoboy_id IN (
      select id from public.motoboys where auth_id = auth.uid()
    )
  );

-- 6. Atualiza trigger para gerar código e suportar tipo motoboy
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_tipo  text;
  v_nome  text;
  v_codigo text;
begin
  v_tipo := coalesce(new.raw_user_meta_data->>'tipo', 'empresa');
  v_nome := coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1));

  if v_tipo = 'empresa' then
    loop
      v_codigo := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
      exit when not exists (select 1 from public.empresas where codigo = v_codigo);
    end loop;

    insert into public.empresas(id, nome, email, codigo)
    values (new.id, v_nome, new.email, v_codigo)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Realtime já habilitado para pedidos e motoboys na v1
