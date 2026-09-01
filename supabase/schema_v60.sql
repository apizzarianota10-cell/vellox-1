-- v60: telefone de contato da loja (pra botão "falar no WhatsApp" do cliente
-- na página de acompanhamento do pedido) — separado das credenciais Z-API
-- (whatsapp_instance_id/whatsapp_token), que são só pra envio automático.
-- Executar no Supabase SQL Editor

alter table public.configuracao_loja
  add column if not exists telefone_contato text;
