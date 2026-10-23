-- ════════════════════════════════════════════════════════════════════════
-- Sabores do Nordeste — Quentinha com preço por tamanho e nº de carnes
--   M · 1 carne  R$ 18,99   |   M · 2 carnes  R$ 19,99
--   G · 1 carne  R$ 21,99   |   G · 2 carnes  R$ 22,99
-- e Quentinhas como primeira categoria da loja.
-- Pode rodar mais de uma vez. Rodar no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════
alter table public.configuracao_loja add column if not exists ordem_categorias text[];
alter table public.produtos add column if not exists destaque boolean not null default false;

do $$
declare
  v_empresa uuid;
  v_prod    uuid;
begin
  select id into v_empresa from public.empresas where slug = 'saboresdonordeste';
  if v_empresa is null then raise exception 'Loja saboresdonordeste não encontrada'; end if;

  select id into v_prod from public.produtos
  where empresa_id = v_empresa and lower(nome) in ('quentinha com 2 carnes', 'quentinha')
  order by created_at limit 1;
  if v_prod is null then raise exception 'Produto da quentinha não encontrado — rode antes o cardapio_sabores_do_nordeste_v2.sql'; end if;

  update public.produtos
  set nome = 'Quentinha',
      descricao = 'Acompanha arroz, feijão, macarrão, farofa, vinagrete e batata. Escolha o tamanho, quantas carnes (1 ou 2) e o tipo de feijão.',
      preco = 18.99,
      categoria = 'Quentinhas',
      ordem = 0,
      destaque = true
  where id = v_prod;

  -- Tamanhos: o nome diz o tamanho e quantas carnes; max_sabores limita a escolha
  delete from public.produto_variacoes where produto_id = v_prod;
  insert into public.produto_variacoes (produto_id, nome, preco, max_sabores, ordem, ativo) values
    (v_prod, 'M · 1 carne',  18.99, 1, 1, true),
    (v_prod, 'M · 2 carnes', 19.99, 2, 2, true),
    (v_prod, 'G · 1 carne',  21.99, 1, 3, true),
    (v_prod, 'G · 2 carnes', 22.99, 2, 4, true);

  -- Carnes sem preço próprio: o preço é sempre o do tamanho escolhido
  update public.produto_sabores set preco_adicional = null where produto_id = v_prod;

  -- Quentinhas primeiro; as demais seguem a ordem do cardápio
  update public.configuracao_loja
  set ordem_categorias = array['Quentinhas', 'Executivos', 'Pirão', 'Arrumadinho', 'Parmegiana', 'Massas', 'Sucos', 'Bebidas', 'Sobremesas']
  where empresa_id = v_empresa;
end $$;

select v.nome, v.preco, v.max_sabores
from public.produto_variacoes v
join public.produtos p on p.id = v.produto_id
where p.empresa_id = (select id from public.empresas where slug = 'saboresdonordeste') and p.nome = 'Quentinha'
order by v.ordem;
