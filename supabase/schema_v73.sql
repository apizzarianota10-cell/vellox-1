-- schema_v73: conta do cliente final (quem pede comida pelo /explorar e pela loja)
-- Executar no Supabase SQL Editor. Idempotente: pode rodar mais de uma vez.
--
-- O Supabase Auth já é usado por EMPRESAS (empresas.id = auth.uid()) e por
-- MOTOBOYS (motoboys.auth_id = auth.uid()). O cliente é um terceiro tipo de
-- conta (user_metadata.tipo = 'cliente'), com tabela própria:
--   clientes.id = auth.uid()
-- O trigger handle_new_user() (schema_v44) só cria linha em empresas quando
-- tipo = 'empresa', então um cadastro de cliente não vira empresa. A linha em
-- clientes é criada pelo próprio app no primeiro acesso (insert com RLS).
--
-- Sem esta migration o app continua funcionando: a área "Minha conta" fica
-- escondida e o checkout grava o pedido sem cliente_id.

-- ── 1. clientes ────────────────────────────────────────────────────────────
create table if not exists public.clientes (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '' check (char_length(nome) <= 120),
  telefone   text not null default '' check (char_length(telefone) <= 30),
  email      text check (email is null or char_length(email) <= 254),
  created_at timestamptz not null default now()
);

alter table public.clientes enable row level security;

drop policy if exists "clientes_select_proprio" on public.clientes;
create policy "clientes_select_proprio" on public.clientes
  for select to authenticated
  using (id = auth.uid());

-- Só cria a própria linha, e nunca para uma conta que já é empresa ou motoboy
-- (as subconsultas respeitam a RLS dessas tabelas, que deixa cada conta ver
-- a própria linha).
drop policy if exists "clientes_insert_proprio" on public.clientes;
create policy "clientes_insert_proprio" on public.clientes
  for insert to authenticated
  with check (
    id = auth.uid()
    and not exists (select 1 from public.empresas e where e.id = auth.uid())
    and not exists (select 1 from public.motoboys m where m.auth_id = auth.uid())
  );

drop policy if exists "clientes_update_proprio" on public.clientes;
create policy "clientes_update_proprio" on public.clientes
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke all on public.clientes from anon;
grant select, insert, update on public.clientes to authenticated;

-- ── 2. cliente_enderecos ───────────────────────────────────────────────────
create table if not exists public.cliente_enderecos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  apelido     text not null default 'Casa' check (char_length(apelido) between 1 and 40),
  rua         text not null check (char_length(rua) between 1 and 200),
  numero      text not null default '' check (char_length(numero) <= 20),
  complemento text not null default '' check (char_length(complemento) <= 120),
  bairro      text not null default '' check (char_length(bairro) <= 120),
  cidade      text not null default '' check (char_length(cidade) <= 120),
  referencia  text not null default '' check (char_length(referencia) <= 200),
  principal   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_cliente_enderecos_cliente
  on public.cliente_enderecos (cliente_id, created_at);

-- No máximo um endereço principal por cliente
create unique index if not exists uq_cliente_enderecos_principal
  on public.cliente_enderecos (cliente_id) where principal;

alter table public.cliente_enderecos enable row level security;

drop policy if exists "cliente_enderecos_select_proprio" on public.cliente_enderecos;
create policy "cliente_enderecos_select_proprio" on public.cliente_enderecos
  for select to authenticated
  using (cliente_id = auth.uid());

-- Limite de 20 endereços por cliente (evita abuso)
drop policy if exists "cliente_enderecos_insert_proprio" on public.cliente_enderecos;
create policy "cliente_enderecos_insert_proprio" on public.cliente_enderecos
  for insert to authenticated
  with check (
    cliente_id = auth.uid()
    and (select count(*) from public.cliente_enderecos x where x.cliente_id = auth.uid()) < 20
  );

drop policy if exists "cliente_enderecos_update_proprio" on public.cliente_enderecos;
create policy "cliente_enderecos_update_proprio" on public.cliente_enderecos
  for update to authenticated
  using (cliente_id = auth.uid())
  with check (cliente_id = auth.uid());

drop policy if exists "cliente_enderecos_delete_proprio" on public.cliente_enderecos;
create policy "cliente_enderecos_delete_proprio" on public.cliente_enderecos
  for delete to authenticated
  using (cliente_id = auth.uid());

revoke all on public.cliente_enderecos from anon;
grant select, insert, update, delete on public.cliente_enderecos to authenticated;

-- ── 3. pedidos.cliente_id ──────────────────────────────────────────────────
-- Preenchido só pelo servidor (src/app/api/loja/pedido/route.ts, service role)
-- quando o checkout vem de um cliente logado. Pedidos antigos NÃO são
-- vinculados (o telefone não é verificado).
alter table public.pedidos
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

create index if not exists idx_pedidos_cliente
  on public.pedidos (cliente_id, created_at desc)
  where cliente_id is not null;

-- Cliente só LÊ os próprios pedidos (não há policy de insert/update/delete
-- para ele). Policies são permissivas (OR) — não muda nada para empresa e
-- motoboy. O app seleciona só as colunas que precisa.
drop policy if exists "pedidos_cliente_select" on public.pedidos;
create policy "pedidos_cliente_select" on public.pedidos
  for select to authenticated
  using (cliente_id is not null and cliente_id = auth.uid());
