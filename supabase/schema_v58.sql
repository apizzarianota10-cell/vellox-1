-- v58: layout do cupom configurável pelas Configurações, sem precisar reinstalar
-- o agente de impressão local
-- Executar no Supabase SQL Editor
--
-- Antes, o layout do cupom impresso automaticamente (servidor.ps1) era fixo no
-- código do script — pra mudar, precisava editar/baixar o arquivo de novo no
-- PC da impressora. Agora fica salvo em configuracoes_print_agent.layout, e o
-- agente busca esse valor periodicamente via get_print_agent_prefs (validando
-- o agent_token, mesmo padrão de get_pedidos_pendentes_agent).

alter table public.configuracoes_print_agent
  add column if not exists layout text not null default 'moderno'
    check (layout in ('classico', 'moderno', 'compacto'));

create or replace function public.get_print_agent_prefs(
  p_empresa_id  uuid,
  p_agent_token text
)
returns table(layout text, tamanho_papel text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_agent_token is null or p_agent_token = '' then
    return;
  end if;

  return query
    select c.layout, c.tamanho_papel
    from public.configuracoes_print_agent c
    where c.empresa_id  = p_empresa_id
      and c.agent_token = p_agent_token;
end;
$$;

grant execute on function public.get_print_agent_prefs(uuid, text) to anon;
