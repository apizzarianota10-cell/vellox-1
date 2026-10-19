import { createClient } from "@/lib/supabase/server";
import DbError from "@/components/DbError";
import EstoqueClient from "./EstoqueClient";
import {
  PRODUTO_ESTOQUE_SELECT, MOVIMENTO_SELECT, isErroMigracaoPendente,
  type ProdutoEstoque, type MovimentoEstoque,
} from "@/lib/estoque";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [produtosRes, movRes] = await Promise.all([
    supabase
      .from("produtos")
      .select(PRODUTO_ESTOQUE_SELECT)
      .eq("empresa_id", user.id)
      .order("categoria")
      .order("ordem")
      .order("created_at"),
    supabase
      .from("estoque_movimentos")
      .select(MOVIMENTO_SELECT)
      .eq("empresa_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const erro = produtosRes.error ?? movRes.error;

  // Migração (schema_v67) ainda não rodou → página explica o que fazer.
  if (erro && isErroMigracaoPendente(erro)) {
    return <EstoqueClient empresaId={user.id} initialProdutos={[]} initialMovimentos={[]} migracaoPendente />;
  }
  if (erro) return <DbError message="Erro ao carregar o estoque. Tente novamente." />;

  return (
    <EstoqueClient
      empresaId={user.id}
      initialProdutos={(produtosRes.data ?? []) as unknown as ProdutoEstoque[]}
      initialMovimentos={(movRes.data ?? []) as unknown as MovimentoEstoque[]}
    />
  );
}
