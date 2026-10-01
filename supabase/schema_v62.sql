-- ── Senha de acesso ao Financeiro (opt-in, cada empresa ativa a sua) ────────
-- Guarda "salt:hash" (scrypt, gerado em src/lib/passwordHash.ts) — nunca a
-- senha em texto puro. Null = proteção desativada (comportamento de sempre).
alter table empresas add column if not exists senha_financeiro text;

create or replace function public.set_senha_financeiro(p_hash text)
returns void
language plpgsql security definer
as $$
begin
  update public.empresas set senha_financeiro = p_hash where id = auth.uid();
end;
$$;
grant execute on function public.set_senha_financeiro(text) to authenticated;

-- ── Produtos mais vendidos (catálogo) ────────────────────────────────────
-- `descricao_itens` é texto livre ("2x Nome (detalhe) — R$44,90" por linha,
-- ver parseItemLine em printService.ts/escpos.ts) — não existe tabela
-- relacional de itens do pedido, então o parse é feito aqui via regex,
-- agrupando pelo nome base do produto (sem os detalhes entre parênteses,
-- pra variações de sabor/adicional contarem pro mesmo produto).
-- security invoker: roda com o papel de quem chamou, a RLS de `pedidos`
-- (empresa só lê os próprios pedidos) já protege contra ver dados de outros.
create or replace function public.get_produtos_mais_vendidos(p_empresa_id uuid, p_limit int default 8)
returns table(nome text, qtd_total bigint, qtd_hoje bigint)
language sql
stable
security invoker
as $$
  with hoje as (
    select date_trunc('day', now()) as inicio
  ),
  linhas as (
    select
      p.created_at,
      regexp_split_to_table(coalesce(p.descricao_itens, ''), E'\n') as linha
    from pedidos p
    where p.empresa_id = p_empresa_id
      and p.status <> 'cancelado'
  ),
  parsed as (
    select
      (regexp_match(linha, '^(\d+)x\s+(.+?)\s+—\s+R\$\s*([\d.,]+)\s*$'))[1]::bigint as qtd,
      split_part((regexp_match(linha, '^(\d+)x\s+(.+?)\s+—\s+R\$\s*([\d.,]+)\s*$'))[2], ' (', 1) as nome,
      created_at
    from linhas
    where linha ~ '^(\d+)x\s+(.+?)\s+—\s+R\$\s*([\d.,]+)\s*$'
  )
  select
    nome,
    sum(qtd) as qtd_total,
    coalesce(sum(qtd) filter (where created_at >= (select inicio from hoje)), 0) as qtd_hoje
  from parsed
  group by nome
  order by qtd_total desc
  limit p_limit;
$$;
grant execute on function public.get_produtos_mais_vendidos(uuid, int) to authenticated;
