import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AutomacoesClient from "./AutomacoesClient";

export default async function AutomacoesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, nome")
    .eq("id", user.id)
    .single();

  if (!empresa) redirect("/dashboard");

  const { data: config } = await supabase
    .from("configuracao_loja")
    .select("telefone_contato, whatsapp_instance_id, whatsapp_token")
    .eq("empresa_id", user.id)
    .single();

  const { data: printAgent } = await supabase
    .from("configuracoes_print_agent")
    .select("agent_last_seen")
    .eq("empresa_id", user.id)
    .single();

  return (
    <AutomacoesClient
      empresaId={empresa.id}
      initialConfig={config ?? null}
      printAgentOnline={
        printAgent?.agent_last_seen
          ? Date.now() - new Date(printAgent.agent_last_seen).getTime() < 30_000
          : false
      }
    />
  );
}
