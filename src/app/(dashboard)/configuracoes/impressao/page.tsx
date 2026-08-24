import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ImpressaoClient from "./ImpressaoClient";

export default async function ImpressaoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, nome, cnpj")
    .eq("id", user.id)
    .single();

  if (!empresa) redirect("/dashboard");

  const { data: printConfig } = await supabase
    .from("configuracoes_print_agent")
    .select("ativo, impressora_nome, tamanho_papel, agent_last_seen, layout")
    .eq("empresa_id", user.id)
    .single();

  return (
    <ImpressaoClient
      empresa={empresa as { id: string; nome: string; cnpj: string | null }}
      initialConfig={printConfig ?? null}
    />
  );
}
