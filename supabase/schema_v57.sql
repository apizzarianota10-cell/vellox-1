-- v57: remove política RLS morta em pedidos que quebrava inserts com
-- "permission denied for table users"
-- Executar no Supabase SQL Editor
--
-- anon_insert_pedido (schema_v23) fazia:
--   with check (empresa_id in (select id from auth.users) and status = 'em_fila')
-- Ler auth.users diretamente exige uma permissão que os roles anon/authenticated
-- não têm. Como essa policy não tem "to <role>", ela é avaliada (via OR) em
-- QUALQUER insert em pedidos — inclusive quando o admin cria um pedido pelo
-- painel logado, que já era permitido pela policy correta (pedidos_empresa_crud).
-- Isso derrubava o insert inteiro com "permission denied for table users",
-- mesmo quando a outra política já autorizava a linha.
--
-- Hoje o checkout público (src/app/api/loja/pedido/route.ts) insere via
-- service role (createAdminClient), que ignora RLS — essa policy não é mais
-- necessária pra nada.

drop policy if exists "anon_insert_pedido" on public.pedidos;
