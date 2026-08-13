-- v52: RPC segura para o servidor de impressão local (PowerShell) ler pedidos
-- pendentes sem precisar de uma política RLS aberta em "pedidos".
-- Executar no Supabase SQL Editor
--
-- Bug: servidor.ps1 consultava /rest/v1/pedidos direto com a chave anon, mas
-- não existe (e não deve existir) política de SELECT anônima em "pedidos" —
-- a tabela tem nome, telefone e endereço de clientes. O servidor rodava sem
-- erro, mas nunca via nenhum pedido (RLS filtra tudo silenciosamente).
--
-- Em vez de abrir a tabela, criamos uma função que só retorna os pedidos da
-- empresa se o "agent_token" bater com o salvo em configuracoes_print_agent
-- (mesmo token que /api/print-agent/config e /api/print-server/config geram).

create or replace function public.get_pedidos_pendentes_agent(
  p_empresa_id  uuid,
  p_agent_token text,
  p_desde       timestamptz default (now() - interval '1 hour')
)
returns setof public.pedidos
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_agent_token is null or p_agent_token = '' then
    return;
  end if;

  if not exists (
    select 1 from public.configuracoes_print_agent
    where empresa_id  = p_empresa_id
      and agent_token = p_agent_token
  ) then
    return;
  end if;

  return query
    select *
    from public.pedidos
    where empresa_id  = p_empresa_id
      and status      = 'em_fila'
      and created_at  > p_desde
      -- Se o navegador (PrintListener) já imprimiu este pedido via fallback
      -- e marcou auto_printed=true (mark_pedido_printed) entre um ciclo de
      -- polling e outro, não devolve de novo — evita impressão duplicada
      -- quando o servidor.ps1 e o navegador reagem quase ao mesmo tempo.
      and coalesce(auto_printed, false) = false
    order by created_at;
end;
$$;

grant execute on function public.get_pedidos_pendentes_agent(uuid, text, timestamptz) to anon;
