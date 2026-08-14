import { createClient } from "@/lib/supabase/server";
import MonitorShell from "./MonitorShell";
import UpgradeWall from "@/components/UpgradeWall";
import DbError from "@/components/DbError";
import type { Plano } from "@/types";

export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: empresaData } = await supabase
    .from("empresas")
    .select("nome, plano")
    .eq("id", user.id)
    .single();

  const plano = (empresaData?.plano ?? "basic") as Plano;

  if (plano === "basic") {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px" }}>
        <UpgradeWall
          recurso="Monitor de Pedidos"
          descricao="Exiba os pedidos em tempo real em uma TV ou tela de cozinha. Ideal para organizar o fluxo sem papel e sem grito. Disponível no plano Pro e Business."
          planoNecessario="pro"
          planoAtual={plano}
        />
      </div>
    );
  }

  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);

  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select("id, empresa_id, cliente_nome, cliente_telefone, tipo_pedido, descricao_itens, observacoes, endereco_entrega, bairro, forma_pagamento, valor_pedido, valor_motoboy, troco_para, status, created_at, updated_at")
    .eq("empresa_id", user.id)
    .gte("created_at", inicioDia.toISOString())
    .order("created_at", { ascending: true });

  if (error) return <DbError message="Erro ao carregar o monitor. Tente novamente." />;

  return (
    <MonitorShell
      initialPedidos={pedidos ?? []}
      empresaId={user.id}
      empresaNome={empresaData?.nome ?? ""}
    />
  );
}
