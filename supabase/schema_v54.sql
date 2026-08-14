-- v54: agregação de estatísticas do Dashboard direto no banco
-- Executar no Supabase SQL Editor
--
-- O Dashboard buscava TODOS os pedidos da empresa (sem filtro de data, sem
-- limite) só pra somar/contar em JavaScript. Isso cresce sem limite conforme
-- a loja acumula histórico, deixando a navegação até o Dashboard cada vez
-- mais lenta. Essa função faz as contagens/somas no banco (rápido, índice
-- em empresa_id já existe) e devolve só os números — a página não precisa
-- mais baixar cada pedido inteiro pra calcular estatística.

create or replace function public.get_dashboard_stats(p_empresa_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  resultado    json;
  hoje_inicio  timestamptz := date_trunc('day', now());
begin
  select json_build_object(
    'total',           count(*),
    'emRota',          count(*) filter (where status = 'em_rota_de_entrega'),
    'entregues',       count(*) filter (where status = 'entregue'),
    'pendentes',       count(*) filter (where status = 'em_fila'),
    'emPreparo',       count(*) filter (where status = 'em_preparo'),
    'faturamento',     coalesce(sum(valor_pedido), 0),
    'lucroMotoboys',   coalesce(sum(valor_motoboy), 0),
    'totalHoje',       count(*) filter (where created_at >= hoje_inicio),
    'entreguesHoje',   count(*) filter (where status = 'entregue'  and created_at >= hoje_inicio),
    'canceladosHoje',  count(*) filter (where status = 'cancelado' and created_at >= hoje_inicio),
    'faturamentoHoje', coalesce(sum(valor_pedido) filter (where status = 'entregue' and created_at >= hoje_inicio), 0),
    'tempoMedioMin', (
      select round(avg(extract(epoch from (p2.updated_at - p2.created_at)) / 60))
      from public.pedidos p2
      where p2.empresa_id = p_empresa_id
        and p2.status     = 'entregue'
        and p2.created_at >= hoje_inicio
        and p2.updated_at > p2.created_at
    ),
    'rankingHoje', (
      select coalesce(json_agg(row_to_json(r)), '[]'::json)
      from (
        select m.nome, count(*) as count, coalesce(sum(p3.valor_motoboy), 0) as ganho
        from public.pedidos p3
        join public.motoboys m on m.id = p3.motoboy_id
        where p3.empresa_id  = p_empresa_id
          and p3.status      = 'entregue'
          and p3.created_at >= hoje_inicio
          and p3.motoboy_id is not null
        group by m.nome
        order by count(*) desc
        limit 5
      ) r
    )
  )
  into resultado
  from public.pedidos
  where empresa_id = p_empresa_id;

  return resultado;
end;
$$;

grant execute on function public.get_dashboard_stats(uuid) to authenticated;
