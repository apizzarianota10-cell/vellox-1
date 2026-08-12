-- v49: Vellox Print Agent — campos de impressão e tabela de configuração
-- Executar no Supabase SQL Editor

-- 1. Adiciona campos de impressão à tabela pedidos
alter table public.pedidos
  add column if not exists printed_at      timestamptz,
  add column if not exists print_count     integer     not null default 0,
  add column if not exists auto_printed    boolean     not null default false;

-- 2. Tabela de configuração do Print Agent por empresa
create table if not exists public.configuracoes_print_agent (
  empresa_id       uuid    primary key references public.empresas(id) on delete cascade,
  ativo            boolean not null default false,
  impressora_nome  text,
  tamanho_papel    text    not null default '80mm'
                          check (tamanho_papel in ('58mm', '80mm')),
  agent_token      text,                        -- JWT de longa duração
  agent_last_seen  timestamptz,                 -- último ping do agente
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

alter table public.configuracoes_print_agent enable row level security;

create policy "print_agent_empresa_crud" on public.configuracoes_print_agent
  for all using (empresa_id = auth.uid());

-- Trigger updated_at
drop trigger if exists set_print_agent_updated_at on public.configuracoes_print_agent;
create trigger set_print_agent_updated_at
  before update on public.configuracoes_print_agent
  for each row execute function public.update_updated_at();

-- 3. Função SECURITY DEFINER para o agente marcar pedido como impresso
--    Pode ser chamada com o anon key: o empresa_id é validado internamente.
create or replace function public.mark_pedido_printed(
  p_pedido_id   uuid,
  p_empresa_id  uuid,
  p_auto        boolean default true
)
returns void
language plpgsql
security definer
as $$
begin
  update public.pedidos
  set
    printed_at   = coalesce(printed_at, now()),
    print_count  = print_count + 1,
    auto_printed = p_auto
  where id          = p_pedido_id
    and empresa_id  = p_empresa_id;
end;
$$;

grant execute on function public.mark_pedido_printed to anon;
grant execute on function public.mark_pedido_printed to authenticated;

-- 4. Função para o agente atualizar o heartbeat (last_seen)
create or replace function public.ping_print_agent(
  p_empresa_id     uuid,
  p_impressora     text default null,
  p_tamanho_papel  text default null
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.configuracoes_print_agent (empresa_id, agent_last_seen, impressora_nome, tamanho_papel)
  values (p_empresa_id, now(),
          coalesce(p_impressora, ''),
          coalesce(p_tamanho_papel, '80mm'))
  on conflict (empresa_id) do update
    set agent_last_seen  = now(),
        impressora_nome  = coalesce(excluded.impressora_nome, configuracoes_print_agent.impressora_nome),
        tamanho_papel    = coalesce(excluded.tamanho_papel,   configuracoes_print_agent.tamanho_papel),
        updated_at       = now();
end;
$$;

grant execute on function public.ping_print_agent to anon;
grant execute on function public.ping_print_agent to authenticated;
