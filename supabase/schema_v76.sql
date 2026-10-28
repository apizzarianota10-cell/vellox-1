-- MIGRAÇÃO V76 — Avisos (pop-up) do dono da plataforma para as lojas
-- Executar no Supabase SQL Editor. Idempotente (pode rodar mais de uma vez).
--
-- O painel /god funciona antes desta migração: a seção "Avisos" mostra o
-- aviso "rode schema_v76.sql" e o pop-up da loja (AvisoAdmin) não aparece.
--
-- Tipos: 'aviso' (mensagem livre) e 'banco_cheio' (alerta pré-pronto com os
-- números de uso do banco em `dados`).
-- Quem grava: só o servidor (/api/god/avisos, service role, depois de conferir
-- GOD_EMAIL). A loja só lê os próprios e só preenche visto_em/confirmado_em.

create table if not exists public.avisos_admin (
  id                uuid        primary key default gen_random_uuid(),
  empresa_id        uuid        not null references public.empresas(id) on delete cascade,
  tipo              text        not null default 'aviso' check (tipo in ('aviso', 'banco_cheio')),
  nivel             text        not null default 'info' check (nivel in ('info', 'atencao', 'urgente')),
  titulo            text        not null check (char_length(titulo) between 1 and 120),
  mensagem          text        not null default '' check (char_length(mensagem) <= 4000),
  acao_label        text        check (acao_label is null or char_length(acao_label) <= 60),
  acao_url          text        check (acao_url is null or (char_length(acao_url) <= 500 and (acao_url ~ '^https?://' or acao_url ~ '^/[^/]'))),
  exige_confirmacao boolean     not null default false,
  dados             jsonb,
  created_at        timestamptz not null default now(),
  visto_em          timestamptz,
  confirmado_em     timestamptz
);

create index if not exists avisos_admin_empresa_idx on public.avisos_admin (empresa_id, created_at desc);
create index if not exists avisos_admin_pendentes_idx on public.avisos_admin (empresa_id) where visto_em is null;

-- A loja não consegue apagar nem "desver": as datas só podem ser preenchidas
-- uma vez e sempre com o horário do banco. Confirmar implica visto.
create or replace function public.avisos_admin_guard()
returns trigger
language plpgsql
as $$
begin
  if old.visto_em is not null then
    new.visto_em := old.visto_em;
  elsif new.visto_em is not null or new.confirmado_em is not null then
    new.visto_em := now();
  end if;
  if old.confirmado_em is not null then
    new.confirmado_em := old.confirmado_em;
  elsif new.confirmado_em is not null then
    new.confirmado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists avisos_admin_guard on public.avisos_admin;
create trigger avisos_admin_guard
  before update on public.avisos_admin
  for each row execute function public.avisos_admin_guard();

alter table public.avisos_admin enable row level security;

-- God: service role (ignora RLS) pelas rotas /api/god/avisos.
drop policy if exists "avisos_admin_empresa_sel" on public.avisos_admin;
create policy "avisos_admin_empresa_sel" on public.avisos_admin
  for select
  using (empresa_id = auth.uid());

drop policy if exists "avisos_admin_empresa_upd" on public.avisos_admin;
create policy "avisos_admin_empresa_upd" on public.avisos_admin
  for update
  using (empresa_id = auth.uid())
  with check (empresa_id = auth.uid());

-- Privilégios por coluna: texto, nível, link etc. não podem ser editados pela loja
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.avisos_admin from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.avisos_admin from authenticated;
    grant select on public.avisos_admin to authenticated;
    grant update (visto_em, confirmado_em) on public.avisos_admin to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.avisos_admin to service_role;
  end if;
end $$;

-- Realtime: o pop-up aparece na hora, sem recarregar (o RLS filtra por loja)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'avisos_admin'
     ) then
    alter publication supabase_realtime add table public.avisos_admin;
  end if;
end $$;
