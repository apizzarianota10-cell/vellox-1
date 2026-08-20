-- schema_v48: colunas faltantes em produto_sabores + tabela produto_categorias_sabor
-- Estas colunas/tabela são referenciadas no código desde v36/v42 mas nunca foram criadas

-- ── Colunas faltantes em produto_sabores ────────────────────────────────────────
ALTER TABLE public.produto_sabores
  ADD COLUMN IF NOT EXISTS preco_adicional numeric(10,2),
  ADD COLUMN IF NOT EXISTS categoria_sabor_id uuid;

-- ── Tabela de categorias de sabor (ex: "Tradicionais", "Especiais") ─────────────
CREATE TABLE IF NOT EXISTS public.produto_categorias_sabor (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id      uuid          NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  nome            text          NOT NULL,
  preco_adicional numeric(10,2) NOT NULL DEFAULT 0,
  ordem           int           NOT NULL DEFAULT 0
);

-- Foreign key de sabores para a categoria
DO $$ BEGIN
  ALTER TABLE public.produto_sabores
    ADD CONSTRAINT produto_sabores_categoria_sabor_id_fkey
    FOREIGN KEY (categoria_sabor_id)
    REFERENCES public.produto_categorias_sabor(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Índice de performance ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS produto_categorias_sabor_produto_id_idx
  ON public.produto_categorias_sabor (produto_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.produto_categorias_sabor ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "publico_le_categorias_sabor" ON public.produto_categorias_sabor
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "empresa_gerencia_categorias_sabor" ON public.produto_categorias_sabor
    FOR ALL USING (
      produto_id IN (SELECT id FROM public.produtos WHERE empresa_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
