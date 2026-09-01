-- v61: tamanho de destaque do cupom automático (normal/grande/extra_grande)
-- — controla o quanto nome da loja, total e forma de pagamento se destacam
-- no papel. Independente do layout (classico/moderno/compacto).
-- Executar no Supabase SQL Editor

alter table public.configuracoes_print_agent
  add column if not exists fonte text not null default 'grande'
    check (fonte in ('normal', 'grande', 'extra_grande'));

-- get_print_agent_prefs precisa devolver "fonte" também — como muda o tipo
-- de retorno (returns table), precisa dropar antes de recriar.
drop function if exists public.get_print_agent_prefs(uuid, text);

create or replace function public.get_print_agent_prefs(
  p_empresa_id  uuid,
  p_agent_token text
)
returns table(layout text, tamanho_papel text, fonte text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_agent_token is null or p_agent_token = '' then
    return;
  end if;

  return query
    select c.layout, c.tamanho_papel, c.fonte
    from public.configuracoes_print_agent c
    where c.empresa_id  = p_empresa_id
      and c.agent_token = p_agent_token;
end;
$$;

grant execute on function public.get_print_agent_prefs(uuid, text) to anon;
