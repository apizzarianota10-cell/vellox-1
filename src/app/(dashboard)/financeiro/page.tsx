import { createClient } from "@/lib/supabase/server";
import type { Pedido, Motoboy } from "@/types";
import FinanceiroClient from "./FinanceiroClient";
import FinanceiroGate from "./FinanceiroGate";
import DbError from "@/components/DbError";

export default async function FinanceiroPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: empresa } = await supabase
    .from("empresas")
    .select("senha_financeiro")
    .eq("id", user.id)
    .single();

  // Proteção por senha é opt-in (configurada em Configurações) — se a
  // empresa nunca ativou, segue exatamente como sempre foi.
  if (empresa?.senha_financeiro) {
    return <FinanceiroGate />;
  }

  const [pedidosRes, motoboysRes] = await Promise.all([
    supabase
      .from("pedidos")
      .select("*, motoboy:motoboys(id, nome)")
      .eq("empresa_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("motoboys")
      .select("id, nome")
      .eq("empresa_id", user!.id),
  ]);

  if (pedidosRes.error) return <DbError message="Erro ao carregar o relatório financeiro. Tente novamente." />;

  return (
    <FinanceiroClient
      pedidos={(pedidosRes.data ?? []) as Pedido[]}
      motoboys={(motoboysRes.data ?? []) as Motoboy[]}
    />
  );
}
