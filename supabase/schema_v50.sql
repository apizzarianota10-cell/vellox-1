-- v50: corrige loja pública — política de leitura ausente em empresas
-- Executar no Supabase SQL Editor
--
-- Bug: a política "empresa_select_own" só deixa a própria empresa se ler
-- (auth.uid() = id). A loja pública (/loja/[slug]) precisa resolver a
-- empresa pelo slug para um visitante ANÔNIMO, o que sempre falhava e
-- retornava "Loja não encontrada" para qualquer cliente não logado.
--
-- produtos e configuracao_loja já tinham política pública de leitura
-- (ver schema_v23.sql) — só faltou empresas.
--
-- Em vez de liberar select em toda a tabela (que expõe email, cnpj,
-- endereço, ids de assinatura/pagamento), criamos uma view só com as
-- colunas necessárias para a loja pública e a seção "explorar".
-- Sem filtro de ativo/assinatura aqui, para casar com o comportamento
-- já existente de produtos/configuracao_loja (select livre) — quem
-- precisa filtrar por ativo/assinatura (ex: /explorar) filtra na query.

create or replace view public.empresas_publica as
  select id, nome, codigo, slug, verificado, lat, lng, ativo, assinatura_ativa, created_at
  from public.empresas;

grant select on public.empresas_publica to anon, authenticated;
