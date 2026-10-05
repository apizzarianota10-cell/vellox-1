-- schema_v66.sql — Conta de demonstração pública ("modo demo" no login)
-- Cria uma empresa fictícia com loja, catálogo, motoboys e pedidos de
-- mentira, pra visitantes testarem o painel completo sem precisar criar
-- conta. Credenciais: demo@appvellox.online / VelloxDemo2026!
-- (ver DEMO_EMAIL/DEMO_SENHA em src/app/(auth)/login/page.tsx)
--
-- Idempotente: pode rodar mais de uma vez sem duplicar linhas (reaproveita
-- a conta/loja/catálogo se já existirem; só não recria pedidos já semeados).

create extension if not exists pgcrypto;

do $$
declare
  v_empresa_id uuid;
  v_loja_id    uuid;
  v_moto1_id   uuid;
  v_moto2_id   uuid;
  v_codigo     text;
begin
  select id into v_empresa_id from auth.users where email = 'demo@appvellox.online';

  if v_empresa_id is null then
    v_empresa_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_empresa_id, 'authenticated', 'authenticated',
      'demo@appvellox.online',
      crypt('VelloxDemo2026!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"tipo":"empresa","nome":"Restaurante Demo"}'::jsonb,
      now(), now(),
      '', '', '', '', ''
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_empresa_id::text, v_empresa_id,
      jsonb_build_object('sub', v_empresa_id::text, 'email', 'demo@appvellox.online'),
      'email', now(), now(), now()
    );
  end if;

  -- Garante a linha em empresas com assinatura ativa, mesmo se o trigger
  -- handle_new_user() tiver falhado silenciosamente (ele engole exceções).
  loop
    v_codigo := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    exit when not exists (select 1 from public.empresas where codigo = v_codigo);
  end loop;

  insert into public.empresas (id, nome, email, codigo, assinatura_ativa, plano, verificado, ativo, cidade, estado, pais)
  values (v_empresa_id, 'Restaurante Demo', 'demo@appvellox.online', v_codigo, true, 'pro', true, true, 'São Paulo', 'SP', 'Brasil')
  on conflict (id) do update set
    assinatura_ativa = true,
    assinatura_expira_em = null,
    plano = 'pro',
    verificado = true,
    ativo = true,
    cidade = 'São Paulo', estado = 'SP', pais = 'Brasil';

  -- Loja
  select id into v_loja_id from public.lojas where empresa_id = v_empresa_id limit 1;
  if v_loja_id is null then
    v_loja_id := gen_random_uuid();
    insert into public.lojas (id, empresa_id, nome, descricao, cor, ativo, ordem)
    values (v_loja_id, v_empresa_id, 'Restaurante Demo', 'Loja de demonstração do Vellox — dados fictícios.', '#E4002B', true, 0);
  end if;

  -- Configuração da vitrine pública
  insert into public.configuracao_loja (empresa_id, cor_principal, descricao, aberto, tempo_entrega, taxa_entrega)
  values (v_empresa_id, '#E4002B', 'Loja de demonstração — dados fictícios.', true, '30-45 min', 6.90)
  on conflict (empresa_id) do nothing;

  -- Catálogo
  if not exists (select 1 from public.produtos where empresa_id = v_empresa_id) then
    insert into public.produtos (empresa_id, loja_id, nome, descricao, preco, categoria, ativo, ordem) values
      (v_empresa_id, v_loja_id, 'X-Burguer Especial', 'Pão, carne 160g, queijo, alface, tomate e maionese da casa', 28.90, 'Lanches', true, 0),
      (v_empresa_id, v_loja_id, 'X-Bacon Duplo', 'Pão, 2 carnes, bacon crocante e cheddar', 32.90, 'Lanches', true, 1),
      (v_empresa_id, v_loja_id, 'Batata Frita G', 'Porção generosa com cheddar e bacon', 22.00, 'Porções', true, 0),
      (v_empresa_id, v_loja_id, 'Refrigerante Lata', 'Coca-Cola, Guaraná ou Fanta — 350ml', 6.50, 'Bebidas', true, 0),
      (v_empresa_id, v_loja_id, 'Suco Natural 500ml', 'Laranja, limão ou maracujá', 9.90, 'Bebidas', true, 1),
      (v_empresa_id, v_loja_id, 'Brownie com Sorvete', 'Brownie quente com bola de sorvete de creme', 16.90, 'Sobremesas', true, 0);
  end if;

  -- Motoboys
  select id into v_moto1_id from public.motoboys where empresa_id = v_empresa_id and nome = 'Carlos Demo' limit 1;
  if v_moto1_id is null then
    v_moto1_id := gen_random_uuid();
    insert into public.motoboys (id, empresa_id, nome, telefone, status, veiculo_tipo)
    values (v_moto1_id, v_empresa_id, 'Carlos Demo', '11999990001', 'em_entrega', 'moto');
  end if;

  select id into v_moto2_id from public.motoboys where empresa_id = v_empresa_id and nome = 'Felipe Demo' limit 1;
  if v_moto2_id is null then
    v_moto2_id := gen_random_uuid();
    insert into public.motoboys (id, empresa_id, nome, telefone, status, veiculo_tipo)
    values (v_moto2_id, v_empresa_id, 'Felipe Demo', '11999990002', 'disponivel', 'moto');
  end if;

  -- Pedidos de exemplo (só semeia uma vez)
  if not exists (select 1 from public.pedidos where empresa_id = v_empresa_id) then
    insert into public.pedidos (
      empresa_id, loja_id, motoboy_id, cliente_nome, cliente_telefone, endereco_entrega, bairro,
      status, status_cozinha, descricao_itens, valor_pedido, forma_pagamento, origem,
      created_at, updated_at
    ) values
    (v_empresa_id, v_loja_id, null, 'Maria Andrade', '11988880001', 'Av. Principal, 456', 'Centro',
      'em_fila', 'na_fila', '1x X-Burguer Especial — R$28,90' || chr(10) || '1x Refrigerante Lata — R$6,50', 35.40, 'pix', 'catalogo', now() - interval '4 minutes', now() - interval '4 minutes'),
    (v_empresa_id, v_loja_id, null, 'Carlos Pereira', '11988880002', 'Rua das Flores, 123', 'Jardim América',
      'em_preparo', 'em_preparo', '2x X-Bacon Duplo — R$65,80' || chr(10) || '1x Batata Frita G — R$22,00', 87.80, 'cartao', 'catalogo', now() - interval '12 minutes', now() - interval '6 minutes'),
    (v_empresa_id, v_loja_id, v_moto1_id, 'Juliana Rocha', '11988880003', 'Travessa do Sol, 78', 'Vila Nova',
      'em_rota_de_entrega', 'finalizado', '1x Suco Natural 500ml — R$9,90' || chr(10) || '1x Brownie com Sorvete — R$16,90', 26.80, 'dinheiro', 'manual', now() - interval '28 minutes', now() - interval '5 minutes'),
    (v_empresa_id, v_loja_id, v_moto2_id, 'Ana Souza', '11988880004', 'Rua Beira Mar, 900', 'Praia Grande',
      'entregue', 'finalizado', '3x X-Burguer Especial — R$86,70', 86.70, 'pix', 'catalogo', now() - interval '2 hours', now() - interval '90 minutes'),
    (v_empresa_id, v_loja_id, v_moto1_id, 'Pedro Lima', '11988880005', 'Alameda das Árvores, 55', 'Centro',
      'entregue', 'finalizado', '1x X-Bacon Duplo — R$32,90' || chr(10) || '1x Refrigerante Lata — R$6,50', 39.40, 'cartao', 'manual', now() - interval '1 day', now() - interval '1 day' + interval '40 minutes');

    update public.pedidos set
      avaliacao_nota = 5,
      avaliacao_comentario = 'Chegou rapidinho e ainda quente, recomendo!',
      avaliacao_criada_em = now() - interval '1 day' + interval '50 minutes'
    where empresa_id = v_empresa_id and cliente_nome = 'Pedro Lima';
  end if;
end $$;
