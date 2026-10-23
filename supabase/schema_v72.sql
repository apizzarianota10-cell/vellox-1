-- ── Adicionais: escolher só 1 ou vários ──────────────────────────────────
-- No formulário do produto (Adicionais → "Cliente marca: Só 1 | Vários").
-- true = na loja o cliente marca uma opção só (ex.: tipo de feijão).
-- O "Obrigatório escolher" usa a coluna produto_adicionais.obrigatorio.
alter table public.produtos add column if not exists adicionais_unico boolean not null default false;

-- Sabores do Nordeste: tipo de feijão e acompanhamento da parmegiana são
-- escolha única e obrigatória.
update public.produtos p
set adicionais_unico = true
where p.empresa_id = (select id from public.empresas where slug = 'saboresdonordeste')
  and exists (
    select 1 from public.produto_adicionais a
    where a.produto_id = p.id and (a.nome ilike 'Feijão %' or a.nome ilike 'Acompanhamento:%')
  );

update public.produto_adicionais a
set obrigatorio = true
where (a.nome ilike 'Feijão %' or a.nome ilike 'Acompanhamento:%')
  and a.produto_id in (
    select id from public.produtos
    where empresa_id = (select id from public.empresas where slug = 'saboresdonordeste')
  );
