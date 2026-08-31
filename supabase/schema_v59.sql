-- v59: agente de impressão reporta a própria versão no heartbeat, pra
-- Configurações mostrar se o cliente está rodando uma versão desatualizada
-- Executar no Supabase SQL Editor

alter table public.configuracoes_print_agent
  add column if not exists agent_versao text;

-- Precisa dropar a versão antiga (4 parâmetros) antes: create or replace não
-- substitui, cria uma sobrecarga nova.
drop function if exists public.ping_print_agent(uuid, text, text, text);

create or replace function public.ping_print_agent(
  p_empresa_id     uuid,
  p_impressora     text default null,
  p_tamanho_papel  text default null,
  p_agent_token    text default null,
  p_agent_versao   text default null
)
returns void
language plpgsql
security definer
as $$
begin
  if exists (
    select 1 from public.configuracoes_print_agent
    where empresa_id = p_empresa_id
      and agent_token is not null
      and agent_token <> coalesce(p_agent_token, '')
  ) then
    return;
  end if;

  insert into public.configuracoes_print_agent (empresa_id, agent_last_seen, impressora_nome, tamanho_papel, agent_versao)
  values (p_empresa_id, now(),
          coalesce(p_impressora, ''),
          coalesce(p_tamanho_papel, '80mm'),
          p_agent_versao)
  on conflict (empresa_id) do update
    set agent_last_seen  = now(),
        impressora_nome  = coalesce(excluded.impressora_nome, configuracoes_print_agent.impressora_nome),
        tamanho_papel    = coalesce(excluded.tamanho_papel,   configuracoes_print_agent.tamanho_papel),
        agent_versao     = coalesce(excluded.agent_versao,    configuracoes_print_agent.agent_versao),
        updated_at       = now();
end;
$$;

grant execute on function public.ping_print_agent(uuid, text, text, text, text) to anon;
grant execute on function public.ping_print_agent(uuid, text, text, text, text) to authenticated;
