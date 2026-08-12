import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

function createAgentJWT(empresaId: string, empresaEmail: string): string {
  // SUPABASE_JWT_SECRET: encontrado no dashboard Supabase → Settings → API → JWT Settings
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_SECRET não configurado. Adicione a variável de ambiente no .env.local:\n" +
      "SUPABASE_JWT_SECRET=<valor do Supabase Dashboard → Settings → API → JWT Settings → JWT Secret>"
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: empresaId,
    role: "authenticated",
    aud: "authenticated",
    iss: "supabase",
    email: empresaEmail,
    iat: now,
    exp: now + 60 * 60 * 24 * 365 * 10, // 10 anos
  })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, nome, email, cnpj")
    .eq("id", user.id)
    .single();

  if (!empresa) return NextResponse.json({ error: "Empresa nao encontrada" }, { status: 404 });

  let agentToken: string;
  try {
    agentToken = createAgentJWT(empresa.id, empresa.email);
  } catch (e) {
    return NextResponse.json(
      { error: (e instanceof Error ? e.message : "Erro ao gerar token do agente") },
      { status: 500 }
    );
  }

  // Persiste o token na tabela para referência
  await supabase
    .from("configuracoes_print_agent")
    .upsert({ empresa_id: empresa.id, agent_token: agentToken }, { onConflict: "empresa_id" });

  const config = {
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabase_anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    empresa_id: empresa.id,
    empresa_nome: empresa.nome,
    empresa_cnpj: empresa.cnpj ?? "",
    agent_token: agentToken,
    agent_port: 7532,
    version: "1.0.0",
  };

  return new NextResponse(JSON.stringify(config, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="vellox-agent-config.json"',
    },
  });
}
