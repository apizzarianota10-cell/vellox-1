-- v56: valida o agent_token no heartbeat do print agent (ping_print_agent)
-- Executar no Supabase SQL Editor
--
-- Bug: ping_print_agent só recebia p_empresa_id, sem checar o agent_token.
-- Isso significa que um servidor.ps1 pareado com um token ERRADO (ex: token
-- antigo, copiado de outra conta, digitado errado) ainda conseguia atualizar
-- agent_last_seen com sucesso — o painel mostrava "impressora online"
-- normalmente, escondendo o problema. Só get_pedidos_pendentes_agent (que
-- realmente busca os pedidos) validava o token, e falhava em silêncio total
-- (sem erro, só retornava vazio). Resultado: agente "online" no painel, mas
-- nenhum pedido real era impresso, sem nenhum aviso em lugar nenhum.

-- Precisa dropar a versão antiga (3 parâmetros) antes: create or replace não
-- substitui, cria uma sobrecarga nova — e isso deixaria a chamada via
-- PostgREST ambígua entre as duas versões.
drop function if exists public.ping_print_agent(uuid, text, text);

create or replace function public.ping_print_agent(
  p_empresa_id     uuid,
  p_impressora     text default null,
  p_tamanho_papel  text default null,
  p_agent_token    text default null
)
returns void
language plpgsql
security definer
as $$
begin
  -- Só atualiza o heartbeat se o token bater com o salvo para essa empresa.
  -- Se ainda não existe token salvo (primeiro ping antes de qualquer
  -- pareamento), aceita — mantém compatibilidade com agentes antigos que
  -- ainda não mandam o token.
  if exists (
    select 1 from public.configuracoes_print_agent
    where empresa_id = p_empresa_id
      and agent_token is not null
      and agent_token <> coalesce(p_agent_token, '')
  ) then
    return;
  end if;

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

grant execute on function public.ping_print_agent(uuid, text, text, text) to anon;
grant execute on function public.ping_print_agent(uuid, text, text, text) to authenticated;
