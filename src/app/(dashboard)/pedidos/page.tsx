import { createClient } from "@/lib/supabase/server";
import PedidosClient from "./PedidosClient";
import DbError from "@/components/DbError";
import type { Pedido, Produto } from "@/types";

export default async function PedidosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [pedidosRes, empresaRes, produtosRes, configRes] = await Promise.all([
    supabase
      .from("pedidos")
      .select("*, motoboy:motoboys(*)")
      .eq("empresa_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("empresas")
      .select("nome, codigo, lat, lng, cidade, estado, despacho_automatico")
      .eq("id", user!.id)
      .single(),
    supabase
      .from("produtos")
      .select("*, produto_variacoes(*), produto_sabores(*), produto_adicionais(*), produto_categorias_sabor(*), categoria_preco:categorias_preco!categoria_preco_id(*, tamanhos:categorias_preco_tamanhos(*))")
      .eq("empresa_id", user!.id)
      .eq("ativo", true)
      .order("categoria")
      .order("ordem")
      .order("created_at"),
    supabase
      .from("configuracao_loja")
      .select("cor_principal, modo_calculo_pizza")
      .eq("empresa_id", user!.id)
      .single(),
  ]);

  if (pedidosRes.error) return <DbError message="Erro ao carregar pedidos. Verifique sua conexão e tente novamente." />;

  const empresa = empresaRes.data;

  return (
    <PedidosClient
      pedidos={(pedidosRes.data ?? []) as Pedido[]}
      empresaId={user!.id}
      empresaNome={empresa?.nome ?? ""}
      empresaCodigo={empresa?.codigo ?? ""}
      empresaLat={empresa?.lat ?? null}
      empresaLng={empresa?.lng ?? null}
      empresaCidade={empresa?.cidade ?? null}
      empresaEstado={empresa?.estado ?? null}
      autoDespacho={empresa?.despacho_automatico ?? false}
      produtos={(produtosRes.data ?? []) as Produto[]}
      modoCalculo={(configRes.data?.modo_calculo_pizza ?? "maior_valor") as "maior_valor" | "proporcional"}
      corPrincipal={configRes.data?.cor_principal ?? "#E4002B"}
    />
  );
}
