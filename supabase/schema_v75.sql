-- MIGRAÇÃO V75 — Painel God: uso de banco por loja + premiações
-- Executar no Supabase SQL Editor. Idempotente (pode rodar mais de uma vez).
--
-- O painel /god funciona antes desta migração: a tela "Uso de banco" mostra o
-- aviso "rode schema_v75.sql" e "Ranking & Premiações" não deixa enviar
-- premiações (a tabela ainda não existe).
--
-- O que entra:
--   1. Correção de segurança: as RPCs god_* existentes (v7/v28/v29) nunca
--      tiveram REVOKE. No Supabase toda função nova em public recebe EXECUTE
--      para anon/authenticated, então qualquer pessoa com a anon key podia
--      chamar god_toggle_assinatura e ativar a própria assinatura, ou
--      god_list_empresas e ver e-mails de todas as lojas. O app sempre chama
--      essas RPCs pelo service role (src/app/api/god/*), então revogar não
--      quebra nada.
--   2. god_uso_banco(): linhas e bytes estimados por empresa e por tabela,
--      tamanho do banco e do Storage deste projeto.
--   3. Tabela premiacoes + RLS (empresa/motoboy leem e marcam as próprias).
--
-- Verificação "god" no banco: igual às god_* existentes — só o service role
-- executa (o servidor Next só usa o service role depois de conferir
-- user.email === GOD_EMAIL). Além do REVOKE, god_uso_banco recusa qualquer
-- JWT com role diferente de service_role.

-- ─────────────────────────────────────────────────────────────
-- 1. Fecha as RPCs god_* existentes
-- ─────────────────────────────────────────────────────────────
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('god_list_empresas', 'god_list_motoboys', 'god_toggle_assinatura')
  loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2. god_uso_banco()
-- ─────────────────────────────────────────────────────────────
-- Retorno (jsonb):
-- {
--   "db_bytes":        tamanho do banco (pg_database_size),
--   "tabelas":         [{tabela, total_bytes (dados+índices+toast), linhas_estimadas}],
--   "linhas":          [{empresa_id, tabela, linhas, bytes}]   -- bytes = soma de pg_column_size(t.*)
--   "storage_total":   bytes no storage.objects deste projeto (null se não houver),
--   "storage_buckets": [{bucket, objetos, bytes}],
--   "storage":         [{empresa_id|null, objetos, bytes}]     -- null = não atribuído
-- }
-- pg_column_size(t.*) mede só os dados da linha (sem índices nem overhead de
-- página); o painel usa total_bytes de cada tabela para projetar uma
-- estimativa "com índices" proporcional.
create or replace function public.god_uso_banco()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text;
  v_linhas    jsonb := '[]'::jsonb;
  v_parte     jsonb;
  v_tabelas   jsonb;
  v_st_total  bigint;
  v_st_bucket jsonb;
  v_st_emp    jsonb;
  r           record;
  v_sql       text;
begin
  -- Mesmo critério das god_*: só service role (ou conexão direta, sem JWT)
  begin
    v_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    );
  exception when others then
    v_role := null;
  end;
  if v_role is not null and v_role <> 'service_role' then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  -- tabela | expressão que leva à empresa | join extra
  for r in
    select * from (values
      ('empresas',                  't.id',          ''),
      ('pedidos',                   't.empresa_id',  ''),
      ('produtos',                  't.empresa_id',  ''),
      ('produto_variacoes',         'p.empresa_id',  'join public.produtos p on p.id = t.produto_id'),
      ('produto_sabores',           'p.empresa_id',  'join public.produtos p on p.id = t.produto_id'),
      ('produto_adicionais',        'p.empresa_id',  'join public.produtos p on p.id = t.produto_id'),
      ('produto_categorias_sabor',  'p.empresa_id',  'join public.produtos p on p.id = t.produto_id'),
      ('categorias_preco',          't.empresa_id',  ''),
      ('categorias_preco_tamanhos', 'c.empresa_id',  'join public.categorias_preco c on c.id = t.categoria_preco_id'),
      ('bairros_taxa',              't.empresa_id',  ''),
      ('motoboys',                  't.empresa_id',  ''),
      ('motoboy_empresas',          't.empresa_id',  ''),
      ('motoboy_acertos',           't.empresa_id',  ''),
      ('convites',                  't.empresa_id',  ''),
      ('delivery_routes',           't.empresa_id',  ''),
      ('estoque_movimentos',        't.empresa_id',  ''),
      ('mensagens',                 't.empresa_id',  ''),
      ('logs_auditoria',            't.empresa_id',  ''),
      ('configuracao_loja',         't.empresa_id',  ''),
      ('configuracoes_print_agent', 't.empresa_id',  ''),
      ('lojas',                     't.empresa_id',  ''),
      ('flash_sales',               't.empresa_id',  ''),
      ('explorar_extras',           't.empresa_id',  ''),
      ('premiacoes',                't.empresa_id',  '')
    ) as x(tabela, chave, junta)
  loop
    -- Tabela (e a de junção) precisam existir; algumas foram criadas fora das migrations
    continue when to_regclass('public.' || r.tabela) is null;
    continue when r.junta like '%public.produtos%'         and to_regclass('public.produtos') is null;
    continue when r.junta like '%public.categorias_preco %' and to_regclass('public.categorias_preco') is null;
    -- Coluna usada como chave precisa existir
    continue when r.chave like 't.%' and not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = r.tabela
         and column_name = substr(r.chave, 3)
    );

    v_sql := format(
      'select coalesce(jsonb_agg(jsonb_build_object(''empresa_id'', k, ''tabela'', %L, ''linhas'', c, ''bytes'', b)), ''[]''::jsonb)
         from (select %s as k, count(*) as c, coalesce(sum(pg_column_size(t.*)), 0)::bigint as b
                 from public.%I t %s
                where %s is not null
                group by 1) s',
      r.tabela, r.chave, r.tabela, r.junta, r.chave);
    begin
      execute v_sql into v_parte;
      v_linhas := v_linhas || v_parte;
    exception when others then
      -- tabela com estrutura inesperada: ignora em vez de derrubar o relatório
      null;
    end;
  end loop;

  -- Clientes (contas globais, compartilhadas entre lojas): só a contagem de
  -- clientes distintos com pedido em cada loja. bytes = 0 para não somar duas vezes.
  if to_regclass('public.clientes') is not null and exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'pedidos' and column_name = 'cliente_id'
  ) then
    begin
      execute $q$
        select coalesce(jsonb_agg(jsonb_build_object('empresa_id', k, 'tabela', 'clientes (compartilhado)', 'linhas', c, 'bytes', 0)), '[]'::jsonb)
          from (select empresa_id as k, count(distinct cliente_id) as c
                  from public.pedidos where cliente_id is not null group by 1) s
      $q$ into v_parte;
      v_linhas := v_linhas || v_parte;
    exception when others then null;
    end;
  end if;

  -- Tamanho total de cada tabela do schema public
  select coalesce(jsonb_agg(jsonb_build_object(
           'tabela', c.relname,
           'total_bytes', pg_total_relation_size(c.oid),
           'linhas_estimadas', greatest(c.reltuples, 0)::bigint)
         order by pg_total_relation_size(c.oid) desc), '[]'::jsonb)
    into v_tabelas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p');

  -- Storage deste projeto (as imagens novas vão para outro projeto Supabase,
  -- ver /api/upload — essas o painel soma pela API de Storage).
  if to_regclass('storage.objects') is not null then
    begin
      execute $q$
        select coalesce(sum(coalesce((metadata ->> 'size')::bigint, 0)), 0)::bigint
          from storage.objects
      $q$ into v_st_total;

      execute $q$
        select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'objetos', n, 'bytes', b)), '[]'::jsonb)
          from (select bucket_id, count(*) as n,
                       coalesce(sum(coalesce((metadata ->> 'size')::bigint, 0)), 0)::bigint as b
                  from storage.objects group by 1) s
      $q$ into v_st_bucket;

      -- Atribuição: dono do upload é a própria empresa (auth.uid = empresas.id),
      -- ou um motoboy (vai para a empresa principal dele), ou o caminho começa
      -- com o id da empresa (1º ou 2º segmento, ex.: avaliacoes/<empresa_id>/...).
      -- O resto fica como não atribuído (empresa_id null).
      begin
      execute $q$
        select coalesce(jsonb_agg(jsonb_build_object('empresa_id', k, 'objetos', n, 'bytes', b)), '[]'::jsonb)
          from (
            select coalesce(
                     (select e.id from public.empresas e where e.id::text = o.owner::text),
                     (select m.empresa_id from public.motoboys m where m.auth_id::text = o.owner::text and m.empresa_id is not null limit 1),
                     (select e.id from public.empresas e where e.id::text = split_part(o.name, '/', 1)),
                     (select e.id from public.empresas e where e.id::text = split_part(o.name, '/', 2))
                   ) as k,
                   count(*) as n,
                   coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0)::bigint as b
              from storage.objects o
             group by 1
          ) s
      $q$ into v_st_emp;
      exception when others then
        -- sem coluna owner (versões novas do storage): tudo como não atribuído
        v_st_emp := jsonb_build_array(jsonb_build_object(
          'empresa_id', null, 'objetos', null, 'bytes', v_st_total));
      end;
    exception when others then
      v_st_total := null; v_st_bucket := null; v_st_emp := null;
    end;
  end if;

  return jsonb_build_object(
    'db_bytes',        pg_database_size(current_database()),
    'tabelas',         v_tabelas,
    'linhas',          v_linhas,
    'storage_total',   v_st_total,
    'storage_buckets', coalesce(v_st_bucket, '[]'::jsonb),
    'storage',         coalesce(v_st_emp, '[]'::jsonb),
    'gerado_em',       now()
  );
end;
$$;

revoke all on function public.god_uso_banco() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.god_uso_banco() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.god_uso_banco() from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.god_uso_banco() to service_role;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Premiações
-- ─────────────────────────────────────────────────────────────
create table if not exists public.premiacoes (
  id                uuid          primary key default gen_random_uuid(),
  alvo_tipo         text          not null check (alvo_tipo in ('empresa', 'motoboy')),
  empresa_id        uuid          references public.empresas(id) on delete cascade,
  motoboy_id        uuid          references public.motoboys(id) on delete cascade,
  titulo            text          not null check (char_length(titulo) between 1 and 120),
  mensagem          text          not null default '' check (char_length(mensagem) <= 1000),
  beneficio         text          check (beneficio is null or char_length(beneficio) <= 120), -- "1 mês grátis", "R$ 100"...
  valor             numeric(12,2) check (valor is null or valor >= 0),                         -- valor em R$, se houver
  dias_bonus        integer       check (dias_bonus is null or dias_bonus between 1 and 3650),  -- dias de assinatura, se houver
  dias_aplicados_em timestamptz,                                                                -- quando o god aplicou os dias
  periodo_ref       text          check (periodo_ref is null or char_length(periodo_ref) <= 60),
  status            text          not null default 'enviada' check (status in ('enviada', 'vista', 'resgatada')),
  created_at        timestamptz   not null default now(),
  vista_em          timestamptz,
  resgatada_em      timestamptz,
  constraint premiacoes_alvo_chk check (
    (alvo_tipo = 'empresa' and empresa_id is not null and motoboy_id is null)
    or (alvo_tipo = 'motoboy' and motoboy_id is not null)
  )
);

create index if not exists premiacoes_empresa_idx on public.premiacoes (empresa_id, created_at desc) where empresa_id is not null;
create index if not exists premiacoes_motoboy_idx on public.premiacoes (motoboy_id, created_at desc) where motoboy_id is not null;
create index if not exists premiacoes_created_idx on public.premiacoes (created_at desc);

-- Status só avança (enviada → vista → resgatada) e as datas são carimbadas no banco
create or replace function public.premiacoes_status_guard()
returns trigger
language plpgsql
as $$
declare
  ordem_old int := case old.status when 'enviada' then 0 when 'vista' then 1 else 2 end;
  ordem_new int := case new.status when 'enviada' then 0 when 'vista' then 1 else 2 end;
begin
  if ordem_new < ordem_old then
    new.status := old.status;
  end if;
  if new.status in ('vista', 'resgatada') and old.vista_em is null then
    new.vista_em := now();
  elsif old.vista_em is not null then
    new.vista_em := old.vista_em;
  end if;
  if new.status = 'resgatada' and old.resgatada_em is null then
    new.resgatada_em := now();
  elsif old.resgatada_em is not null then
    new.resgatada_em := old.resgatada_em;
  end if;
  return new;
end;
$$;

drop trigger if exists premiacoes_status_guard on public.premiacoes;
create trigger premiacoes_status_guard
  before update on public.premiacoes
  for each row execute function public.premiacoes_status_guard();

alter table public.premiacoes enable row level security;

-- God: usa o service role (ignora RLS) — "god faz tudo" pelas rotas /api/god/premiacoes.
-- Empresa: lê e marca as próprias
drop policy if exists "premiacoes_empresa_sel" on public.premiacoes;
create policy "premiacoes_empresa_sel" on public.premiacoes
  for select
  using (alvo_tipo = 'empresa' and empresa_id = auth.uid());

drop policy if exists "premiacoes_empresa_upd" on public.premiacoes;
create policy "premiacoes_empresa_upd" on public.premiacoes
  for update
  using (alvo_tipo = 'empresa' and empresa_id = auth.uid())
  with check (alvo_tipo = 'empresa' and empresa_id = auth.uid() and status in ('vista', 'resgatada'));

-- Motoboy: lê e marca as próprias
drop policy if exists "premiacoes_motoboy_sel" on public.premiacoes;
create policy "premiacoes_motoboy_sel" on public.premiacoes
  for select
  using (alvo_tipo = 'motoboy'
         and motoboy_id in (select m.id from public.motoboys m where m.auth_id = auth.uid()));

drop policy if exists "premiacoes_motoboy_upd" on public.premiacoes;
create policy "premiacoes_motoboy_upd" on public.premiacoes
  for update
  using (alvo_tipo = 'motoboy'
         and motoboy_id in (select m.id from public.motoboys m where m.auth_id = auth.uid()))
  with check (alvo_tipo = 'motoboy'
              and motoboy_id in (select m.id from public.motoboys m where m.auth_id = auth.uid())
              and status in ('vista', 'resgatada'));

-- Privilégios: ninguém insere/apaga pelo cliente; o destinatário só mexe no status
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.premiacoes from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.premiacoes from authenticated;
    grant select on public.premiacoes to authenticated;
    grant update (status) on public.premiacoes to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.premiacoes to service_role;
  end if;
end $$;
