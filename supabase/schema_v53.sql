-- v53: robustez no endpoint público de criação de pedido (/api/loja/pedido)
-- Executar no Supabase SQL Editor
--
-- Adiciona uma chave de idempotência: se o navegador do cliente reenviar o
-- mesmo pedido (timeout, retry, conexão caiu no meio do checkout), o índice
-- único abaixo garante — no nível do banco, sem depender de nenhuma lógica
-- de aplicação — que o mesmo pedido não é inserido duas vezes, mesmo se
-- duas requisições chegarem quase ao mesmo tempo.

alter table public.pedidos
  add column if not exists idempotency_key text;

create unique index if not exists pedidos_idempotency_key_uniq
  on public.pedidos (empresa_id, idempotency_key)
  where idempotency_key is not null;
