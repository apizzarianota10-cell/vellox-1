-- get_print_agent_prefs passa a devolver também o nome da empresa — o
-- agente (servidor.ps1) usava o "empresa_nome" digitado na hora de parear
-- (configurar.ps1), que fica em branco se a pessoa só apertar ENTER, e aí
-- o cupom automático saía com "PEDIDO" no lugar do nome da loja. Agora o
-- agente sincroniza isso do banco a cada 60s, igual já fazia com layout/
-- fonte, e se autocorrige sem precisar reparear.
drop function if exists public.get_print_agent_prefs(uuid, text);

create or replace function public.get_print_agent_prefs(
  p_empresa_id  uuid,
  p_agent_token text
)
returns table(layout text, tamanho_papel text, fonte text, empresa_nome text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_agent_token is null or p_agent_token = '' then
    return;
  end if;

  return query
    select c.layout, c.tamanho_papel, c.fonte, e.nome
    from public.configuracoes_print_agent c
    join public.empresas e on e.id = c.empresa_id
    where c.empresa_id  = p_empresa_id
      and c.agent_token = p_agent_token;
end;
$$;

grant execute on function public.get_print_agent_prefs(uuid, text) to anon;
