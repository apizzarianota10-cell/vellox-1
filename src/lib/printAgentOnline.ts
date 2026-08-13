import { createClient } from "@/lib/supabase/client";

// Considera o agente online se o heartbeat (agent_last_seen) foi atualizado
// recentemente — usado tanto pelo Print Agent (Electron, HTTP :7532) quanto
// pelo servidor.ps1 (PowerShell), que só faz ping via RPC, sem HTTP local.
const HEARTBEAT_FRESH_MS = 30_000;

export async function checkAgentOnlineViaDb(empresaId: string): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("configuracoes_print_agent")
      .select("agent_last_seen")
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (!data?.agent_last_seen) return false;
    return Date.now() - new Date(data.agent_last_seen).getTime() < HEARTBEAT_FRESH_MS;
  } catch {
    return false;
  }
}
