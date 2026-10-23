-- ════════════════════════════════════════════════════════════════════════
-- Cardápio "Sabores do Nordeste" — v2 (SÓ panfletos + listas de texto do dono)
-- 1) Apaga os produtos da importação anterior (iFood) que não fazem parte
--    deste cardápio. 2) Cria os produtos dos panfletos (pula se já existir
--    com o mesmo nome). 3) Coloca as bebidas como opções do produto
--    "BEBIDAS" (cria o produto se não existir; pula bebida repetida).
-- Pode rodar mais de uma vez. Rodar no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  v_empresa uuid;
  v_item    jsonb;
  v_prod    uuid;
  v_x       jsonb;
  v_i       int;
  v_ordem   int := 0;
  v_cat     text := '';
  v_criados int := 0;
  v_apagados int := 0;
  v_bebidas int := 0;
  v_dados   jsonb := $json$
[{"c":"Quentinhas","n":"Quentinha com 2 carnes","d":"Acompanha arroz, feijão, macarrão, farofa, vinagrete e batata. Escolha até 2 carnes e o tipo de feijão.","p":19.99,"v":[["M",19.99,2],["G",22.99,2]],"s":["Carne de sol","Picadinho de carne de sol","Galeto na brasa","Toscana na brasa","Galinha assada","Peito de frango frito","Strogonoff","Boi guisado","Galinha guisada","Fígado"],"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Carne de sol sertaneja","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Charque","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Coxão mole","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Cupim","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Costela de porco","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Costela de boi","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Alcatra","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Contra filé","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Lombo","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Maminha","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Bode","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Fraldinha","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Carneiro","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":55,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Picanha","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":70,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Executivos","n":"Buchada de bode","d":"Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa. Escolha o tipo de feijão.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
{"c":"Pirão","n":"Boi guisado com pirão","d":"","p":23},
{"c":"Pirão","n":"Chambaril com pirão","d":"","p":26},
{"c":"Pirão","n":"Mão de vaca com pirão","d":"","p":32},
{"c":"Pirão","n":"Rabada com pirão","d":"","p":32},
{"c":"Pirão","n":"Bode com pirão","d":"","p":30},
{"c":"Pirão","n":"Sarapatel com pirão","d":"","p":23},
{"c":"Arrumadinho","n":"Arrumadinho","d":"Escolha o sabor.","p":24,"s":[["Carne de sol",25],["Linguiça",24],["Charque",28],["Misto",30]]},
{"c":"Massas","n":"Lasanha","d":"Escolha carne ou frango.","p":25,"s":["Carne","Frango"]},
{"c":"Massas","n":"Escondidinho de carne de sol e cupim","d":"","p":22},
{"c":"Massas","n":"Macarronada","d":"","p":23},
{"c":"Massas","n":"Torta salgada","d":"Escolha frango ou camarão.","p":22,"s":["Frango","Camarão"]},
{"c":"Massas","n":"3 Panquecas","d":"Escolha carne ou frango.","p":25,"s":["Carne","Frango"]},
{"c":"Massas","n":"Porção de salpicão","d":"","p":22},
{"c":"Parmegiana","n":"Filé à parmegiana","d":"Acompanha batata frita e molho especial + 1 acompanhamento à escolha: macarrão, arroz ou purê.","p":35,"s":[["Carne",40],["Frango",35],["Camarão",45]],"a":[["Acompanhamento: Macarrão",0],["Acompanhamento: Arroz",0],["Acompanhamento: Purê",0]]},
{"c":"Sobremesas","n":"Musse de limão","d":"","p":8},
{"c":"Sobremesas","n":"Musse de maracujá","d":"","p":8},
{"c":"Sobremesas","n":"Bolo de pote","d":"","p":8},
{"c":"Sobremesas","n":"Pudim","d":"","p":8},
{"c":"Sucos","n":"Suco natural","d":"Escolha a fruta e o tamanho.","p":8,"v":[["Copo",8,1],["Jarra",18,1]],"s":["Acerola","Cajá","Caju","Maracujá","Goiaba","Abacaxi","Abacaxi com hortelã","Laranja"]}]
$json$;
  v_bebs    jsonb := $json$
[["Coca-Cola lata",7],["Coca-Cola Zero lata",7],["Guaraná lata",7],["Guaraná Zero lata",7],["Soda lata",7],["Sprite lata",7],["Fanta Uva lata",7],["Fanta Laranja lata",7],["Schweppes",8],["H2OH! Limoneto",8],["Coca-Cola 1L",12],["Guaraná 1L",12],["Coca-Cola 1,5L",17],["Monster",17],["Red Bull",17],["Água sem gás",3],["Água com gás",5],["Brahma latão",10],["Antarctica latão",10],["Original latão",10],["Heineken long neck",12],["Heineken Zero long neck",12],["Spaten long neck",12],["Budweiser long neck",12]]
$json$;
begin
  select id into v_empresa from public.empresas where slug = 'saboresdonordeste';
  if v_empresa is null then raise exception 'Loja saboresdonordeste não encontrada'; end if;

  -- 1) Remove o que veio do iFood na importação anterior
  delete from public.produtos
  where empresa_id = v_empresa
    and lower(nome) in ('quentinha com galeto g', 'quentinha de galeto e toscana g', 'toscana na brasa g', 'carne de sol com fritas', 'picanha com fritas', 'alcatra com fritas', 'filé com fritas', 'lombo com fritas', 'colchão mole com fritas', 'cupim com fritas', 'bode na brasa com fritas', 'carneiro na brasa com fritas', 'arrumadinho de carne de sol', 'arrumadinho de linguiça', 'arrumadinho de charque', 'arrumadinho misto', 'feijoada', 'caldinho de feijão', 'caldinho de feijoada', 'caldinho de dobradinha', 'lasanha de carne', 'lasanha de frango', 'torta salgada de frango', 'torta salgada de camarão', '3 panquecas de carne', '3 panquecas de frango', 'filé à parmegiana de carne', 'filé à parmegiana de frango', 'filé à parmegiana de camarão', 'arroz branco', 'macarrão', 'feijão', 'farofa', 'vinagrete', 'batata frita', 'suco de acerola', 'suco de cajá', 'suco de caju', 'suco de maracujá', 'suco de goiaba', 'suco de abacaxi', 'suco de abacaxi com hortelã', 'suco de laranja', 'suco de graviola', 'suco de limão', 'coca-cola lata 350ml', 'coca-cola zero lata 350ml', 'guaraná antarctica lata 350ml', 'guaraná antarctica zero lata 350ml', 'soda lata 350ml', 'sprite lata 350ml', 'fanta uva lata 350ml', 'fanta laranja lata 350ml', 'schweppes citrus 350ml', 'h2oh! limoneto 500ml', 'coca-cola 1l', 'guaraná antarctica 1l', 'coca-cola 1,5l', 'monster', 'red bull', 'água mineral sem gás 500ml', 'água mineral com gás 500ml', 'brahma latão', 'antarctica latão', 'original latão', 'heineken long neck', 'heineken zero long neck', 'spaten long neck', 'budweiser long neck');
  get diagnostics v_apagados = row_count;

  -- 2) Produtos dos panfletos e listas
  for v_item in select * from jsonb_array_elements(v_dados) loop
    if v_item->>'c' <> v_cat then v_cat := v_item->>'c'; v_ordem := 0; end if;
    v_ordem := v_ordem + 1;
    if exists (select 1 from public.produtos where empresa_id = v_empresa and lower(nome) = lower(v_item->>'n')) then
      continue;
    end if;

    insert into public.produtos (empresa_id, nome, descricao, preco, categoria, ativo, ordem)
    values (v_empresa, v_item->>'n', coalesce(v_item->>'d', ''), (v_item->>'p')::numeric, v_item->>'c', true, v_ordem)
    returning id into v_prod;
    v_criados := v_criados + 1;

    v_i := 0;
    for v_x in select * from jsonb_array_elements(coalesce(v_item->'v', '[]'::jsonb)) loop
      v_i := v_i + 1;
      insert into public.produto_variacoes (produto_id, nome, preco, max_sabores, ordem, ativo)
      values (v_prod, v_x->>0, (v_x->>1)::numeric, (v_x->>2)::int, v_i, true);
    end loop;

    -- Sabor: "Nome" (preço normal) ou ["Nome", preço] (preço próprio)
    v_i := 0;
    for v_x in select * from jsonb_array_elements(coalesce(v_item->'s', '[]'::jsonb)) loop
      v_i := v_i + 1;
      if jsonb_typeof(v_x) = 'array' then
        insert into public.produto_sabores (produto_id, nome, preco_adicional, ordem, ativo)
        values (v_prod, v_x->>0, (v_x->>1)::numeric, v_i, true);
      else
        insert into public.produto_sabores (produto_id, nome, ordem, ativo)
        values (v_prod, v_x#>>'{}', v_i, true);
      end if;
    end loop;

    v_i := 0;
    for v_x in select * from jsonb_array_elements(coalesce(v_item->'a', '[]'::jsonb)) loop
      v_i := v_i + 1;
      insert into public.produto_adicionais (produto_id, nome, preco, obrigatorio, ordem, ativo)
      values (v_prod, v_x->>0, (v_x->>1)::numeric, false, v_i, true);
    end loop;
  end loop;

  -- 3) Bebidas como opções do produto "BEBIDAS"
  select id into v_prod from public.produtos
  where empresa_id = v_empresa and lower(nome) = 'bebidas'
  order by created_at limit 1;
  if v_prod is null then
    insert into public.produtos (empresa_id, nome, descricao, preco, categoria, ativo, ordem)
    values (v_empresa, 'BEBIDAS', 'Escolha a bebida.', 3, 'Bebidas', true, 1)
    returning id into v_prod;
  end if;
  select coalesce(max(ordem), 0) into v_i from public.produto_sabores where produto_id = v_prod;
  for v_x in select * from jsonb_array_elements(v_bebs) loop
    if exists (select 1 from public.produto_sabores where produto_id = v_prod and lower(nome) = lower(v_x->>0)) then
      continue;
    end if;
    v_i := v_i + 1;
    insert into public.produto_sabores (produto_id, nome, preco_adicional, ordem, ativo)
    values (v_prod, v_x->>0, (v_x->>1)::numeric, v_i, true);
    v_bebidas := v_bebidas + 1;
  end loop;

  raise notice 'Apagados (iFood): %, produtos criados: %, bebidas adicionadas: %', v_apagados, v_criados, v_bebidas;
end $$;

-- Conferência
select p.categoria, p.nome, p.preco, count(s.id) as opcoes
from public.produtos p
left join public.produto_sabores s on s.produto_id = p.id
where p.empresa_id = (select id from public.empresas where slug = 'saboresdonordeste')
group by p.id, p.categoria, p.nome, p.preco
order by p.categoria, p.nome;
