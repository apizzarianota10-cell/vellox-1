-- ════════════════════════════════════════════════════════════════════════
-- Cardápio da loja "Sabores do Nordeste" (slug: saboresdonordeste)
-- Fonte: cardápio do iFood + panfletos + listas enviadas pelo dono.
-- Preços: quando o iFood e o panfleto divergem, vale o panfleto/lista
-- (preço da venda direta). Pode rodar mais de uma vez: produto com o mesmo
-- nome (na mesma loja) é pulado, nada é duplicado.
-- Rodar no Supabase → SQL Editor.
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
  v_pulados int := 0;
  v_dados   jsonb := $json$
[
  {"c":"Quentinhas","n":"Quentinha com 2 carnes","d":"Arroz, feijão, macarrão, farofa, vinagrete e batata. Escolha até 2 carnes e o tipo de feijão.",
   "p":19.99,"v":[["M",19.99,2],["G",22.99,2]],
   "s":["Carne de sol","Picadinho de carne de sol","Galeto na brasa","Toscana na brasa","Galinha assada","Peito de frango frito","Strogonoff","Boi guisado","Galinha guisada","Fígado"],
   "a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},

  {"c":"Galeto","n":"Quentinha com galeto G","d":"Acompanha arroz, macarrão, feijão, vinagrete, farofa e fritas.","p":25},
  {"c":"Galeto","n":"Quentinha de galeto e toscana G","d":"Acompanha arroz, macarrão, feijão, vinagrete, farofa e fritas.","p":30},
  {"c":"Galeto","n":"Toscana na brasa G","d":"Acompanha arroz, macarrão, feijão, vinagrete, farofa e fritas.","p":25},

  {"c":"Executivos","n":"Carne de sol sertaneja","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Charque","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Coxão mole","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Cupim","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Costela de porco","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Costela de boi","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Alcatra","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Contra filé","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Lombo","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Maminha","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Bode","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Fraldinha","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Carneiro","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":55,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Picanha","d":"Executivo na chapa/brasa. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":70,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Executivos","n":"Buchada de bode","d":"Executivo. Acompanha arroz, feijão, macarrão, vinagrete, batata frita e farofa.","p":45,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},

  {"c":"Petiscos","n":"Carne de sol com fritas","d":"","p":50},
  {"c":"Petiscos","n":"Picanha com fritas","d":"","p":85},
  {"c":"Petiscos","n":"Alcatra com fritas","d":"","p":50},
  {"c":"Petiscos","n":"Filé com fritas","d":"","p":60},
  {"c":"Petiscos","n":"Lombo com fritas","d":"","p":45},
  {"c":"Petiscos","n":"Colchão mole com fritas","d":"","p":50},
  {"c":"Petiscos","n":"Cupim com fritas","d":"","p":50},
  {"c":"Petiscos","n":"Bode na brasa com fritas","d":"","p":70},
  {"c":"Petiscos","n":"Carneiro na brasa com fritas","d":"","p":70},

  {"c":"Pirão","n":"Boi guisado com pirão","d":"","p":23},
  {"c":"Pirão","n":"Chambaril com pirão","d":"","p":26},
  {"c":"Pirão","n":"Mão de vaca com pirão","d":"","p":32},
  {"c":"Pirão","n":"Rabada com pirão","d":"","p":32},
  {"c":"Pirão","n":"Bode com pirão","d":"","p":30},
  {"c":"Pirão","n":"Sarapatel com pirão","d":"","p":23},

  {"c":"Arrumadinho","n":"Arrumadinho de carne de sol","d":"","p":25},
  {"c":"Arrumadinho","n":"Arrumadinho de linguiça","d":"","p":24},
  {"c":"Arrumadinho","n":"Arrumadinho de charque","d":"","p":28},
  {"c":"Arrumadinho","n":"Arrumadinho misto","d":"","p":30},

  {"c":"Feijoada","n":"Feijoada","d":"Acompanha arroz, vinagrete e farofa.","p":30},

  {"c":"Caldinhos","n":"Caldinho de feijão","d":"","p":7},
  {"c":"Caldinhos","n":"Caldinho de feijoada","d":"","p":8},
  {"c":"Caldinhos","n":"Caldinho de dobradinha","d":"","p":8},

  {"c":"Massas","n":"Lasanha de carne","d":"Massa, recheio molhadinho, molho artesanal e queijo.","p":25},
  {"c":"Massas","n":"Lasanha de frango","d":"Massa, recheio molhadinho, molho artesanal e queijo.","p":25},
  {"c":"Massas","n":"Escondidinho de carne de sol e cupim","d":"","p":22},
  {"c":"Massas","n":"Macarronada","d":"","p":23},
  {"c":"Massas","n":"Torta salgada de frango","d":"","p":22},
  {"c":"Massas","n":"Torta salgada de camarão","d":"","p":22},
  {"c":"Massas","n":"3 Panquecas de carne","d":"","p":25},
  {"c":"Massas","n":"3 Panquecas de frango","d":"","p":25},
  {"c":"Massas","n":"Porção de salpicão","d":"","p":22},

  {"c":"Parmegiana","n":"Filé à parmegiana de carne","d":"Acompanha batata frita e molho especial + 1 acompanhamento à escolha: macarrão, arroz ou purê.",
   "p":40,"v":[["Individual",40,1],["Para 2 pessoas",90,1],["Para 3 pessoas",140,1]],
   "a":[["Acompanhamento: Macarrão",0],["Acompanhamento: Arroz",0],["Acompanhamento: Purê",0]]},
  {"c":"Parmegiana","n":"Filé à parmegiana de frango","d":"Acompanha batata frita e molho especial + 1 acompanhamento à escolha: macarrão, arroz ou purê.",
   "p":35,"v":[["Individual",35,1],["Para 2 pessoas",80,1],["Para 3 pessoas",130,1]],
   "a":[["Acompanhamento: Macarrão",0],["Acompanhamento: Arroz",0],["Acompanhamento: Purê",0]]},
  {"c":"Parmegiana","n":"Filé à parmegiana de camarão","d":"Acompanha batata frita e molho especial + 1 acompanhamento à escolha: macarrão, arroz ou purê.",
   "p":45,"a":[["Acompanhamento: Macarrão",0],["Acompanhamento: Arroz",0],["Acompanhamento: Purê",0]]},

  {"c":"Porções","n":"Arroz branco","d":"Serve 2 pessoas.","p":7},
  {"c":"Porções","n":"Macarrão","d":"","p":7},
  {"c":"Porções","n":"Feijão","d":"Escolha entre feijão mulatinho, de corda ou preto.","p":7,"a":[["Feijão mulatinho",0],["Feijão preto",0],["Feijão de corda",0]]},
  {"c":"Porções","n":"Farofa","d":"","p":7},
  {"c":"Porções","n":"Vinagrete","d":"","p":5},
  {"c":"Porções","n":"Batata frita","d":"","p":15,"v":[["M",15,1],["G",25,1]]},

  {"c":"Sobremesas","n":"Pudim","d":"","p":8},
  {"c":"Sobremesas","n":"Musse de limão","d":"","p":8},
  {"c":"Sobremesas","n":"Musse de maracujá","d":"","p":8},
  {"c":"Sobremesas","n":"Bolo de pote","d":"","p":8},

  {"c":"Sucos","n":"Suco de acerola","d":"","p":8,"v":[["Copo",8,1],["Jarra",18,1]]},
  {"c":"Sucos","n":"Suco de cajá","d":"","p":8,"v":[["Copo",8,1],["Jarra",18,1]]},
  {"c":"Sucos","n":"Suco de caju","d":"","p":8,"v":[["Copo",8,1],["Jarra",18,1]]},
  {"c":"Sucos","n":"Suco de maracujá","d":"","p":8,"v":[["Copo",8,1],["Jarra",18,1]]},
  {"c":"Sucos","n":"Suco de goiaba","d":"","p":8,"v":[["Copo",8,1],["Jarra",18,1]]},
  {"c":"Sucos","n":"Suco de abacaxi","d":"","p":8,"v":[["Copo",8,1],["Jarra",18,1]]},
  {"c":"Sucos","n":"Suco de abacaxi com hortelã","d":"","p":8,"v":[["Copo",8,1],["Jarra",18,1]]},
  {"c":"Sucos","n":"Suco de laranja","d":"","p":8,"v":[["Copo",8,1],["Jarra",18,1]]},
  {"c":"Sucos","n":"Suco de graviola","d":"","p":8,"v":[["Copo",8,1],["Jarra",18,1]]},
  {"c":"Sucos","n":"Suco de limão","d":"","p":8,"v":[["Copo",8,1],["Jarra",18,1]]},

  {"c":"Bebidas","n":"Coca-Cola lata 350ml","d":"","p":7},
  {"c":"Bebidas","n":"Coca-Cola Zero lata 350ml","d":"","p":7},
  {"c":"Bebidas","n":"Guaraná Antarctica lata 350ml","d":"","p":7},
  {"c":"Bebidas","n":"Guaraná Antarctica Zero lata 350ml","d":"","p":7},
  {"c":"Bebidas","n":"Soda lata 350ml","d":"","p":7},
  {"c":"Bebidas","n":"Sprite lata 350ml","d":"","p":7},
  {"c":"Bebidas","n":"Fanta Uva lata 350ml","d":"","p":7},
  {"c":"Bebidas","n":"Fanta Laranja lata 350ml","d":"","p":7},
  {"c":"Bebidas","n":"Schweppes Citrus 350ml","d":"","p":8},
  {"c":"Bebidas","n":"H2OH! Limoneto 500ml","d":"","p":8},
  {"c":"Bebidas","n":"Coca-Cola 1L","d":"","p":12},
  {"c":"Bebidas","n":"Guaraná Antarctica 1L","d":"","p":12},
  {"c":"Bebidas","n":"Coca-Cola 1,5L","d":"","p":17},
  {"c":"Bebidas","n":"Monster","d":"Energético.","p":17},
  {"c":"Bebidas","n":"Red Bull","d":"Energético.","p":17},
  {"c":"Bebidas","n":"Água mineral sem gás 500ml","d":"","p":3},
  {"c":"Bebidas","n":"Água mineral com gás 500ml","d":"","p":5},

  {"c":"Cervejas","n":"Brahma latão","d":"","p":10},
  {"c":"Cervejas","n":"Antarctica latão","d":"","p":10},
  {"c":"Cervejas","n":"Original latão","d":"","p":10},
  {"c":"Cervejas","n":"Heineken long neck","d":"","p":12},
  {"c":"Cervejas","n":"Heineken Zero long neck","d":"","p":12},
  {"c":"Cervejas","n":"Spaten long neck","d":"","p":12},
  {"c":"Cervejas","n":"Budweiser long neck","d":"","p":12}
]
$json$;
begin
  select id into v_empresa from public.empresas where slug = 'saboresdonordeste';
  if v_empresa is null then
    raise exception 'Loja saboresdonordeste não encontrada';
  end if;

  for v_item in select * from jsonb_array_elements(v_dados) loop
    if v_item->>'c' <> v_cat then v_cat := v_item->>'c'; v_ordem := 0; end if;
    v_ordem := v_ordem + 1;

    if exists (select 1 from public.produtos
               where empresa_id = v_empresa and lower(nome) = lower(v_item->>'n')) then
      v_pulados := v_pulados + 1;
      continue;
    end if;

    insert into public.produtos (empresa_id, nome, descricao, preco, categoria, ativo, ordem)
    values (v_empresa, v_item->>'n', coalesce(v_item->>'d', ''), (v_item->>'p')::numeric,
            v_item->>'c', true, v_ordem)
    returning id into v_prod;
    v_criados := v_criados + 1;

    v_i := 0;
    for v_x in select * from jsonb_array_elements(coalesce(v_item->'v', '[]'::jsonb)) loop
      v_i := v_i + 1;
      insert into public.produto_variacoes (produto_id, nome, preco, max_sabores, ordem, ativo)
      values (v_prod, v_x->>0, (v_x->>1)::numeric, (v_x->>2)::int, v_i, true);
    end loop;

    v_i := 0;
    for v_x in select * from jsonb_array_elements(coalesce(v_item->'s', '[]'::jsonb)) loop
      v_i := v_i + 1;
      insert into public.produto_sabores (produto_id, nome, ordem, ativo)
      values (v_prod, v_x#>>'{}', v_i, true);
    end loop;

    v_i := 0;
    for v_x in select * from jsonb_array_elements(coalesce(v_item->'a', '[]'::jsonb)) loop
      v_i := v_i + 1;
      insert into public.produto_adicionais (produto_id, nome, preco, obrigatorio, ordem, ativo)
      values (v_prod, v_x->>0, (v_x->>1)::numeric, false, v_i, true);
    end loop;
  end loop;

  raise notice 'Produtos criados: %, já existentes (pulados): %', v_criados, v_pulados;
end $$;

-- Conferência: quantos produtos por categoria ficaram na loja
select categoria, count(*) as produtos
from public.produtos
where empresa_id = (select id from public.empresas where slug = 'saboresdonordeste')
group by categoria
order by categoria;
