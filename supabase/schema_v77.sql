-- v77: trocar a impressora do agente PELO PAINEL (sem reinstalar) e erro de
-- impressao visivel no painel.
-- Executar no Supabase SQL Editor. Idempotente (pode rodar mais de uma vez).
--
-- Problema real: a loja trocou a impressora termica, reinstalou o agente,
-- escolheu o nome errado (ou o nome antigo continuou no config.json) e a
-- impressao automatica parou EM SILENCIO - o painel mostrava "online" porque o
-- heartbeat continuava chegando.
--
-- O que entra:
--   1. Colunas em configuracoes_print_agent:
--        impressoras_disponiveis  jsonb  - lista que o agente (v16+) le do
--                                         Windows: [{nome, padrao, offline,
--                                         status, porta}]
--        impressoras_em           timestamptz - quando a lista chegou
--        impressora_escolhida     text   - escolhida no painel; o agente pega
--                                         em ate 60s, grava no config.json e
--                                         passa a usar. O ping limpa este campo
--                                         quando o agente reporta que ja esta
--                                         usando essa impressora.
--        ultimo_erro              text   - ultimo erro/aviso de impressao
--        ultimo_erro_em           timestamptz
--   2. ping_print_agent ganha 3 parametros NO FIM, todos com default null
--      (p_impressoras, p_ultimo_erro, p_ultimo_erro_em). Agentes v12-v15 chamam
--      com os 5 parametros nomeados de sempre e caem na mesma funcao. A versao
--      de 5 parametros e removida NA MESMA TRANSACAO (senao o PostgREST fica com
--      duas sobrecargas e a chamada com 5 parametros fica ambigua).
--   3. get_print_agent_prefs devolve tambem a coluna "impressora"
--      (impressora_escolhida). Mesma assinatura (uuid, text): agentes antigos e
--      o configurar.ps1 so ignoram a coluna nova.
--
-- Semantica de p_ultimo_erro: null = nao mexe; '' = limpa (imprimiu com
-- sucesso); texto = grava (ate 500 caracteres) com ultimo_erro_em =
-- coalesce(p_ultimo_erro_em, now()).
--
-- Validacao do agent_token: IGUAL a da v59 (se a loja ja tem token salvo e o
-- token enviado nao bate, a chamada nao faz nada).

begin;

alter table public.configuracoes_print_agent
  add column if not exists impressoras_disponiveis jsonb,
  add column if not exists impressoras_em          timestamptz,
  add column if not exists impressora_escolhida    text
    check (impressora_escolhida is null or length(impressora_escolhida) <= 255),
  add column if not exists ultimo_erro             text,
  add column if not exists ultimo_erro_em          timestamptz;

-- Assinatura antiga (v59). A nova (8 parametros) e recriada logo abaixo.
drop function if exists public.ping_print_agent(uuid, text, text, text, text);

create or replace function public.ping_print_agent(
  p_empresa_id      uuid,
  p_impressora      text        default null,
  p_tamanho_papel   text        default null,
  p_agent_token     text        default null,
  p_agent_versao    text        default null,
  p_impressoras     jsonb       default null,
  p_ultimo_erro     text        default null,
  p_ultimo_erro_em  timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lista jsonb := null;
begin
  if exists (
    select 1 from public.configuracoes_print_agent
    where empresa_id = p_empresa_id
      and agent_token is not null
      and agent_token <> coalesce(p_agent_token, '')
  ) then
    return;
  end if;

  -- So aceita array de tamanho razoavel (nada de payload gigante no banco).
  if p_impressoras is not null
     and jsonb_typeof(p_impressoras) = 'array'
     and jsonb_array_length(p_impressoras) <= 100
     and length(p_impressoras::text) <= 30000 then
    v_lista := p_impressoras;
  end if;

  insert into public.configuracoes_print_agent (
    empresa_id, agent_last_seen, impressora_nome, tamanho_papel, agent_versao,
    impressoras_disponiveis, impressoras_em, ultimo_erro, ultimo_erro_em
  )
  values (
    p_empresa_id, now(),
    coalesce(p_impressora, ''),
    coalesce(p_tamanho_papel, '80mm'),
    p_agent_versao,
    v_lista,
    case when v_lista is not null then now() end,
    nullif(left(p_ultimo_erro, 500), ''),
    case when nullif(p_ultimo_erro, '') is not null then coalesce(p_ultimo_erro_em, now()) end
  )
  on conflict (empresa_id) do update
    set agent_last_seen  = now(),
        impressora_nome  = coalesce(excluded.impressora_nome, configuracoes_print_agent.impressora_nome),
        tamanho_papel    = coalesce(excluded.tamanho_papel,   configuracoes_print_agent.tamanho_papel),
        agent_versao     = coalesce(excluded.agent_versao,    configuracoes_print_agent.agent_versao),
        impressoras_disponiveis = coalesce(v_lista, configuracoes_print_agent.impressoras_disponiveis),
        impressoras_em   = case when v_lista is not null then now() else configuracoes_print_agent.impressoras_em end,
        ultimo_erro      = case
                             when p_ultimo_erro is null then configuracoes_print_agent.ultimo_erro
                             when p_ultimo_erro = ''    then null
                             else left(p_ultimo_erro, 500)
                           end,
        ultimo_erro_em   = case
                             when p_ultimo_erro is null then configuracoes_print_agent.ultimo_erro_em
                             when p_ultimo_erro = ''    then null
                             else coalesce(p_ultimo_erro_em, now())
                           end,
        -- O agente ja esta usando a impressora escolhida no painel: pedido
        -- cumprido, limpa (senao uma troca feita depois pelo configurar.ps1
        -- seria desfeita pelo valor velho do painel).
        impressora_escolhida = case
                                 when p_impressora is not null
                                  and lower(configuracoes_print_agent.impressora_escolhida) = lower(p_impressora)
                                 then null
                                 else configuracoes_print_agent.impressora_escolhida
                               end,
        updated_at       = now();
end;
$$;

grant execute on function public.ping_print_agent(uuid, text, text, text, text, jsonb, text, timestamptz) to anon;
grant execute on function public.ping_print_agent(uuid, text, text, text, text, jsonb, text, timestamptz) to authenticated;

-- Muda o tipo de retorno (coluna nova) -> precisa dropar antes. Mesma
-- transacao: nenhuma chamada do agente pega a funcao "sumida".
drop function if exists public.get_print_agent_prefs(uuid, text);

create or replace function public.get_print_agent_prefs(
  p_empresa_id  uuid,
  p_agent_token text
)
returns table(layout text, tamanho_papel text, fonte text, empresa_nome text, impressora text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_agent_token is null or p_agent_token = '' then
    return;
  end if;

  return query
    select c.layout, c.tamanho_papel, c.fonte, e.nome, c.impressora_escolhida
    from public.configuracoes_print_agent c
    join public.empresas e on e.id = c.empresa_id
    where c.empresa_id  = p_empresa_id
      and c.agent_token = p_agent_token;
end;
$$;

grant execute on function public.get_print_agent_prefs(uuid, text) to anon;
grant execute on function public.get_print_agent_prefs(uuid, text) to authenticated;

commit;

-- PostgREST recarrega o cache de funcoes (sem isso pode responder 404 por
-- alguns segundos para a assinatura nova).
notify pgrst, 'reload schema';
