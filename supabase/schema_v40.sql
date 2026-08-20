-- schema_v40: motoboy multi-empresa + logo da empresa nos pedidos

-- 1. Junction table motoboy_empresas
CREATE TABLE IF NOT EXISTS public.motoboy_empresas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motoboy_id uuid NOT NULL REFERENCES public.motoboys(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(motoboy_id, empresa_id)
);
ALTER TABLE public.motoboy_empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "motoboy_empresas_motoboy_sel" ON public.motoboy_empresas
  FOR SELECT USING (
    motoboy_id IN (SELECT id FROM public.motoboys WHERE auth_id = auth.uid())
  );
CREATE POLICY "motoboy_empresas_empresa_sel" ON public.motoboy_empresas
  FOR SELECT USING (empresa_id = auth.uid());

-- 2. Migrar vínculos existentes
INSERT INTO public.motoboy_empresas (motoboy_id, empresa_id)
SELECT id, empresa_id FROM public.motoboys
WHERE empresa_id IS NOT NULL
ON CONFLICT (motoboy_id, empresa_id) DO NOTHING;

-- 3. Atualizar responder_convite: inserir na junction em vez de sobrescrever empresa_id
CREATE OR REPLACE FUNCTION public.responder_convite(p_convite_id uuid, p_aceitar boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_motoboy_id uuid;
  v_convite    public.convites%rowtype;
BEGIN
  SELECT id INTO v_motoboy_id FROM public.motoboys WHERE auth_id = auth.uid() LIMIT 1;
  IF v_motoboy_id IS NULL THEN RETURN false; END IF;

  SELECT * INTO v_convite FROM public.convites
  WHERE id = p_convite_id AND motoboy_id = v_motoboy_id AND status = 'pendente';
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_aceitar THEN
    UPDATE public.convites SET status = 'aceito' WHERE id = p_convite_id;
    INSERT INTO public.motoboy_empresas (motoboy_id, empresa_id)
    VALUES (v_motoboy_id, v_convite.empresa_id)
    ON CONFLICT (motoboy_id, empresa_id) DO UPDATE SET ativo = true;
    -- Mantém empresa_id principal para backward compat (somente se ainda não tem)
    UPDATE public.motoboys
    SET empresa_id = COALESCE(empresa_id, v_convite.empresa_id),
        posicao_fila = 999
    WHERE id = v_motoboy_id;
  ELSE
    UPDATE public.convites SET status = 'recusado' WHERE id = p_convite_id;
  END IF;

  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.responder_convite(uuid, boolean) TO authenticated;

-- 4. RPC: lista empresas do motoboy (para subscriptions realtime)
CREATE OR REPLACE FUNCTION public.get_motoboy_empresas()
RETURNS TABLE(empresa_id uuid, empresa_nome text, logo_url text)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT me.empresa_id, e.nome::text, cl.logo_url::text
  FROM public.motoboy_empresas me
  JOIN public.empresas e ON e.id = me.empresa_id
  LEFT JOIN public.configuracao_loja cl ON cl.empresa_id = me.empresa_id
  JOIN public.motoboys m ON m.id = me.motoboy_id AND m.auth_id = auth.uid()
  WHERE me.ativo = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_motoboy_empresas() TO authenticated;

-- 5. Atualizar get_fila_pedidos_motoboy: usa junction + retorna empresa_nome e logo
DROP FUNCTION IF EXISTS public.get_fila_pedidos_motoboy();
CREATE OR REPLACE FUNCTION public.get_fila_pedidos_motoboy()
RETURNS TABLE (
  id                uuid,
  empresa_id        uuid,
  empresa_nome      text,
  empresa_logo_url  text,
  motoboy_id        uuid,
  route_id          uuid,
  route_address     text,
  cliente_nome      text,
  cliente_telefone  text,
  endereco_entrega  text,
  endereco_lat      double precision,
  endereco_lng      double precision,
  descricao_itens   text,
  valor_pedido      numeric,
  valor_motoboy     numeric,
  forma_pagamento   text,
  troco_para        numeric,
  status            text,
  observacoes       text,
  distancia_km      double precision,
  created_at        timestamptz,
  updated_at        timestamptz
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    p.id,
    p.empresa_id,
    e.nome::text          AS empresa_nome,
    cl.logo_url::text     AS empresa_logo_url,
    p.motoboy_id,
    p.route_id,
    p.route_address::text,
    p.cliente_nome,
    p.cliente_telefone,
    p.endereco_entrega,
    p.endereco_lat,
    p.endereco_lng,
    p.descricao_itens,
    p.valor_pedido,
    p.valor_motoboy,
    p.forma_pagamento::text,
    p.troco_para,
    p.status::text,
    p.observacoes,
    p.distancia_km,
    p.created_at,
    p.updated_at
  FROM public.pedidos p
  JOIN public.motoboy_empresas me ON me.empresa_id = p.empresa_id AND me.ativo = true
  JOIN public.motoboys m ON m.id = me.motoboy_id AND m.auth_id = auth.uid()
  JOIN public.empresas e ON e.id = p.empresa_id
  LEFT JOIN public.configuracao_loja cl ON cl.empresa_id = p.empresa_id
  WHERE p.status IN ('em_fila','em_preparo','finalizado','em_coleta','em_rota_de_entrega')
  ORDER BY p.created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_fila_pedidos_motoboy() TO authenticated;
