-- ════════════════════════════════════════════════════════════════════════
-- Cardápio da loja "Chef Augusto" (slug: chef-augusto) — a partir do
-- panfleto de marmitas (tamanhos M e G). Pode rodar mais de uma vez:
-- produto com o mesmo nome na loja é pulado, nada é duplicado.
-- Rodar no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  v_empresa uuid;
  v_item    jsonb;
  v_prod    uuid;
  v_ordem   int := 0;
  v_criados int := 0;
  v_acomp   text := ' Acompanha: arroz branco, feijão, macarrão alho e óleo, purê de batata, batata frita, vinagrete e farofa do chef.';
  v_dados   jsonb := $json$
[
  {"n":"Carne de sol", "d":"Carne de sol em cubos, suculenta e bem temperada.", "m":22, "g":26},
  {"n":"Rocambole", "d":"Rocambole de carne com presunto e queijo, ao molho especial.", "m":22, "g":26},
  {"n":"Frango grelhado ao molho de ervas", "d":"Filé de frango grelhado com molho de ervas, leve e saboroso.", "m":20, "g":25},
  {"n":"Mistão", "d":"Toscana de porco, frango grelhado e carne de sol.", "m":24, "g":28},
  {"n":"Coxa de frango frita alho e óleo", "d":"Coxa de frango frita no alho e óleo, crocante e bem temperada.", "m":20, "g":25},
  {"n":"Posta de peixe frita", "d":"Posta de peixe frita, crocante e bem temperada.", "m":23, "g":26},
  {"n":"Tilápia grelhada ao molho de ervas", "d":"Filé de tilápia grelhado com molho de ervas, leve e saboroso.", "m":23, "g":26},
  {"n":"Picanha suína", "d":"Picanha suína grelhada, suculenta e bem temperada.", "m":23, "g":26},
  {"n":"Arrumadinho de carne de sol", "d":"Carne de sol em cubos, feijão, farofa do chef e vinagrete. (Não acompanha arroz.)", "m":25, "g":30, "sem_acomp":true},
  {"n":"Frango fitness", "d":"Filé de frango grelhado, servido com legumes no vapor. Acompanhamento fitness: 80 g de feijão, 150 g de arroz, legumes ou salada e 100 a 120 g de proteína.", "m":23, "g":27, "sem_acomp":true}
]
$json$;
begin
  select id into v_empresa from public.empresas where slug = 'chef-augusto';
  if v_empresa is null then raise exception 'Loja chef-augusto não encontrada'; end if;

  for v_item in select * from jsonb_array_elements(v_dados) loop
    v_ordem := v_ordem + 1;
    if exists (select 1 from public.produtos where empresa_id = v_empresa and lower(nome) = lower(v_item->>'n')) then
      continue;
    end if;

    insert into public.produtos (empresa_id, nome, descricao, preco, categoria, ativo, ordem, variantes_label)
    values (
      v_empresa, v_item->>'n',
      (v_item->>'d') || case when (v_item->>'sem_acomp')::boolean is true then '' else v_acomp end,
      (v_item->>'m')::numeric, 'Marmitas', true, v_ordem, 'Tamanhos'
    )
    returning id into v_prod;

    insert into public.produto_variacoes (produto_id, nome, preco, max_sabores, ordem, ativo) values
      (v_prod, 'M', (v_item->>'m')::numeric, 1, 1, true),
      (v_prod, 'G', (v_item->>'g')::numeric, 1, 2, true);
    v_criados := v_criados + 1;
  end loop;

  raise notice 'Produtos criados: %', v_criados;
end $$;

-- Conferência
select p.nome, v.nome as tamanho, v.preco
from public.produtos p
join public.produto_variacoes v on v.produto_id = p.id
where p.empresa_id = (select id from public.empresas where slug = 'chef-augusto')
order by p.ordem, v.ordem;
