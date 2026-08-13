import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, nome")
    .eq("id", user.id)
    .single();

  if (!empresa) return NextResponse.json({ error: "Empresa nao encontrada" }, { status: 404 });

  // Reaproveita o token existente ou gera um novo — é o que valida o acesso
  // aos pedidos da empresa via a RPC get_pedidos_pendentes_agent (sem precisar
  // de RLS aberta na tabela pedidos, que tem dados de clientes).
  const { data: existing } = await supabase
    .from("configuracoes_print_agent")
    .select("agent_token")
    .eq("empresa_id", empresa.id)
    .maybeSingle();

  const agentToken = existing?.agent_token ?? crypto.randomBytes(24).toString("hex");

  await supabase
    .from("configuracoes_print_agent")
    .upsert({ empresa_id: empresa.id, agent_token: agentToken }, { onConflict: "empresa_id" });

  const config = {
    supabase_url:      process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabase_anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    empresa_id:        empresa.id,
    empresa_nome:      empresa.nome,
    agent_token:       agentToken,
    printer_name:      "",
    tamanho_papel:     "80mm",
  };

  return new NextResponse(JSON.stringify(config, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="config.json"',
    },
  });
}
