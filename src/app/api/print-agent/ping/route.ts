import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/print-agent/ping
// Chamado pelo painel para verificar se o agente está online (via proxy reverso)
// O agente real fica em localhost:7532, mas o painel checa o campo agent_last_seen no DB.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("configuracoes_print_agent")
    .select("ativo, impressora_nome, tamanho_papel, agent_last_seen")
    .eq("empresa_id", user.id)
    .single();

  const lastSeen = data?.agent_last_seen ? new Date(data.agent_last_seen) : null;
  const online = lastSeen
    ? Date.now() - lastSeen.getTime() < 30_000  // online se ping < 30s
    : false;

  return NextResponse.json({
    configured: !!data,
    online,
    ativo: data?.ativo ?? false,
    impressora_nome: data?.impressora_nome ?? null,
    tamanho_papel: data?.tamanho_papel ?? "80mm",
    agent_last_seen: data?.agent_last_seen ?? null,
  });
}
