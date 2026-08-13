import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

// Igual a /api/print-server/config, mas devolve JSON (pra exibir na tela com
// botão de copiar) em vez de forçar download de arquivo — o download por
// navegador se mostrou frágil (nome de arquivo duplicado, sessão deslogada
// passando despercebida, etc.), então agora a instalação usa copiar/colar.
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

  const { data: existing } = await supabase
    .from("configuracoes_print_agent")
    .select("agent_token")
    .eq("empresa_id", empresa.id)
    .maybeSingle();

  const agentToken = existing?.agent_token ?? crypto.randomBytes(24).toString("hex");

  const { error: upsertErr } = await supabase
    .from("configuracoes_print_agent")
    .upsert({ empresa_id: empresa.id, agent_token: agentToken }, { onConflict: "empresa_id" });

  if (upsertErr) {
    console.error("Erro ao salvar agent_token:", upsertErr);
    return NextResponse.json({ error: "Erro ao preparar credenciais: " + upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    empresa_id:   empresa.id,
    empresa_nome: empresa.nome,
    agent_token:  agentToken,
  });
}
